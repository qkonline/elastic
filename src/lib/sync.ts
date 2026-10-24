// Keeping this device's plan and the account's the same, while signed in (see shared/lww.ts).
//
// Changes made here wait in `pending` (db.ts) until the account has them. While the app is open,
// one tab per device (the one holding the 'elastic-day-sync' lock) keeps a WebSocket to the
// account (worker/src/account.ts): it says how far it has got (`hello`), takes in every record
// changed since, path by path, and sends what's pending. The account merges each change the same
// way and passes it on to the other devices. Nothing is refused for being out of date, so nothing
// is merged here and sent again: a change that arrives twice, late or out of order ends the same.
//
// Settings: only the ones about how days work are shared. Theme, sound and notifications belong
// to each device.

import type { Clock, Paths } from '../../shared/lww';
import type { Session } from './account';
import * as db from './db';
import { type RecordKind, splitId } from './db';
import type { AlertGroup } from './reminders';

export { SHARED_SETTINGS } from './types';

/** 'paused': the account has no name or email yet, so it doesn't sync until it has. */
export type SyncStatus = 'off' | 'connecting' | 'live' | 'offline' | 'paused' | 'full';

/** The WebSocket subprotocol: since 24 Oct 2026, records travel as paths with clocks. */
export const PROTOCOL = 'elastic-day-2';

export interface SyncHooks {
  /** Save edits still held in memory, so they're pending before anything else comes in. */
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
  /** A clock for changes made now (the store's), and a clock seen from another device. */
  clock(): Clock;
  see(c: Clock): void;
  /** The account's Boardo cards changed (or its link did): fetch them again. */
  boardo?(): void;
}

interface Remote {
  kind: RecordKind;
  key: string;
  rev: number;
  paths: Paths;
}

const BACKOFF = [1, 2, 5, 10, 30].map((s) => s * 1000);
const PING_MS = 20_000;
/** A connection that hasn't answered a ping, or opened, in this long is given up on. */
const ANSWER_MS = 10_000;
const OPEN_MS = 15_000;
const BATCH = 100;
const BATCH_BYTES = 400_000;

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
  private inflight: { id: number; sent: Record<string, Paths> } | null = null;
  private putId = 0;
  private rev = 0;
  /** New records the account had no room for: not sent again until the next connection. */
  private full = new Set<string>();
  /** Waiting for the catch-up a `syncNow()` asked for. */
  private caughtUp: (() => void)[] = [];
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

  /** Start syncing for this session, and connect if this tab leads. */
  async start(session: Session): Promise<void> {
    this.session = session;
    this.rev = (await db.getMeta<number>('syncRev')) ?? 0;
    // Records an older version had still to send (db.ts upgrade): they go again, whole, as of now.
    const unsent = await db.getMeta<string[]>('unsent');
    if (unsent) {
      if (unsent.length) await db.markAll(this.hooks.clock(), unsent);
      await db.deleteMeta('unsent');
    }
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
      ws = new WebSocket(this.url.replace(/^http/, 'ws') + '/sync', [PROTOCOL, this.session.token]);
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
      this.hello(true);
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
      for (const r of recs) for (const [, c] of Object.values(r.paths ?? {})) this.hooks.see(c);
      const changed = await db.applyRemote(recs.map((r) => ({ kind: r.kind, key: r.key, patch: r.paths ?? {} })));
      for (const r of recs) this.rev = Math.max(this.rev, r.rev);
      if (typeof m.rev === 'number') this.rev = Math.max(this.rev, m.rev);
      await db.putMeta('syncRev', this.rev);
      if (changed.length) this.hooks.changed(changed);
      if (m.done) {
        if (!this.ready) {
          this.ready = true;
          this.tries = 0;
          this.hooks.status('live');
          this.lastAlerts = '';
          this.alertsChanged();
        }
        for (const r of this.caughtUp.splice(0)) r();
      }
      return this.sendOutbox();
    }
    if (m.t === 'ack' && this.inflight && m.id === this.inflight.id) {
      const { sent } = this.inflight;
      this.inflight = null;
      // The account is full: these stay here (still pending) and it says so.
      const full = (m.full ?? []) as { kind: RecordKind; key: string }[];
      for (const f of full) this.full.add(`${f.kind}:${f.key}`);
      if (full.length) this.hooks.status('full');
      const kept = Object.fromEntries(Object.entries(sent).filter(([id]) => !this.full.has(id)));
      if (!m.error) await db.ackPending(kept);
      // A change the account wouldn't take (damaged, too big, or too many deletions at once): in
      // a put of several, which one isn't said, so they go again one at a time, and a single one
      // refused is dropped rather than sent for ever.
      else if (Object.keys(sent).length > 1) this.solo = true;
      else {
        console.error('Sync: the account refused', Object.keys(sent));
        await db.ackPending(sent);
      }
      return this.sendOutbox();
    }
  }

  /** Connected, with nothing of this device's waiting to reach the account (records it has no room for aside). */
  async drained(): Promise<boolean> {
    if (!this.ready || this.inflight) return false;
    return Object.keys(await db.getPending()).every((id) => this.full.has(id));
  }

  /** Ask the account for everything changed since this device last heard (or, `first`, say who's here). */
  private hello(first = false): void {
    this.send({
      t: 'hello',
      since: this.rev,
      ...(first
        ? { device: this.session!.device, visible: this.visible, endpoint: (this.lastEndpoint = this.hooks.endpoint()) }
        : {}),
    });
  }

  /**
   * Pull to refresh: connect (or check the connection), catch up with the account and send
   * what's waiting. True once caught up, false if the account can't be reached in time.
   */
  async syncNow(wait = 8000): Promise<boolean> {
    if (!this.session) return false;
    const caught = new Promise<void>((r) => this.caughtUp.push(r));
    if (this.ready) {
      this.hello();
      this.probe();
    } else if (this.leader) this.reconnectNow();
    else this.claim(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ok = await Promise.race([
      caught.then(() => true),
      new Promise<boolean>((r) => (timer = setTimeout(() => r(false), wait))),
    ]);
    clearTimeout(timer);
    return ok;
  }

  /** Something was saved here: send it as soon as the connection is ready. */
  kick(): void {
    if (this.ready) this.queue(() => this.sendOutbox());
  }

  private async sendOutbox(): Promise<void> {
    if (!this.ready || this.inflight || this.ws?.readyState !== 1) return;
    const pending = Object.entries(await db.getPending()).filter(([id]) => !this.full.has(id));
    const bulk = await db.getMeta<number>('bulk');
    if (!pending.length) {
      if (bulk) await db.deleteMeta('bulk');
      return;
    }
    const sent: Record<string, Paths> = {};
    const recs: object[] = [];
    let bytes = 0;
    for (const [id, paths] of pending.slice(0, this.solo ? 1 : BATCH)) {
      bytes += JSON.stringify(paths).length;
      if (recs.length && bytes > BATCH_BYTES) break;
      const [kind, key] = splitId(id);
      sent[id] = paths;
      recs.push({ kind, key, paths });
    }
    this.inflight = { id: ++this.putId, sent };
    // Everything replaced on purpose (Erase everything, Import) within the last day: the account
    // lets that many deletions through.
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
