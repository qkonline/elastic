// One per account: the plan (every day, repeating task, goal, review and the shared settings),
// plus the account's devices and the alerts to send them.
//
// Each record is kept as its paths, each with the moment it was set (shared/lww.ts). Each
// signed-in device keeps a WebSocket open while the app is open and sends what it changed, as
// paths; they're merged in (the later setting of each path wins, so nothing is ever refused for
// being out of date) and what that changed goes straight out to the other devices. Every record
// changed gets the next number in one sequence (`rev`), so a device coming back asks for
// everything after the last number it saw. Records from before paths (16 Oct to 24 Oct 2026)
// read as set at ZERO, older than any change.
//
// Alerts: the devices keep the account's list of upcoming alerts up to date (time's up, heads-
// ups). When one is due, every device with notifications on gets an empty push, except one
// that has the app open in front of it (it rings by itself). The service worker then asks
// `dueAlerts()` what to show.

import { DurableObject } from 'cloudflare:workers';
import { fromPaths, merge, newer, type Paths, toPaths, ZERO } from '../../shared/lww';
import { liveSessions } from './auth';
import { type AlertGroup, alertGroups, isPushEndpoint, patches, type RecordKind } from './checks';
import { sendPush } from './push';
import type { VapidKeys } from './vapid';

/** What the object needs from the worker's settings. */
export interface AccountEnv extends VapidKeys {
  /** The accounts database, to check that a connection's session still exists (absent in some tests). */
  DB?: D1Database;
}

/** A record (or what changed in it) as it goes out to devices. */
interface Rec {
  kind: RecordKind;
  key: string;
  rev: number;
  paths: Paths;
}

/** The WebSocket subprotocol (src/lib/sync.ts). */
export const PROTOCOL = 'elastic-day-2';

/** What each WebSocket remembers across the object sleeping. */
interface Attachment {
  device: string | null;
  visible: boolean;
  /** Last heard from (ms). */
  at: number;
  /** The hash of the session it was opened with (connections from before 29 Oct 2026 have none). */
  session?: string;
  /** When that session was last found to still exist. */
  checked?: number;
  /** Puts in the current minute, and when that minute began. */
  puts?: number;
  since?: number;
}

/** The header the worker passes a connection's session hash in. */
export const SESSION_HEADER = 'x-elastic-session';

/** A device whose app is open stops counting as watching after this long without a word. */
const WATCHING_MS = 45_000;
/** Big first syncs go out in pieces of about this size. */
const CHUNK = 400_000;
export const MAX_RECORDS = 20_000;
/**
 * How much an account may hold, counting every stored record (deletions too) as its paths, the
 * record built from them and its key. A year of busy days is a few megabytes.
 */
export const MAX_BYTES = 50 * 1024 * 1024;
/** What a stored row costs beyond its text. */
const ROW_BYTES = 100;
/**
 * Puts one connection may send in a minute. The app sends one at a time and waits for its ack,
 * so only a first sync of a big plan, sent a record at a time, comes near it.
 */
export const PUTS_A_MINUTE = 600;
/** A connection's session is checked again before anything goes out to it once this old. */
const SESSION_CHECK_MS = 60_000;
/** A device the account hasn't heard from in this long is forgotten. */
const DEVICE_IDLE_MS = 90 * 24 * 3600_000;

type Row = {
  kind: RecordKind;
  key: string;
  rev: number;
  data: string | null;
  paths: string | null;
};

/** What a stored record takes up, as MAX_BYTES counts it. */
const size = (key: string, paths: string | null, data: string | null) =>
  key.length + (paths?.length ?? 0) + (data?.length ?? 0) + ROW_BYTES;

/** A stored record's paths (one from before paths: its data, as set at ZERO). */
function pathsOf(r: Row): Paths {
  if (r.paths) return JSON.parse(r.paths) as Paths;
  if (r.data == null) return { _: [null, ZERO] };
  return toPaths(r.kind, JSON.parse(r.data));
}

