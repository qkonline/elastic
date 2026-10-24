// Keeping this device's plan and the account's the same, while signed in.
//
// Every change saved here is noted in the outbox (db.ts) in the same transaction, so nothing is
// lost if the app closes before it goes out. While the app is open, one tab per device (the one
// holding the 'elastic-day-sync' lock) keeps a WebSocket to the account (worker/src/account.ts):
// it sends what's in the outbox, each record with the version it was changed from, and takes in
// what other devices change. A change the account refuses (another device got in first) comes
// back with the account's version; the two are merged (merge.ts) and sent again. `synced` keeps
// the version last agreed for each record: the base for those merges.
//
// Settings: only the ones about how days work are shared. Theme, sound and notifications belong
// to each device.

import type { Session } from './account';
import { normalizeDay, normalizeGoal, normalizeReview, normalizeSeries, normalizeSettings } from './backup';
import * as db from './db';
import { type RecordKind, recId } from './db';
import { mergeDay, mergeSeries, mergeSettings } from './merge';
import type { AlertGroup } from './reminders';
import type { Day, Series, Settings } from './types';

/** 'paused': the account has no name or email yet, so it doesn't sync until it has. */
export type SyncStatus = 'off' | 'connecting' | 'live' | 'offline' | 'paused' | 'full';

/** The settings shared across an account's devices. */
export const SHARED_SETTINGS = [
  'clock24',
  'showTimes',
  'fixedLead',
  'defStart',
  'defWrap',
  'dayLength',
  'flexStart',
  'reviewDay',
  'reviewAt',
] as const;
type Shared = Pick<Settings, (typeof SHARED_SETTINGS)[number]>;

export interface SyncHooks {
  /** Save edits still held in memory, so they're in the outbox before anything is merged. */
  flush(): Promise<void>;
  /** These records (recId) changed from the account: reload them. */
  changed(ids: string[]): void;
  status(s: SyncStatus): void;
  /** The account refused this device's token (signed out elsewhere, or the account was deleted). */
  signedOut(): void;
  /** Notifications still to come, for the account to send to every device. */
  alerts(): AlertGroup[];
  /** This device's push address, when notifications are on here. */
  endpoint(): string | null;
  /** The account's Boardo cards changed (or its link did): fetch them again. */
  boardo?(): void;
}

