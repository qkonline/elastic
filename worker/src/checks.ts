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
    // No push service hands out addresses with a login, a port or a fragment.
    if (u.username || u.password || u.port || u.hash) return false;
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * The name of a push address's Timer: the address as the URL parser writes it, so the same
 * address typed differently (a host in capitals, say) still gets the one Timer.
 */
export const timerName = (endpoint: string) => new URL(endpoint).href;

/**
 * The network a request comes from, for counting requests: an IPv4 address as it is, an IPv6 one
 * as its /64. A home or a phone is usually given a whole /64, so counting single IPv6 addresses
 * would let one device through as millions of different ones.
 */
export function network(ip: string | null | undefined): string {
  const a = (ip ?? '').trim().toLowerCase().split('%')[0];
  if (!a) return 'unknown';
  if (!a.includes(':')) return a;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return mapped[1];
  const halves = a.split('::');
  if (halves.length > 2) return a;
  const groups = (s: string) => (s ? s.split(':') : []);
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  // An IPv4 address written at the end takes the room of two groups.
  const size = (g: string[]) => g.reduce((n, x) => n + (x.includes('.') ? 2 : 1), 0);
  const all =
    halves.length === 2 ? [...head, ...Array(Math.max(0, 8 - size(head) - size(tail))).fill('0'), ...tail] : head;
  const first = all.slice(0, 4);
  if (first.length < 4 || !first.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return a;
  return `${first.map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

/**
 * Whether two strings are the same, taking as long whichever character differs, so a hash or a
 * secret compared with it can't be guessed bit by bit from how long the answer takes.
 */
export function sameText(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ (y[i % (y.length || 1)] ?? 0);
  return diff === 0;
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

/** A person's name: trimmed, spaces squeezed, 1 to 60 characters. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.replace(/\s+/g, ' ').trim();
  return n.length >= 1 && n.length <= 60 ? n : null;
}

/** What device and browser a passkey was made on, from the browser's user agent: "Safari on iPhone". */
export function deviceLabel(ua: string | null): string | null {
  if (!ua) return null;
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /CrOS/.test(ua)
          ? 'Chromebook'
          : /Macintosh|Mac OS X/.test(ua)
            ? 'Mac'
            : /Windows/.test(ua)
              ? 'Windows'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\/|FxiOS/.test(ua)
      ? 'Firefox'
      : /CriOS|Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  if (device && browser) return `${browser} on ${device}`;
  return device ?? browser;
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
/** What a device changed in one of an account's records: paths, each with its value and clock (shared/lww.ts). */
export interface Patch {
  kind: RecordKind;
  key: string;
  paths: Record<string, [unknown, string]>;
}

/** How big what a device sends for one record (a day, a repeating task, the settings) can be, as JSON. */
export const MAX_RECORD = 256 * 1024;
const MAX_CHANGES = 500;

/** The changes in a `put`, or null if anything in it is off. */
export function patches(v: unknown): Patch[] | null {
  if (!Array.isArray(v) || v.length > MAX_CHANGES) return null;
  const out: Patch[] = [];
  for (const c of v) {
    if (!c || typeof c !== 'object') return null;
    if (!KINDS.includes(c.kind)) return null;
    if (typeof c.key !== 'string' || !c.key || c.key.length > 64) return null;
    const p = c.paths;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    for (const [path, x] of Object.entries(p))
      if (
        path.length > 200 ||
        !Array.isArray(x) ||
        x.length !== 2 ||
        typeof x[1] !== 'string' ||
        !x[1] ||
        x[1].length > 64
      )
        return null;
    if (JSON.stringify(p).length > MAX_RECORD) return null;
    out.push({ kind: c.kind, key: c.key, paths: p as Patch['paths'] });
  }
  return out;
}
