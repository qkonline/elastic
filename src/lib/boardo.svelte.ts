// The link to Boardo (kaiserkhan.com/boardo), the shared project boards app. Once connected,
// the cards assigned to you there show in a Projects section on your days, and the time you
// work on them in Elastic, and finishing your part, go back to the card.
//
// The contract lives in Boardo's docs (docs/ARCHITECTURE.md section 5). In short:
// - Connecting is OAuth 2.0 authorization code with PKCE (client `elastic`, redirect back to
//   this app). The token is kept on this device only (IndexedDB meta 'boardo'), never synced
//   through Elastic's account.
// - `POST /elastic/cards` lists the person's dated, unarchived cards; cached here for offline.
// - `POST /elastic/ops` takes start, stop, done and undone marks. They wait in an outbox
//   (meta 'boardoOps') until they go, each with an id so a retry never counts twice.

import { dayDiff, dkey } from './time';

/** Boardo's API, and the page that asks the person to allow the connection. */
export const BOARDO_API = (import.meta.env.VITE_BOARDO_URL ?? '').replace(/\/$/, '');
const BOARDO_APP = import.meta.env.VITE_BOARDO_APP ?? '';
export const boardoAvailable = () => !!BOARDO_API && !!BOARDO_APP;

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
  token: string;
  account: { email: string; name: string | null } | null;
  cards: BoardoCard[];
  boards: number;
  fetchedAt: number | null;
}

const PKCE_KEY = 'elastic-day:boardo-pkce';
const REFRESH_MS = 5 * 60_000;

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const randomId = (n = 16) => b64url(crypto.getRandomValues(new Uint8Array(n))).replace(/[^A-Za-z0-9_-]/g, '');

/** The calendar day a card's date falls on, here. */
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
 * - after their end, only while In progress, as Overdue, every day up to today;
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
      const lateInProgress = dayKey > to && dayKey <= today && card.status.role === 'in_progress';
      if (!lateInProgress) continue;
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

/** The parts of the Boardo connection this device keeps (IndexedDB meta). */
export interface BoardoStore {
  getMeta<T>(key: string): Promise<T | undefined>;
  putMeta(key: string, v: unknown): Promise<void>;
  deleteMeta(key: string): Promise<void>;
}

export class Boardo {
  connected = $state(false);
  account = $state.raw<Stored['account']>(null);
  cards = $state.raw<BoardoCard[]>([]);
  /** How many boards the person is in: Projects shows only when there's at least one. */
  boards = $state(0);
  fetchedAt = $state<number | null>(null);
  busy = $state(false);
  error = $state<string | null>(null);
  private token: string | null = null;
  private ops: BoardoOp[] = [];
  private flushing = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: BoardoStore,
    private say: (m: string) => void,
  ) {}

  /** Load what's kept here, finish a connection Boardo just sent us back from, and refresh. */
  async init(): Promise<void> {
    if (!boardoAvailable()) return;
    const s = await this.store.getMeta<Stored>('boardo');
    this.ops = (await this.store.getMeta<BoardoOp[]>('boardoOps')) ?? [];
    if (s?.token) this.take(s);
    await this.finishConnect();
    if (this.connected) void this.refresh();
    this.timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (this.connected && (!this.fetchedAt || Date.now() - this.fetchedAt > REFRESH_MS)) void this.refresh();
    }, 30_000);
    addEventListener('online', () => void this.flush());
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private take(s: Stored): void {
    this.token = s.token;
    this.connected = true;
    this.account = s.account;
    this.cards = s.cards ?? [];
    this.boards = s.boards ?? 0;
    this.fetchedAt = s.fetchedAt ?? null;
  }

  private async save(): Promise<void> {
    if (!this.token) return;
    await this.store.putMeta('boardo', {
      token: this.token,
      account: this.account,
      cards: this.cards,
      boards: this.boards,
      fetchedAt: this.fetchedAt,
    } satisfies Stored);
  }

  private redirectUri(): string {
    return location.origin + import.meta.env.BASE_URL;
  }

  /** Go to Boardo to allow the connection (PKCE: the verifier stays here). */
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

  /** Back from Boardo with `?code&state` (or `?error`): swap the code for a token. */
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
      const res = await this.post<{ access_token: string; user: { email: string; name: string | null } }>(
        '/oauth/token',
        { code, verifier: saved.verifier, client_id: 'elastic', redirect_uri: this.redirectUri() },
        false,
      );
      this.take({ token: res.access_token, account: res.user, cards: [], boards: 0, fetchedAt: null });
      await this.save();
      this.say('Boardo connected. Cards assigned to you now show in Projects.');
    } catch (e) {
      this.say(e instanceof Error ? e.message : "Boardo couldn't be connected. Try again.");
    } finally {
      this.busy = false;
    }
  }

  private async post<T>(path: string, body: object, auth = true): Promise<T> {
    let res: Response;
    try {
      res = await fetch(BOARDO_API + path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(auth && this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("You're offline. It'll go once you're connected.");
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && auth) {
      await this.forget('Boardo was disconnected. Connect it again in Settings to see your project cards.');
      throw new Error('Disconnected');
    }
    if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Boardo had a problem. Try again.');
    return data as T;
  }

  /** Fetch the cards assigned to me (after sending any marks still waiting). */
  async refresh(): Promise<void> {
    if (!this.connected) return;
    await this.flush();
    try {
      const res = await this.post<{ boards: number; cards: BoardoCard[] }>('/elastic/cards', {});
      this.cards = res.cards;
      this.boards = res.boards;
      this.fetchedAt = Date.now();
      this.error = null;
      await this.save();
    } catch (e) {
      if (this.connected) this.error = e instanceof Error ? e.message : null;
    }
  }

  /** Queue marks for Boardo and send them when there's a connection. */
  async send(ops: Omit<BoardoOp, 'id'>[]): Promise<void> {
    if (!this.connected || !ops.length) return;
    this.ops = [...this.ops, ...ops.map((o) => ({ ...o, id: randomId(12) }))];
    await this.store.putMeta('boardoOps', this.ops);
    void this.flush().then(() => this.refresh());
  }

  async flush(): Promise<void> {
    if (!this.connected || this.flushing || !this.ops.length) return;
    this.flushing = true;
    try {
      const batch = this.ops.slice(0, 100);
      const res = await this.post<{ results: { id: string }[] }>('/elastic/ops', { ops: batch });
      // Every answered op is done with, refused ones too (a card no longer mine).
      const answered = new Set(res.results.map((r) => r.id));
      this.ops = this.ops.filter((o) => !answered.has(o.id));
      await this.store.putMeta('boardoOps', this.ops);
    } catch {
      /* offline: tried again later */
    } finally {
      this.flushing = false;
    }
  }

  async disconnect(): Promise<void> {
    await this.flush();
    await this.post('/elastic/disconnect', {}).catch(() => {});
    await this.forget('Boardo disconnected.');
  }

  private async forget(msg: string): Promise<void> {
    this.token = null;
    this.connected = false;
    this.account = null;
    this.cards = [];
    this.boards = 0;
    this.fetchedAt = null;
    this.ops = [];
    await this.store.deleteMeta('boardo');
    await this.store.deleteMeta('boardoOps');
    this.say(msg);
  }
}