interface Remote {
  kind: RecordKind;
  key: string;
  rev: number;
  data: unknown;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const BACKOFF = [1, 2, 5, 10, 30].map((s) => s * 1000);
const PING_MS = 20_000;
/** A connection that hasn't answered a ping, or opened, in this long is given up on. */
const ANSWER_MS = 10_000;
const OPEN_MS = 15_000;
const BATCH = 100;
const BATCH_BYTES = 400_000;

function split(id: string): [RecordKind, string] {
  const i = id.indexOf(':');
  return [id.slice(0, i) as RecordKind, id.slice(i + 1)];
}

/** What the account holds for a local record (null: there is none). */
export function shared(kind: RecordKind, local: unknown): unknown {
  if (local == null) return null;
  if (kind !== 'settings') return local;
  const s = local as Settings;
  return Object.fromEntries(SHARED_SETTINGS.map((k) => [k, s[k]]));
}

/** A record from the account checked like an import (null: deleted, or not readable). */
function clean(kind: RecordKind, key: string, data: unknown): unknown {
  if (data == null) return null;
  if (kind === 'day') {
    // A list of tasks in some other form isn't an empty day.
    if (!Array.isArray((data as { items?: unknown }).items)) return null;
    const d = normalizeDay(data);
    return d && d.key === key ? d : null;
  }
  if (kind === 'series') {
    const s = normalizeSeries(data, 0);
    return s && s.id === key ? s : null;
  }
  if (kind === 'goal') {
    const g = normalizeGoal(data);
    return g && g.id === key ? g : null;
  }
  if (kind === 'review') {
    const r = normalizeReview(data);
    return r && r.id === key ? r : null;
  }
  const s = normalizeSettings(data);
  return shared('settings', s);
}

/** Merge a record changed both here and on the account. Mine wins over a deletion. */
function merge(kind: RecordKind, base: unknown, mine: unknown, theirs: unknown): unknown {
  if (mine == null) return same(theirs, base) ? null : theirs;
  if (theirs == null) return mine;
  // In the same form as the account's (normalized), or fields only one side spells out read as changes.
  const day = (d: unknown) => (d == null ? null : (normalizeDay(d) ?? (d as Day)));
  if (kind === 'day') return mergeDay(day(base), day(mine)!, theirs as Day);
  if (kind === 'series') return mergeSeries(base as Series | null, mine as Series, theirs as Series);
  if (kind === 'goal' || kind === 'review')
    return mergeSettings(base as object | null, mine as object, theirs as object);
  return mergeSettings(base as Shared | null, mine as Shared, theirs as Shared);
}

export class Sync {
  private session: Session | null = null;
  private ws: WebSocket | null = null;
  private leader = false;
  private release: (() => void) | null = null;
  /** This tab's queued request for the lock, and a count that tells a stale request apart. */
  private waiting: AbortController | null = null;
  private claims = 0;
  /** The first catch-up after connecting has arrived; sending can start. */
  private ready = false;
  private inflight: { id: number; sent: Map<string, unknown> } | null = null;
  private putId = 0;
  private rev = 0;
  /** New records the account had no room for: not sent again until the next connection. */
  private full = new Set<string>();
  /** Records the account holds that this version couldn't read: id → the version first seen. */
  private held: Record<string, number> = {};
  private tries = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private chain: Promise<void> = Promise.resolve();
  /** Sending one record at a time (see the ack). */
  private solo = false;
  /** When the server was last heard from, and when it was last pinged. */
  private heard = 0;
  private pinged = 0;
  /** Which connection queued messages belong to: a dropped one's are left unhandled. */
  private gen = 0;
  private visible = true;
  private lastAlerts = '';
  private lastEndpoint: string | null | undefined = undefined;
  private online = () => this.reconnectNow();

  constructor(
    private url: string,
    private hooks: SyncHooks,
  ) {}

  get signedIn(): boolean {
    return !!this.session;
  }

  /** Start syncing for this session: note changes from now on, and connect if this tab leads. */
  async start(session: Session): Promise<void> {
    this.session = session;
    db.track(true, () => this.kick());
    this.rev = (await db.getMeta<number>('syncRev')) ?? 0;
    this.held = (await db.getMeta<Record<string, number>>('held')) ?? {};
    this.visible = typeof document === 'undefined' || !document.hidden;
    if (typeof addEventListener === 'function') addEventListener('online', this.online);
    this.hooks.status('connecting');
    this.claim(this.visible);
  }

  /**
   * One tab per device talks to the account; the others follow it through BroadcastChannel.
   * The tab in front takes the lead (`steal`): a browser can put a background tab to sleep while
   * it still holds the lock, and the others would wait on it for ever.
   */
  private claim(steal = false): void {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) {
      this.leader = true;
      this.connect();
      return;
    }
    this.waiting?.abort();
    const waiting = steal ? null : new AbortController();
    this.waiting = waiting;
    const n = ++this.claims;
    locks
      .request('elastic-day-sync', waiting ? { signal: waiting.signal } : { steal: true }, () => {
        if (!this.session || n !== this.claims) return;
        this.waiting = null;
        this.leader = true;
        this.connect();
        return new Promise<void>((r) => (this.release = r));
      })
      .catch(() => {
        // Called off here (a newer claim, or signed out), or another tab took the lead: follow
        // it, and wait to lead again.
        if (!this.session || n !== this.claims) return;
        this.leader = false;
        this.release = null;
        this.close();
        this.claim();
      });
  }

  stop(): void {
    this.session = null;
    db.track(false);
    this.leader = false;
    this.claims++;
    this.waiting?.abort();
    this.waiting = null;
    this.release?.();
    this.release = null;
    if (typeof removeEventListener === 'function') removeEventListener('online', this.online);
    this.close();
    this.hooks.status('off');
  }

