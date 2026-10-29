// The link to Boardo (kaiserkhan.com/boardo), the shared project boards app. Once linked, the
// cards assigned to you there show in a Projects section on your days, and the time you work
// on them in Elastic, and finishing your part, go back to the card.
//
// The contract lives in Boardo's docs (docs/ARCHITECTURE.md section 5). Since 23 October 2026
// the link belongs to the Elastic account, not the device: Elastic's Worker holds it and talks
// to Boardo's, and every device signed in to the account calls the Worker (worker/src/boardo.ts):
// - `/boardo`: linked (as whom), or the Boardo account this account's email could link to
//   (`match`), offered on Today and in Settings, and made with one tap (`/boardo/link`);
// - a Boardo account with another email links through Boardo's connect page (OAuth 2.0 with
//   PKCE, client `elastic`); the code comes back here and goes to `/boardo/connect`;
// - `/boardo/cards` lists the person's dated, unarchived cards, cached here for offline;
// - `/boardo/ops` takes start, stop, done and undone marks. They wait in an outbox (meta
//   'boardoOps') until they go, each with an id so a retry never counts twice;
// - when cards change in Boardo, the account's live connection says so (`nudge()`).
// A device connected before then kept its own token in meta 'boardo'; it's handed to the
// account once (`/boardo/adopt`) and dropped.

import { type ApiError, accountsAvailable, apiCall } from './account';
import { dayDiff, dkey } from './time';

/** The page that asks the person to allow the connection (for a Boardo account with another email). */
const BOARDO_APP = import.meta.env.VITE_BOARDO_APP ?? '';
export const boardoAvailable = () => accountsAvailable() && !!BOARDO_APP;

export interface BoardoCard {
  id: string;
  title: string;
  /** 'YYYY-MM-DD', or ISO date and time. */
  start: string | null;
  end: string | null;
  hasTime: boolean;
  board: { id: string; name: string; hue: string };
  status: { label: string | null; role: 'in_progress' | 'completed' | null };
  /** When my part was done (ms), or null. */
  myDone: number | null;
  completed: boolean;
  completedAt: number | null;
  url: string;
}

export interface BoardoOp {
  id: string;
  type: 'start' | 'stop' | 'done' | 'undone';
  board: string;
  cardId: string;
  sessionId: string;
  at: number;
}

interface Stored {
  /** A device's own token, from before links belonged to the account: handed over once. */
  token?: string;
  account: { email: string; name: string | null } | null;
  cards: BoardoCard[];
  boards: number;
  fetchedAt: number | null;
}

const PKCE_KEY = 'elastic-day:boardo-pkce';
/** Changes arrive as they happen (`nudge()`); this is in case one was missed. */
const REFRESH_MS = 15 * 60_000;
const NUDGE_MS = 800;

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const randomId = (n = 16) => b64url(crypto.getRandomValues(new Uint8Array(n))).replace(/[^A-Za-z0-9_-]/g, '');