export class Account extends DurableObject<AccountEnv> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: AccountEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.tables();
    // Keep-alives are answered without waking the object; their time still counts (watching()).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private tables(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, key TEXT NOT NULL, rev INTEGER NOT NULL, data TEXT,
        PRIMARY KEY (kind, key));
      CREATE INDEX IF NOT EXISTS records_rev ON records (rev);
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, endpoint TEXT, seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `);
    // Since 24 Oct 2026: each record's paths (`data` is the record built from them).
    if (
      !this.sql
        .exec('PRAGMA table_info(records)')
        .toArray()
        .some((c) => c.name === 'paths')
    )
      this.sql.exec('ALTER TABLE records ADD COLUMN paths TEXT');
  }

  // ---------- connections ----------

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade') !== 'websocket') return new Response(null, { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const now = Date.now();
    // The worker checked the session a moment ago.
    const session = req.headers.get(SESSION_HEADER) ?? undefined;
    server.serializeAttachment({ device: null, visible: false, at: now, session, checked: now } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client, headers: { 'sec-websocket-protocol': PROTOCOL } });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    att.at = Date.now();
    switch (m.t) {
      case 'hello':
        // What it asks for goes out only to a session that still exists.
        if (!(await this.stillSignedIn(ws))) return;
        att.checked = (ws.deserializeAttachment() as Attachment).checked;
        att.device = typeof m.device === 'string' && m.device.length <= 64 ? m.device : null;
        att.visible = !!m.visible;
        if (att.device && 'endpoint' in m) this.setDevice(att.device, m.endpoint);
        ws.serializeAttachment(att);
        this.sendSince(ws, Number.isInteger(m.since) ? (m.since as number) : 0);
        return;
      case 'put': {
        // Too many at once: the connection closes as if dropped, and the app connects again
        // after a pause and sends what the account hasn't acknowledged. Nothing is lost, as it
        // would be with a refusal (a refused record is dropped, see sync.ts).
        if (att.since === undefined || att.at - att.since > 60_000) {
          att.since = att.at;
          att.puts = 0;
        }
        att.puts = (att.puts ?? 0) + 1;
        ws.serializeAttachment(att);
        if (att.puts > PUTS_A_MINUTE) return this.hangUp(ws, 1013, 'Slow down');
        // Nothing is taken from a session that has ended (signed out, or out elsewhere).
        if (!(await this.stillSignedIn(ws, true))) return;
        const res = this.put(m.recs, m.bulk === true);
        const ack = res ? (res.full.length ? { full: res.full } : {}) : { error: 'bad' };
        ws.send(JSON.stringify({ t: 'ack', id: m.id, ...ack }));
        if (res?.changed.length) await this.broadcast(res.changed, ws);
        return;
      }
      case 'state':
        att.visible = !!m.visible;
        ws.serializeAttachment(att);
        // A device coming back to the front is a good moment to see it's still signed in.
        await this.stillSignedIn(ws);
        return;
      case 'device':
        ws.serializeAttachment(att);
        if (att.device) this.setDevice(att.device, m.endpoint);
        return;
      case 'alerts':
        ws.serializeAttachment(att);
        await this.setAlerts(m.groups);
        return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'Closed');
    } catch {
      /* already closed */
    }
  }

  /** Everything after `since`, oldest first, in pieces; the last piece says how far that got. */
  private sendSince(ws: WebSocket, since: number): void {
    const rev = this.rev();
    let recs: Rec[] = [];
    let size = 0;
    for (const r of this.sql.exec<Row>(
      'SELECT kind, key, rev, data, paths FROM records WHERE rev > ? ORDER BY rev',
      since,
    )) {
      const paths = pathsOf(r);
      recs.push({ kind: r.kind, key: r.key, rev: r.rev, paths });
      size += JSON.stringify(paths).length + 100;
      if (size > CHUNK) {
        ws.send(JSON.stringify({ t: 'changes', recs, more: true }));
        recs = [];
        size = 0;
      }
    }
    ws.send(JSON.stringify({ t: 'changes', recs, rev, done: true }));
  }

  private async broadcast(recs: Rec[], except: WebSocket | null): Promise<void> {
    const msg = JSON.stringify({ t: 'changes', recs, rev: this.rev() });
    // Not to a session that has ended since it was last checked.
    await this.checkSessions();
    for (const ws of this.ctx.getWebSockets()) {
      // Not before its hello: a device saves the rev of what it's sent as how far it has got, and
      // this would take it past records its catch-up hasn't brought yet.
      if (ws === except || !(ws.deserializeAttachment() as Attachment).device) continue;
      try {
        ws.send(msg);
      } catch {
        /* gone; it will catch up when it reconnects */
      }
    }
  }

  // ---------- records ----------

  private rev(): number {
    const row = this.sql.exec<{ v: string }>("SELECT v FROM kv WHERE k = 'rev'").toArray()[0];
    return row ? Number(row.v) : 0;
  }

  /** What the account holds, as MAX_BYTES counts it (worked out once, then kept up to date). */
  private bytes(): number {
    const row = this.sql.exec<{ v: string }>("SELECT v FROM kv WHERE k = 'bytes'").toArray()[0];
    if (row) return Number(row.v);
    return this.sql
      .exec<{ n: number }>(
        `SELECT COALESCE(SUM(LENGTH(key) + COALESCE(LENGTH(paths), 0) + COALESCE(LENGTH(data), 0) + ${ROW_BYTES}), 0) AS n FROM records`,
      )
      .one().n;
  }

  /**
   * Merge in what a device changed. A record whose merge changes it gets the next rev, and what
   * changed goes to the other devices. New records past the account's limit, and changes that
   * would take it past MAX_BYTES, aren't kept, and the device is told (`full`: the app keeps them
   * and says the account is full). Null: something in it is off, or it deletes too much at once
   * (below).
   */
  private put(raw: unknown, bulk = false): { changed: Rec[]; full: { kind: RecordKind; key: string }[] } | null {
    const list = patches(raw);
    if (!list) return null;
    if (!bulk && !this.deletionsAllowed(list)) return null;
    const changed: Rec[] = [];
    const full: { kind: RecordKind; key: string }[] = [];
    let rev = this.rev();
    let count: number | null = null;
    this.ctx.storage.transactionSync(() => {
      let bytes = this.bytes();
      for (const c of list) {
        const row = this.sql
          .exec<Row>('SELECT kind, key, rev, data, paths FROM records WHERE kind = ? AND key = ?', c.kind, c.key)
          .toArray()[0];
        const deleting = c.paths._?.[0] === null;
        if (!row && !deleting) {
          // Deletions are kept (as data: null) but don't count.
          count ??= this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE data IS NOT NULL').one().n;
          if (count++ >= MAX_RECORDS) {
            full.push({ kind: c.kind, key: c.key });
            continue;
          }
        }
        // A record the account never had, deleted: all there is to keep is that it's gone.
        const incoming: Paths = !row && deleting ? { _: c.paths._ } : c.paths;
        const cur = row ? pathsOf(row) : {};
        const news = newer(cur, incoming);
        if (!Object.keys(news).length) continue;
        const paths = merge(cur, incoming);
        const doc = fromPaths(c.kind, c.key, paths);
        const pathsText = JSON.stringify(paths);
        const dataText = doc == null ? null : JSON.stringify(doc);
        const grows = size(c.key, pathsText, dataText) - (row ? size(row.key, row.paths, row.data) : 0);
        if (grows > 0 && bytes + grows > MAX_BYTES) {
          full.push({ kind: c.kind, key: c.key });
          continue;
        }
        bytes += grows;
        rev++;
        this.sql.exec(
          'INSERT INTO records (kind, key, rev, data, paths) VALUES (?, ?, ?, ?, ?) ON CONFLICT (kind, key) DO UPDATE SET rev = excluded.rev, data = excluded.data, paths = excluded.paths',
          c.kind,
          c.key,
          rev,
          dataText,
          pathsText,
        );
        // The whole record goes out: a device that hasn't got it yet can't build it from a part.
        changed.push({ kind: c.kind, key: c.key, rev, paths });
      }
      this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('rev', ?)", String(rev));
      this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('bytes', ?)", String(bytes));
    });
    return { changed, full };
  }

  /**
   * A burst of deletions of much of the account is refused, unless the device says it's meant
   * (Erase everything, Import): on 23 Oct 2026 a device signing in again sent its whole plan as
   * deletions and wiped the account. Deletions of records the account has, counted over an hour,
   * may reach 10 or a fifth of what it holds, whichever is more. A refused put is sent again one
   * record at a time and each refused deletion dropped (sync.ts), so the account keeps its copy.
   */
  private deletionsAllowed(list: { kind: string; key: string; paths: Paths }[]): boolean {
    const now = Date.now();
    const dels = list.filter(
      (c) =>
        c.paths._?.[0] === null &&
        this.sql.exec('SELECT 1 FROM records WHERE kind = ? AND key = ? AND data IS NOT NULL', c.kind, c.key).toArray()
          .length,
    ).length;
    if (!dels) return true;
    const row = this.sql.exec<{ v: string }>("SELECT v FROM kv WHERE k = 'deletes'").toArray()[0];
    let win = row ? (JSON.parse(row.v) as { n: number; since: number }) : { n: 0, since: now };
    if (now - win.since > 3_600_000) win = { n: 0, since: now };
    const live = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE data IS NOT NULL').one().n;
    if (win.n + dels > Math.max(10, Math.ceil(live / 5))) return false;
    this.sql.exec(
      "INSERT OR REPLACE INTO kv (k, v) VALUES ('deletes', ?)",
      JSON.stringify({ n: win.n + dels, since: win.since }),
    );
    return true;
  }

  // ---------- sessions ----------

  /** Close a connection, whatever state it's in. */
  private hangUp(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  /**
   * Whether this connection's session still exists (checked again once it's a minute old, or
   * now when `now`). One that has ended is told it's signed out (the app forgets its sign-in, as
   * when its token is refused) and closed. A connection from before sessions were noted on it
   * is closed to come back with one.
   */
  private async stillSignedIn(ws: WebSocket, now = false): Promise<boolean> {
    const att = ws.deserializeAttachment() as Attachment;
    if (!this.env.DB) return true;
    if (!att.session) {
      this.hangUp(ws, 1012, 'Connect again');
      return false;
    }
    if (!now && Date.now() - (att.checked ?? 0) < SESSION_CHECK_MS) return true;
    return !(await this.checkSessions(true, [ws])).has(ws);
  }

  /**
   * Check the sessions of these connections (all of them unless said; only ones not checked in
   * the last minute unless `all`), and close those whose session has gone.
   */
  async checkSessions(all = false, only?: WebSocket[]): Promise<Set<WebSocket>> {
    const closed = new Set<WebSocket>();
    if (!this.env.DB) return closed;
    const now = Date.now();
    const due = (only ?? this.ctx.getWebSockets()).filter((ws) => {
      const att = ws.deserializeAttachment() as Attachment;
      return all || !att.session || now - (att.checked ?? 0) >= SESSION_CHECK_MS;
    });
    if (!due.length) return closed;
    const hashes = [
      ...new Set(due.map((ws) => (ws.deserializeAttachment() as Attachment).session).filter((h) => !!h)),
    ] as string[];
    const live = hashes.length ? await liveSessions(this.env as Required<AccountEnv>, hashes) : new Set<string>();
    for (const ws of due) {
      const att = ws.deserializeAttachment() as Attachment;
      if (att.session && live.has(att.session)) {
        ws.serializeAttachment({ ...att, checked: now });
        continue;
      }
      closed.add(ws);
      if (!att.session) {
        this.hangUp(ws, 1012, 'Connect again');
        continue;
      }
      try {
        ws.send(JSON.stringify({ t: 'signedout' }));
      } catch {
        /* gone already */
      }
      this.hangUp(ws, 1000, 'Signed out');
    }
    return closed;
  }

  /**
   * Signed out on the other devices: their connections close now, and the account stops pushing
   * to every device but `device` (this one), since none of the others is signed in any more.
   */
  async signedOutOthers(device: string | null): Promise<void> {
    if (device) this.sql.exec('DELETE FROM devices WHERE id != ?', device);
    await this.checkSessions(true);
  }

  // ---------- devices & alerts ----------

  /** A device signed out: no more pushes for this account, and its connection closes. */
  async forget(device: string): Promise<void> {
    this.sql.exec('DELETE FROM devices WHERE id = ?', device);
    for (const ws of this.ctx.getWebSockets())
      if ((ws.deserializeAttachment() as Attachment).device === device)
        try {
          ws.close(1000, 'Signed out');
        } catch {
          /* already closed */
        }
  }

  private setDevice(id: string, endpoint: unknown): void {
    const now = Date.now();
    this.sql.exec('DELETE FROM devices WHERE seen < ?', now - DEVICE_IDLE_MS);
    this.sql.exec(
      'INSERT OR REPLACE INTO devices (id, endpoint, seen) VALUES (?, ?, ?)',
      id,
      isPushEndpoint(endpoint) ? endpoint : null,
      now,
    );
  }

  private alerts(): (AlertGroup & { sent?: boolean })[] {
    const row = this.sql.exec<{ v: string }>("SELECT v FROM kv WHERE k = 'alerts'").toArray()[0];
    return row ? JSON.parse(row.v) : [];
  }

  private async setAlerts(raw: unknown): Promise<void> {
    const groups = alertGroups(raw);
    if (!groups) return;
    // Keep the last hour of past alerts, so a push that arrives late still finds what it was for.
    const now = Date.now();
    const past = this.alerts().filter((g) => g.at <= now && g.at > now - 3600_000);
    const plan = [...past, ...groups.filter((g) => g.at > now)];
    this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('alerts', ?)", JSON.stringify(plan));
    await this.armAlarm(plan);
  }

  private async armAlarm(plan: (AlertGroup & { sent?: boolean })[]): Promise<void> {
    const next = plan.find((g) => !g.sent);
    if (next) await this.ctx.storage.setAlarm(Math.max(next.at, Date.now()));
    else await this.ctx.storage.deleteAlarm();
  }

  /** Whether this device has the app open in front of someone right now. */
  private watching(device: string, now: number): boolean {
    return this.ctx.getWebSockets().some((ws) => {
      const att = ws.deserializeAttachment() as Attachment;
      if (att.device !== device || !att.visible) return false;
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      return Math.max(att.at, pinged) > now - WATCHING_MS;
    });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const plan = this.alerts();
    const due = plan.filter((g) => !g.sent && g.at <= now + 1000);
    for (const g of due) g.sent = true;
    this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('alerts', ?)", JSON.stringify(plan));
    await this.armAlarm(plan);
    if (!due.length) return;
    const devices = this.sql
      .exec<{ id: string; endpoint: string }>('SELECT id, endpoint FROM devices WHERE endpoint IS NOT NULL')
      .toArray();
    await Promise.all(
      devices
        .filter((d) => !this.watching(d.id, now))
        .map(async (d) => {
          if ((await sendPush(d.endpoint, this.env).catch(() => 'failed')) === 'gone')
            this.sql.exec('UPDATE devices SET endpoint = NULL WHERE id = ?', d.id);
        }),
    );
  }

  // ---------- called by the worker ----------

  /** For the service worker: alerts due now (or a little early), and the last hour's. */
  async dueAlerts(): Promise<AlertGroup[]> {
    const now = Date.now();
    return this.alerts()
      .filter((g) => g.at <= now + 30_000 && g.at > now - 3600_000)
      .map(({ at, notes }) => ({ at, notes }));
  }

  /**
   * What a device sends as it goes into the background, when its WebSocket may not get the
   * chance: its last changes, that it's out of sight, and the alerts to come.
   */
  async beacon(device: string, body: { recs?: unknown; visible?: unknown; alerts?: unknown; endpoint?: unknown }) {
    if (body.recs) {
      const res = this.put(body.recs);
      if (res?.changed.length) await this.broadcast(res.changed, null);
    }
    if ('endpoint' in body) this.setDevice(device, body.endpoint);
    if ('visible' in body)
      for (const ws of this.ctx.getWebSockets()) {
        const att = ws.deserializeAttachment() as Attachment;
        if (att.device === device) ws.serializeAttachment({ ...att, visible: !!body.visible });
      }
    if (body.alerts) await this.setAlerts(body.alerts);
  }

  async info(): Promise<{ records: number }> {
    return {
      records: this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE data IS NOT NULL').one().n,
    };
  }

  /** The account can't sync for now: send no more alerts until it can. */
  async pause(): Promise<void> {
    this.sql.exec("DELETE FROM kv WHERE k = 'alerts'");
    await this.ctx.storage.deleteAlarm();
  }

  /** Boardo says this account's project cards changed: the open devices fetch them. */
  async boardoChanged(): Promise<void> {
    const msg = JSON.stringify({ t: 'boardo' });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        /* gone; it fetches them when it reconnects */
      }
    }
  }

  /** The account is being deleted: drop everything and close every connection. */
  async erase(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) ws.close(4001, 'Account deleted');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    // This instance can still be asked something (a device a moment behind): empty, not broken.
    this.tables();
  }
}