  private close(): void {
    this.gen++;
    if (this.retry) clearTimeout(this.retry);
    if (this.ping) clearInterval(this.ping);
    this.retry = this.ping = null;
    const ws = this.ws;
    this.ws = null;
    this.ready = false;
    this.inflight = null;
    if (ws) {
      ws.onclose = ws.onmessage = ws.onopen = null;
      try {
        ws.close(1000);
      } catch {
        /* never opened */
      }
    }
  }

  private connect(): void {
    if (!this.session || !this.leader || this.ws) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url.replace(/^http/, 'ws') + '/sync', ['elastic-day', this.session.token]);
    } catch {
      return this.later();
    }
    this.ws = ws;
    this.hooks.status('connecting');
    // A connection can hang while opening (a network whose DNS answer can't be reached, say).
    setTimeout(() => this.ws === ws && ws.readyState !== 1 && this.drop(), OPEN_MS);
    ws.onopen = () => {
      this.heard = Date.now();
      this.pinged = 0;
      this.solo = false;
      this.full.clear();
      this.lastEndpoint = this.hooks.endpoint();
      this.send({
        t: 'hello',
        // From before the first record held back, so it comes again once it can be read.
        since: Math.min(this.rev, ...Object.values(this.held).map((r) => r - 1)),
        device: this.session!.device,
        visible: this.visible,
        endpoint: this.lastEndpoint,
      });
      this.ping = setInterval(() => this.visible && this.probe(), PING_MS);
    };
    ws.onmessage = (e) => {
      this.heard = Date.now();
      if (e.data === 'pong') return;
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const gen = this.gen;
      this.queue(() => (gen === this.gen ? this.onMessage(m) : Promise.resolve()));
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.ready = false;
      this.inflight = null;
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      if (e.code === 4001) return this.hooks.signedOut();
      this.hooks.status('offline');
      this.later();
    };
  }

  /**
   * Is the connection still there? One that stops answering (after a switch from Wi-Fi to mobile
   * data, or the app thawing after a while) can stay open for minutes as far as the browser
   * knows, with nothing getting through: ping it, and give up on it if the ping isn't answered.
   */
  private probe(): void {
    if (this.ws?.readyState !== 1) return;
    if (this.pinged > this.heard) {
      if (Date.now() - this.pinged > ANSWER_MS) this.drop();
      return;
    }
    this.pinged = Date.now();
    this.ws.send('ping');
  }

  /** Give up on this connection and make a new one. */
  private drop(): void {
    this.close();
    this.hooks.status('offline');
    this.later();
  }

  /** Try again after a pause that grows with each failure. */
  private later(): void {
    if (!this.session || !this.leader || this.retry) return;
    const wait = BACKOFF[Math.min(this.tries++, BACKOFF.length - 1)];
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, wait);
  }

  /** Pull to refresh: check the connection, or make one now, and catch up. */
  refresh(): void {
    if (this.ws) this.probe();
    else this.reconnectNow();
  }

  /** The account was set up (name and email): connect again straight away. */
  resume(): void {
    this.reconnectNow();
  }

  private reconnectNow(): void {
    if (!this.session || !this.leader || this.ws) return;
    this.tries = 0;
    this.connect();
  }

  private send(m: object): boolean {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  /** Messages are handled one at a time, in order (each one reads and writes IndexedDB). */
  private queue(fn: () => Promise<void>): void {
    this.chain = this.chain.then(fn).catch((e) => {
      // Something couldn't be read or saved (storage failing, say): start again from what was
      // saved, rather than carrying on past the changes that didn't make it.
      console.error('Sync', e);
      if (this.ws) this.drop();
    });
  }

  /** Wait for everything queued so far (tests). */
  settled(): Promise<void> {
    return this.chain;
  }

  private async onMessage(m: Record<string, unknown>): Promise<void> {
    if (m.t === 'signedout') {
      this.close();
      return this.hooks.signedOut();
    }
    // Changes still go in the outbox meanwhile, and go up once it's set up (resume()).
    if (m.t === 'setup') {
      this.close();
      return this.hooks.status('paused');
    }
    if (m.t === 'boardo') return this.hooks.boardo?.();
    if (m.t === 'changes') {
      await this.hooks.flush();
      const recs = (Array.isArray(m.recs) ? m.recs : []) as Remote[];
      const changed: string[] = [];
      for (const r of recs) {
        if (await this.take(r, false)) changed.push(recId(r.kind, r.key));
        this.rev = Math.max(this.rev, r.rev);
      }
      if (typeof m.rev === 'number') this.rev = Math.max(this.rev, m.rev);
      await db.putMeta('syncRev', this.rev);
      if (changed.length) this.hooks.changed(changed);
      if (m.done && !this.ready) {
        this.ready = true;
        this.tries = 0;
        this.hooks.status('live');
        this.lastAlerts = '';
        this.alertsChanged();
      }
      return this.sendOutbox();
    }
    if (m.t === 'ack' && this.inflight && m.id === this.inflight.id) {
      const { sent } = this.inflight;
      this.inflight = null;
      const changed: string[] = [];
      for (const ok of (m.ok ?? []) as { kind: RecordKind; key: string; rev: number }[]) {
        const id = recId(ok.kind, ok.key);
        const data = sent.get(id);
        const now = shared(ok.kind, await db.getRecord(ok.kind, ok.key));
        await db.putSyncedRecord(ok.kind, ok.key, undefined, { rev: ok.rev, data }, !same(now, data));
        this.rev = Math.max(this.rev, ok.rev);
      }
      for (const r of (m.conflicts ?? []) as Remote[]) if (await this.take(r, true)) changed.push(recId(r.kind, r.key));
      // The account is full: these stay here (still in the outbox) and it says so.
      const full = (m.full ?? []) as { kind: RecordKind; key: string }[];
      for (const f of full) this.full.add(recId(f.kind, f.key));
      if (full.length) this.hooks.status('full');
      // A change the account wouldn't take at all (damaged, or too big): drop it rather than send it
      // forever. In a put of several, which one isn't said: they go again one at a time.
      if (m.error && sent.size > 1) this.solo = true;
      else if (m.error)
        for (const id of sent.keys()) {
          console.error('Sync: the account refused', id);
          const agreed = (await db.getSynced(id)) ?? { rev: 0, data: null };
          await db.putSyncedRecord(...split(id), undefined, agreed, false);
        }
      await db.putMeta('syncRev', this.rev);
      if (changed.length) this.hooks.changed(changed);
      return this.sendOutbox();
    }
  }

  /**
   * Take in the account's version of a record. Unchanged here: it replaces the local copy.
   * Changed here too: merged, and still to be sent. True if the local copy changed.
   */
  private async take(r: Remote, conflict: boolean): Promise<boolean> {
    const id = recId(r.kind, r.key);
    const base = await db.getSynced(id);
    if (!conflict && base && base.rev >= r.rev) return false;
    const theirs = clean(r.kind, r.key, r.data);
    // A record this version can't read (made by a newer one, or damaged) is no deletion: the
    // local copy stays and isn't sent, and it's asked for again after an update (`hello`).
    if (r.data != null && theirs == null) {
      this.held = { ...this.held, [id]: Math.min(this.held[id] ?? r.rev, r.rev) };
      await db.putMeta('held', this.held);
      return false;
    }
    if (id in this.held) {
      const { [id]: _, ...rest } = this.held;
      this.held = rest;
      await db.putMeta('held', this.held);
    }
    const whole = await db.getRecord(r.kind, r.key);
    const mine = shared(r.kind, whole);
    const dirty = conflict || (await db.getOutbox()).includes(id);
    const agreed = { rev: r.rev, data: theirs };
    if (same(mine, theirs)) {
      await db.putSyncedRecord(r.kind, r.key, undefined, agreed, false);
      return false;
    }
    const next = dirty ? merge(r.kind, base?.data ?? null, mine, theirs) : theirs;
    const still = dirty && !same(next, theirs);
    // Settings: the shared ones go into this device's own.
    const local =
      r.kind === 'settings' ? (next == null ? undefined : { ...(whole as object), ...(next as object) }) : next;
    await db.putSyncedRecord(r.kind, r.key, local, agreed, still);
    return !same(next, mine);
  }

  /** Connected, with nothing of this device's waiting to reach the account (records held back aside). */
  async drained(): Promise<boolean> {
    if (!this.ready || this.inflight) return false;
    const ids = await db.getOutbox();
    return ids.every((id) => id in this.held || this.full.has(id));
  }

  /** Something was saved here: send it as soon as the connection is ready. */
  kick(): void {
    if (this.ready) this.queue(() => this.sendOutbox());
  }

  private async sendOutbox(): Promise<void> {
    if (!this.ready || this.inflight || this.ws?.readyState !== 1) return;
    // Records the account has in a form this version can't read wait until it can.
    const ids = (await db.getOutbox()).filter((id) => !(id in this.held) && !this.full.has(id));
    const bulk = await db.getMeta<number>('bulk');
    if (!ids.length) {
      if (bulk) await db.deleteMeta('bulk');
      return;
    }
    const sent = new Map<string, unknown>();
    const recs: object[] = [];
    let bytes = 0;
    // After a put the account refused, one record at a time, so only the bad one is dropped.
    for (const id of ids.slice(0, this.solo ? 1 : BATCH)) {
      const [kind, key] = split(id);
      const data = shared(kind, await db.getRecord(kind, key));
      const base = (await db.getSynced(id))?.rev ?? 0;
      // A record made and deleted here before it ever reached the account: nothing to send.
      if (data == null && !base) {
        await db.putSyncedRecord(kind, key, undefined, { rev: 0, data: null }, false);
        continue;
      }
      bytes += JSON.stringify(data).length;
      if (recs.length && bytes > BATCH_BYTES) break;
      sent.set(id, data);
      recs.push({ kind, key, base, data });
    }
    if (!recs.length) return;
    this.inflight = { id: ++this.putId, sent };
    // A replacement of everything made on purpose, within the last day: the account lets it through.
    const meant = !!bulk && Date.now() - bulk < 86_400_000;
    if (!this.send({ t: 'put', id: this.putId, recs, ...(meant ? { bulk: true } : {}) })) this.inflight = null;
  }

  /** The alerts to come may have changed: tell the account if they have. */
  alertsChanged(): void {
    if (!this.ready) return;
    const groups = this.hooks.alerts();
    // Compare to the second: a running timer's time's up is recomputed with every tick.
    const sig = JSON.stringify(groups.map((g) => [Math.round(g.at / 1000), g.notes]));
    if (sig !== this.lastAlerts && this.send({ t: 'alerts', groups })) this.lastAlerts = sig;
    const endpoint = this.hooks.endpoint();
    if (endpoint !== this.lastEndpoint && this.send({ t: 'device', endpoint })) this.lastEndpoint = endpoint;
  }

  /**
   * The app came to the front or went into the background. Going away, a beacon also carries
   * the news (a WebSocket message may not make it out before the page is frozen), along with
   * the alerts to come.
   */
  setVisible(v: boolean): void {
    this.visible = v;
    if (!this.session) return;
    this.send({ t: 'state', visible: v });
    if (v) {
      if (this.leader) this.reconnectNow();
      else this.claim(true);
      // Back from the background: check the connection is still there.
      this.probe();
      setTimeout(() => this.visible && this.probe(), ANSWER_MS + 500);
      return;
    }
    const { token, device } = this.session;
    const body = JSON.stringify({
      token,
      device,
      visible: false,
      // Only once caught up with the account: a plan from before what other devices did since
      // would replace the alerts they set (and they don't send theirs again unless they change).
      ...(this.ready ? { alerts: this.hooks.alerts() } : {}),
      endpoint: this.hooks.endpoint(),
    });
    try {
      if (navigator.sendBeacon?.(this.url + '/sync/beacon', new Blob([body], { type: 'text/plain' }))) return;
    } catch {
      /* fall through */
    }
    void fetch(this.url + '/sync/beacon', {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'content-type': 'text/plain' },
    }).catch(() => {});
  }
}