/** The calendar day a card's date falls on, here. */
/** A card's link to Boardo, only when it's an https address: anything else isn't followed. */
export function cardLink(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function dayOfValue(v: string): string {
  return v.includes('T') ? dkey(new Date(v)) : v.slice(0, 10);
}

const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clockOf(v: string, clock24: boolean): string {
  const d = new Date(v);
  if (clock24) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  return `${h}${m ? ':' + String(m).padStart(2, '0') : ''} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

export interface CardRow {
  card: BoardoCard;
  /** Overdue, Due today, Due tomorrow, a weekday within the next six days, or a date. */
  deadline: string | null;
  overdue: boolean;
  /** My part is done, or the card is Completed: shown ticked. */
  ticked: boolean;
}

/**
 * Which cards show on a day, and how (R8.12 to R8.18):
 * - only cards with a date (the server sends only mine, and none archived);
 * - on every day their range covers (one date: that day);
 * - after their end, as Overdue, every day up to today, until my part is done or the card is Completed;
 * - once my part is done or the card is Completed, ticked for the rest of that day, then gone.
 * Deadlines read from the day being looked at.
 */
export function cardsFor(dayKey: string, cards: BoardoCard[], today: string, clock24 = false): CardRow[] {
  const rows: CardRow[] = [];
  for (const card of cards) {
    const s = card.start ?? card.end;
    const e = card.end ?? card.start;
    if (!s || !e) continue;
    const from = dayOfValue(s);
    const to = dayOfValue(e);
    const finishedAt = card.myDone ?? (card.completed ? card.completedAt : null);
    const finished = card.myDone != null || card.completed;
    const inRange = dayKey >= from && dayKey <= to;
    if (finished) {
      const doneDay = finishedAt != null ? dkey(new Date(finishedAt)) : null;
      // Shown on its days up to the one it was finished, and on that day.
      if (!((inRange && (!doneDay || dayKey <= doneDay)) || dayKey === doneDay)) continue;
    } else if (!inRange) {
      const late = dayKey > to && dayKey <= today;
      if (!late) continue;
    }
    const overdue = !finished && dayKey > to;
    rows.push({ card, deadline: finished ? null : deadlineLabel(e, dayKey, clock24), overdue, ticked: finished });
  }
  // Overdue first, then by deadline, then by title.
  return rows.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      Number(a.ticked) - Number(b.ticked) ||
      (a.card.end ?? a.card.start ?? '').localeCompare(b.card.end ?? b.card.start ?? '') ||
      a.card.title.localeCompare(b.card.title),
  );
}

/** A card's deadline as seen from `dayKey`. */
export function deadlineLabel(end: string, dayKey: string, clock24 = false): string {
  const key = dayOfValue(end);
  const days = dayDiff(dayKey, key);
  const at = end.includes('T') ? `, ${clockOf(end, clock24)}` : '';
  if (days < 0) return 'Overdue';
  if (days === 0) return `Due today${at}`;
  if (days === 1) return `Due tomorrow${at}`;
  const [Y, M, D] = key.split('-').map(Number);
  const d = new Date(Y, M - 1, D);
  if (days <= 6) return `${LONG_DAYS[d.getDay()]}${at}`;
  return `${D} ${MONTHS[M - 1]}${Y !== Number(dayKey.slice(0, 4)) ? ' ' + Y : ''}${at}`;
}

/** The parts of the Boardo link this device keeps (IndexedDB meta). */
export interface BoardoStore {
  getMeta<T>(key: string): Promise<T | undefined>;
  putMeta(key: string, v: unknown): Promise<void>;
  deleteMeta(key: string): Promise<void>;
}

type Who = { email: string; name: string | null };

/** What the Worker says about the account's link. */
interface Status {
  linked: Who | null;
  match: { email: string; boards: number } | null;
  declined: boolean;
}

export class Boardo {
  connected = $state(false);
  account = $state.raw<Who | null>(null);
  cards = $state.raw<BoardoCard[]>([]);
  /** How many boards the person is in: Projects shows only when there's at least one. */
  boards = $state(0);
  fetchedAt = $state<number | null>(null);
  busy = $state(false);
  error = $state<string | null>(null);
  /** A Boardo account with this account's email, in at least one board, not linked yet. */
  match = $state.raw<Status['match']>(null);
  /** The offer was turned down (or Boardo disconnected): only Settings offers it now. */
  declined = $state(false);
  private ops: BoardoOp[] = [];
  private flushing = false;
  private loaded = false;
  private started = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private store: BoardoStore,
    private say: (m: string) => void,
    /** The account's session token, while signed in. */
    private session: () => string | null,
    /** Fresh cards, asked for at `askedAt` (ms): the store brings today's work on them in line. */
    private onCards: (askedAt: number) => void = () => {},
  ) {}

  /** Signed in: show what's kept here (it works offline) until the account says more. */
  async load(): Promise<void> {
    if (!boardoAvailable() || this.loaded) return;
    this.loaded = true;
    const s = await this.store.getMeta<Stored>('boardo');
    this.ops = (await this.store.getMeta<BoardoOp[]>('boardoOps')) ?? [];
    if (s?.account) this.take(s);
  }

  /**
   * The account's live connection is up: hand over an old device link, finish a connection
   * Boardo just sent us back from, check the link and fetch the cards. After the first time, a
   * reconnection just fetches (a change may have been missed meanwhile).
   */
  async online(): Promise<void> {
    if (!boardoAvailable() || !this.session()) return;
    if (this.started) return this.nudge();
    this.started = true;
    await this.load();
    const s = await this.store.getMeta<Stored>('boardo');
    if (s?.token) await this.adopt(s.token);
    await this.finishConnect();
    await this.status();
    if (this.connected) await this.refresh();
    this.timer ??= setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (this.connected && (!this.fetchedAt || Date.now() - this.fetchedAt > REFRESH_MS)) void this.refresh();
    }, 60_000);
  }

  /** Something changed in Boardo (or on another device): fetch again, once things settle. */
  nudge(): void {
    if (!this.started) return;
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = null;
      void this.refresh();
    }, NUDGE_MS);
  }

  /** Signed out: nothing shows. What's kept here stays, for the same person signing back in. */
  stop(): void {
    this.destroy();
    this.loaded = this.started = false;
    this.clear();
    this.match = null;
    this.declined = false;
    this.ops = [];
  }

  /** Another account is signing in here: what the last one kept goes. */
  async wipe(): Promise<void> {
    this.stop();
    await this.store.deleteMeta('boardo');
    await this.store.deleteMeta('boardoOps');
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.timer = this.nudgeTimer = null;
  }

  private take(s: Stored): void {
    this.connected = true;
    this.account = s.account;
    this.cards = s.cards ?? [];
    this.boards = s.boards ?? 0;
    this.fetchedAt = s.fetchedAt ?? null;
  }

  private clear(): void {
    this.connected = false;
    this.account = null;
    this.cards = [];
    this.boards = 0;
    this.fetchedAt = null;
    this.error = null;
  }

  private async save(): Promise<void> {
    if (!this.connected) return;
    await this.store.putMeta('boardo', {
      account: this.account,
      cards: this.cards,
      boards: this.boards,
      fetchedAt: this.fetchedAt,
    } satisfies Stored);
  }

  private async post<T>(path: string, body: object = {}): Promise<T> {
    const token = this.session();
    if (!token) throw new Error('Signed out');
    return apiCall<T>(path, body, token);
  }

  /** Take in what the Worker says about the link. */
  private async apply(st: Status): Promise<void> {
    this.match = st.match;
    this.declined = st.declined;
    if (st.linked) {
      const was = this.connected;
      this.connected = true;
      this.account = st.linked;
      if (!was) await this.save();
    } else if (this.connected)
      await this.forget('Boardo was disconnected. Connect it again in Settings to see your project cards.');
  }

  private async status(): Promise<void> {
    try {
      await this.apply(await this.post<Status>('/boardo'));
    } catch {
      /* offline, or the account isn't set up yet: what's kept here stands */
    }
  }

  /** A device's own token from before: the account's link from now on (or revoked, if it has one). */
  private async adopt(token: string): Promise<void> {
    try {
      await this.apply(await this.post<Status>('/boardo/adopt', { token }));
    } catch (e) {
      if ((e as ApiError).status === 0) return; // offline: next time
    }
    const s = await this.store.getMeta<Stored>('boardo');
    if (s) await this.store.putMeta('boardo', { ...s, token: undefined });
  }

  private redirectUri(): string {
    return location.origin + import.meta.env.BASE_URL;
  }

  /** Link to the Boardo account with this account's email: one tap, no trip to Boardo. */
  async link(): Promise<void> {
    this.busy = true;
    try {
      await this.apply(await this.post<Status>('/boardo/link'));
      await this.refresh();
      this.say('Boardo connected. Cards assigned to you now show in Projects, on every device you use.');
    } catch (e) {
      this.say(e instanceof Error ? e.message : "Boardo couldn't be connected. Try again.");
    } finally {
      this.busy = false;
    }
  }

  /** "No thanks" to the offer on Today. Settings still has it. */
  async decline(): Promise<void> {
    this.declined = true;
    await this.post('/boardo/decline').catch(() => {});
  }

  /** Go to Boardo to allow the connection, for a Boardo account with another email (PKCE). */
  async connect(): Promise<void> {
    const verifier = randomId(48);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = randomId(16);
    try {
      sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
    } catch {
      this.say("Connecting needs this browser's storage, which is blocked.");
      return;
    }
    const q = new URLSearchParams({
      client_id: 'elastic',
      redirect_uri: this.redirectUri(),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });
    location.href = `${BOARDO_APP}?connect&${q}`;
  }

  /** Back from Boardo with `?code&state` (or `?error`): the account's Worker swaps the code. */
  private async finishConnect(): Promise<void> {
    const q = new URLSearchParams(location.search);
    const code = q.get('code');
    const state = q.get('state');
    if (!code && !q.get('error')) return;
    let saved: { verifier: string; state: string } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null');
      sessionStorage.removeItem(PKCE_KEY);
    } catch {
      /* nothing kept */
    }
    history.replaceState(null, '', location.pathname);
    if (!saved || state !== saved.state) return;
    if (!code) {
      this.say('Boardo was not connected.');
      return;
    }
    this.busy = true;
    try {
      await this.apply(
        await this.post<Status>('/boardo/connect', {
          code,
          verifier: saved.verifier,
          redirect_uri: this.redirectUri(),
        }),
      );
      this.say('Boardo connected. Cards assigned to you now show in Projects, on every device you use.');
    } catch (e) {
      this.say(e instanceof Error ? e.message : "Boardo couldn't be connected. Try again.");
    } finally {
      this.busy = false;
    }
  }

  /** Fetch the cards assigned to me (after sending any marks still waiting). */
  async refresh(): Promise<void> {
    if (!this.session()) return;
    await this.flush();
    const askedAt = Date.now();
    try {
      const res = await this.post<{ linked: Who | null; boards?: number; cards?: BoardoCard[] }>('/boardo/cards');
      if (!res.linked) {
        // Disconnected (here, on another device, or in Boardo): also what's offered now.
        if (this.connected)
          await this.forget('Boardo was disconnected. Connect it again in Settings to see your project cards.');
        await this.status();
        return;
      }
      this.connected = true;
      this.account = res.linked;
      this.cards = res.cards ?? [];
      this.boards = res.boards ?? 0;
      this.fetchedAt = Date.now();
      this.error = null;
      this.match = null;
      await this.save();
      this.onCards(askedAt);
    } catch (e) {
      if (this.connected) this.error = e instanceof Error ? e.message : null;
    }
  }

  /** A mark for this card is still waiting to reach Boardo. */
  waiting(cardId: string): boolean {
    return this.ops.some((o) => o.cardId === cardId);
  }

  /** Queue marks for Boardo and send them when there's a connection. */
  async send(ops: Omit<BoardoOp, 'id'>[]): Promise<void> {
    if (!this.connected || !ops.length) return;
    this.ops = [...this.ops, ...ops.map((o) => ({ ...o, id: randomId(12) }))];
    await this.store.putMeta('boardoOps', this.ops);
    void this.flush().then(() => this.refresh());
  }

  async flush(): Promise<void> {
    if (!this.connected || this.flushing || !this.ops.length || !this.session()) return;
    this.flushing = true;
    try {
      const batch = this.ops.slice(0, 100);
      const res = await this.post<{ linked?: null; results: { id: string }[] }>('/boardo/ops', { ops: batch });
      // Every answered op is done with, refused ones too (a card no longer mine).
      const answered = new Set(res.results.map((r) => r.id));
      this.ops = res.linked === null ? [] : this.ops.filter((o) => !answered.has(o.id));
      await this.store.putMeta('boardoOps', this.ops);
    } catch {
      /* offline: tried again later */
    } finally {
      this.flushing = false;
    }
  }

  async disconnect(): Promise<void> {
    await this.flush();
    try {
      await this.post('/boardo/disconnect');
    } catch (e) {
      this.say(e instanceof Error ? e.message : "Boardo couldn't be disconnected. Try again.");
      return;
    }
    await this.forget('Boardo disconnected, on every device you use.');
    await this.status();
  }

  private async forget(msg: string): Promise<void> {
    this.clear();
    this.ops = [];
    await this.store.deleteMeta('boardo');
    await this.store.deleteMeta('boardoOps');
    this.say(msg);
  }
}
