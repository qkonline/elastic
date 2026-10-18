// Export / import. Version 2 holds everything (settings, repeating series, every day).
// Version 1 files hold a single day ({ items, dayStart, wrap }) and import into the day
// being viewed.

import { newItem, uid } from './actions';
import { dkey } from './time';
import type { Day, Item, Kind, Series, Settings, Status } from './types';
import { DEFAULT_SETTINGS, FIXED_LEADS, isHue } from './types';

export interface BackupV2 {
  app: 'elastic-day';
  version: 2;
  exportedAt: string;
  settings: Settings;
  series: Series[];
  days: Day[];
}

export type Parsed =
  | { kind: 'full'; settings: Settings; series: Series[]; days: Day[] }
  | { kind: 'day'; items: Item[]; dayStart: number; wrap: number };

const KINDS: Kind[] = ['task', 'buffer', 'fixed', 'check'];
const STATUSES: Status[] = ['todo', 'running', 'paused', 'done', 'postponed', 'skipped'];
const KEY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown, d: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const minutes = (v: unknown, d: number) => Math.max(1, Math.round(num(v, d)!));

/** Steps with unique ids (duplicates would break keyed lists and tick together). */
function normalizeSteps(raw: unknown): { id: string; t: string; d: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.map((x) => {
    const s = obj(x);
    let id = str(s.id, '');
    if (!id || seen.has(id)) id = uid();
    seen.add(id);
    return { id, t: str(s.t, ''), d: !!s.d };
  });
}

export function normalizeItem(raw: unknown): Item {
  const r = obj(raw);
  const kind = KINDS.includes(r.kind as Kind) ? (r.kind as Kind) : 'task';
  let status: Status =
    r.status === 'stopped' ? 'done' : STATUSES.includes(r.status as Status) ? (r.status as Status) : 'todo';
  const startedAt = num(r.startedAt, null);
  let endedAt = num(r.endedAt, null);
  let pausedAt = num(r.pausedAt, null);
  const min = kind === 'check' ? 0 : minutes(r.min, 30); // checks have no duration
  if (kind === 'check' && (status === 'running' || status === 'paused')) status = 'todo'; // never timed
  // Reconcile timer fields that don't fit the status (hand-edited or damaged files).
  if ((status === 'running' || status === 'paused') && startedAt == null) status = 'todo';
  if (status === 'paused' && pausedAt == null) pausedAt = startedAt;
  if (status !== 'paused') pausedAt = null;
  if ((status === 'done' || status === 'postponed') && startedAt != null && endedAt == null) endedAt = startedAt + min;
  const timed = status !== 'todo' && status !== 'skipped';
  return newItem({
    ...(typeof r.id === 'string' && r.id ? { id: r.id } : {}),
    title: str(r.title, 'Untitled'),
    min,
    kind,
    fixedAt: kind === 'fixed' ? num(r.fixedAt, 540) : null,
    hue: isHue(r.hue) ? r.hue : 'cyan',
    status,
    startedAt: timed ? startedAt : null,
    endedAt: timed ? endedAt : null,
    pausedAt,
    pausedFor: timed ? Math.max(0, num(r.pausedFor, 0)!) : 0,
    repeat: str(r.repeat, 'Once'),
    seriesId: typeof r.seriesId === 'string' ? r.seriesId : null,
    note: str(r.note, ''),
    subtasks: normalizeSteps(r.subtasks),
    marked: !!r.marked,
    continued: !!r.continued,
    laterCopy: !!r.laterCopy,
    movedKey: typeof r.movedKey === 'string' && KEY.test(r.movedKey) ? r.movedKey : null,
    movedId: typeof r.movedId === 'string' ? r.movedId : null,
  });
}

export function normalizeDay(raw: unknown): Day | null {
  const r = obj(raw);
  if (typeof r.key !== 'string' || !KEY.test(r.key)) return null;
  const items = Array.isArray(r.items) ? r.items.map(normalizeItem) : [];
  // At most one timer per day: any extra running/paused items are treated as finished.
  let seen = false;
  for (const [i, it] of items.entries()) {
    if (it.status !== 'running' && it.status !== 'paused') continue;
    if (seen) items[i] = { ...it, status: 'done', endedAt: it.pausedAt ?? it.startedAt! + it.min, pausedAt: null };
    seen = true;
  }
  return {
    key: r.key,
    dayStart: num(r.dayStart, 540)!,
    wrap: num(r.wrap, 1020)!,
    dayStarted: num(r.dayStarted, null),
    dayEnded: num(r.dayEnded, null),
    items,
  };
}

