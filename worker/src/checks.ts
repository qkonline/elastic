// What the worker accepts from the app.

/** How far ahead a push can be booked. Timers and heads-ups are for today; this is plenty. */
const MAX_AHEAD_MS = 24 * 60 * 60 * 1000;
/** How many pushes one browser can have booked at once. */
const MAX_TIMES = 20;

/** The browsers' own push services. Anything else is refused. */
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

export function isPushEndpoint(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 1024) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

export function isBookableTime(v: unknown, now = Date.now()): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > now - 60_000 && v < now + MAX_AHEAD_MS;
}

/**
 * The times to ring at, earliest first: one time, or a list of them (the app books its
 * time's-up and heads-ups together). Null if anything in it isn't bookable.
 */
export function bookableTimes(v: unknown, now = Date.now()): number[] | null {
  const list = Array.isArray(v) ? v : [v];
  if (!list.length || list.length > MAX_TIMES || !list.every((t) => isBookableTime(t, now))) return null;
  return [...new Set(list as number[])].sort((a, b) => a - b);
}

/** An email address as typed, tidied up, or null if it doesn't look like one. */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** One notification inside an alert group. */
export interface Note {
  title: string;
  body: string;
  tag: string;
}
export interface AlertGroup {
  at: number;
  notes: Note[];
}

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** The account's alerts as the app sends them, or null if anything in them is off. */
export function alertGroups(v: unknown, now = Date.now()): AlertGroup[] | null {
  if (!Array.isArray(v) || v.length > MAX_TIMES) return null;
  const out: AlertGroup[] = [];
  for (const g of v) {
    if (!g || typeof g !== 'object' || !isBookableTime(g.at, now) || !Array.isArray(g.notes)) return null;
    if (!g.notes.length || g.notes.length > 10) return null;
    const notes: Note[] = [];
    for (const n of g.notes) {
      if (!n || !text(n.title, 200) || !text(n.body, 500) || !text(n.tag, 200)) return null;
      notes.push({ title: n.title, body: n.body, tag: n.tag });
    }
    out.push({ at: g.at, notes });
  }
  return out.sort((a, b) => a.at - b.at);
}

export type RecordKind = 'day' | 'series' | 'settings' | 'goal' | 'review';
const KINDS: RecordKind[] = ['day', 'series', 'settings', 'goal', 'review'];
/** A change to one of an account's records. `data` null deletes it; `base` is the version it was made on. */
export interface Change {
  kind: RecordKind;
  key: string;
  base: number;
  data: string | null;
}

/** How big one record (a day, a repeating task, the settings) can be, as JSON. */
export const MAX_RECORD = 256 * 1024;
const MAX_CHANGES = 500;

/** The changes in a `put`, each record's data as JSON, or null if anything in it is off. */
export function changes(v: unknown): Change[] | null {
  if (!Array.isArray(v) || v.length > MAX_CHANGES) return null;
  const out: Change[] = [];
  for (const c of v) {
    if (!c || typeof c !== 'object') return null;
    if (!KINDS.includes(c.kind)) return null;
    if (typeof c.key !== 'string' || !c.key || c.key.length > 64) return null;
    if (!Number.isInteger(c.base) || c.base < 0) return null;
    if (c.data !== null && (typeof c.data !== 'object' || Array.isArray(c.data))) return null;
    const data = c.data === null ? null : JSON.stringify(c.data);
    if (data && data.length > MAX_RECORD) return null;
    out.push({ kind: c.kind, key: c.key, base: c.base, data });
  }
  return out;
}