export function normalizeSeries(raw: unknown, index: number): Series | null {
  const r = obj(raw);
  if (typeof r.id !== 'string' || !r.id || typeof r.from !== 'string' || !KEY.test(r.from)) return null;
  const repeat = str(r.repeat, '');
  if (!repeat || repeat === 'Once') return null;
  const kind = KINDS.includes(r.kind as Kind) ? (r.kind as Kind) : 'task';
  return {
    id: r.id,
    title: str(r.title, 'Untitled'),
    min: minutes(r.min, 30),
    kind,
    hue: isHue(r.hue) ? r.hue : 'cyan',
    fixedAt: kind === 'fixed' ? num(r.fixedAt, 540) : null,
    repeat,
    note: str(r.note, ''),
    subtasks: normalizeSteps(r.subtasks).map(({ id, t }) => ({ id, t })),
    from: r.from,
    until: typeof r.until === 'string' && KEY.test(r.until) ? r.until : null,
    order: num(r.order, index)!,
  };
}

export function normalizeSettings(raw: unknown): Settings {
  const r = obj(raw);
  const d = DEFAULT_SETTINGS;
  const pick = <T>(v: unknown, ok: readonly T[], fallback: T) => (ok.includes(v as T) ? (v as T) : fallback);
  return {
    themePref: pick(r.themePref, ['match', 'light', 'dark'] as const, d.themePref),
    clock24: typeof r.clock24 === 'boolean' ? r.clock24 : d.clock24,
    showTimes: pick(r.showTimes, ['started', 'always', 'never'] as const, d.showTimes),
    alertOn: typeof r.alertOn === 'boolean' ? r.alertOn : d.alertOn,
    notify: typeof r.notify === 'boolean' ? r.notify : d.notify,
    notifyAsk: pick(r.notifyAsk, ['ask', 'never'] as const, d.notifyAsk),
    notifyAskAfter: typeof r.notifyAskAfter === 'string' && KEY.test(r.notifyAskAfter) ? r.notifyAskAfter : null,
    fixedLead: pick(r.fixedLead, FIXED_LEADS, d.fixedLead),
    defStart: num(r.defStart, d.defStart)!,
    defWrap: num(r.defWrap, d.defWrap)!,
    dayLength: Math.max(60, num(r.dayLength, num(r.defWrap, d.defWrap)! - num(r.defStart, d.defStart)!)!),
    flexStart: typeof r.flexStart === 'boolean' ? r.flexStart : d.flexStart,
    // A backup comes from someone who has used the app, so don't show them the welcome again.
    onboarded: true,
  };
}

export function parseBackup(text: string): Parsed | { error: string } {
  let d: Record<string, unknown>;
  try {
    d = obj(JSON.parse(text));
  } catch {
    return { error: 'Could not read that file.' };
  }
  if (d.app !== 'elastic-day') return { error: 'That file is not an Elastic Day backup.' };
  if (d.version === 2 && Array.isArray(d.days)) {
    return {
      kind: 'full',
      settings: normalizeSettings(d.settings),
      series: Array.isArray(d.series) ? d.series.map(normalizeSeries).filter((x): x is Series => !!x) : [],
      days: d.days.map(normalizeDay).filter((x): x is Day => !!x),
    };
  }
  if (Array.isArray(d.items)) {
    const day = normalizeDay({ key: '2000-01-01', items: d.items })!;
    return {
      kind: 'day',
      items: day.items.map((x) => ({ ...x, repeat: 'Once', seriesId: null, movedKey: null, movedId: null })),
      dayStart: num(d.dayStart, 540)!,
      wrap: num(d.wrap, 1020)!,
    };
  }
  return { error: 'That file is not an Elastic Day backup.' };
}

export function download(data: BackupV2): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `elastic-day-${dkey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
