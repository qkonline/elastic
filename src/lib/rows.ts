// Timeline view models: what each row of the day looks like at time `n`.

import { isActive, isMissed, isPartial, pausedTotal, worked, type Row } from './schedule';
import { apOf, cd, dL, fT, fTs, keyDate, shortDate } from './time';
import type { Day, Item, Status } from './types';
import { hueColor, untimed } from './types';

// Running colour: rose ring, rose countdown text while within time (red once over).
export const RUN = '#f43f5e';
export const RUN_T = 'var(--orT)';
// The colour bar beside a task fills from the top as it's worked on: its colour so far, a pale
// version of it for what's left.
const workedFill = (c: string, p: number) =>
  `linear-gradient(to bottom, ${c} 0 ${p}%, color-mix(in oklab, ${c} 30%, var(--raised)) ${p}% 100%)`;

export interface Flag {
  t: string;
  tone: 'y' | 'r';
}

export interface ItemVM {
  type: 'item';
  key: string;
  id: string;
  idx: number;
  it: Item;
  s: Status;
  w: number;
  p: number;
  pausedTot: number;
  isOver: boolean;
  active: boolean;
  missed: boolean;
  start: number;
  end: number;
  h: number;
  capBg: string;
  capBorder: string;
  op: number;
  mutedT: boolean;
  sub: string | null;
  subTone: string;
  count: string | null;
  countColor: string;
  countSub: string | null;
  flags: Flag[];
  badges: string[];
  t1: string | null;
  t2: string | null;
  ap1: string | null;
  ap2: string | null;
  fixedAt: string | null;
  /** Where a fixed item starts now, when the tasks before it have moved it off its set time. */
  fixedNow: string | null;
  hue: string;
  aStart: boolean;
  aCheck: boolean;
  aRestore: boolean;
  restoreLabel: string;
  glyph: string | null;
  /** Now line inside this row: fraction of the capsule height. */
  nowIn: number | null;
}

export type TimelineRow = ItemVM | { type: 'gap'; key: string; gap: string } | { type: 'now'; key: string };

export interface Ctx {
  day: Day;
  rows: Row[];
  n: number;
  isToday: boolean;
  showTimes: boolean;
  clock24: boolean;
}

export const capHeight = (min: number) => Math.max(44, Math.round(min * 0.85));

/** The line under a time: am/pm, plus "+1" once the day has run past midnight. */
function suffix(m: number, clock24: boolean): string | null {
  const parts = [apOf(m, clock24), m >= 1440 ? '+1' : null].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

export function itemVM(r: Row, c: Ctx): ItemVM {
  const { it, idx } = r;
  const s = it.status,
    n = c.n;
  // An ended day is only for looking at: nothing on it is missed, started or restored.
  const ended = c.day.dayEnded != null;
  const missedAny = c.isToday && !ended && isMissed(r, n);
  const missed = missedAny && it.kind !== 'buffer';
  const pBuf = missedAny && it.kind === 'buffer';
  const w = worked(it, n);
  // A Boardo card has no length (min 0): no share of it done to show.
  const frac = it.min > 0 ? Math.max(0, Math.min(1, w / it.min)) : 0;
  const p = Math.round(frac * 100);
  const active = isActive(it);
  // Work on a Boardo card has no length: it counts up and is never over time.
  const isOver = active && !it.card && w >= it.min;
  const pausedTot = pausedTotal(it, n);
  const h = capHeight(it.min);

  // capBg fills the colour bar; capBorder is an outline around it ('none' for most).
  const hue = hueColor(it.hue);
  let capBg = hue,
    capBorder = 'none';
  if (it.kind === 'buffer') {
    capBg = 'transparent';
    capBorder = '1.5px dashed var(--faint)';
  }
  if (r.pastEnd) capBorder = '1.5px dashed #f87171';
  if (missed) capBorder = '1.5px dashed #eab308';
  if (s === 'running') capBg = it.card ? hue : isOver ? '#f87171' : workedFill(hue, p);
  if (s === 'paused') capBg = workedFill('var(--muted)', p);

  let sub: string | null = null,
    subTone = 'var(--muted)';
  if (s === 'done' && Math.abs(w - it.min) >= 1) sub = 'took ' + dL(w);
  // A finished task keeps its pause on show: it explains the jump to whatever came next.
  if (s === 'done' && it.pausedFor >= 1) sub = `worked ${dL(w)} · paused ${dL(it.pausedFor)}`;
  if (s === 'done' && it.marked) sub = 'marked done';
  if (pBuf) sub = 'passed';
  if (s === 'postponed') {
    const where = it.movedKey ? 'moved to ' + shortDate(keyDate(it.movedKey)) : 'moved to tomorrow';
    sub = isPartial(it)
      ? `worked ${dL(w)} · rest ${it.laterCopy ? 'later today' : where}`
      : it.movedKey
        ? 'Moved to ' + shortDate(keyDate(it.movedKey))
        : 'Moved to tomorrow';
  }
  if (it.card && s === 'postponed') sub = `worked ${dL(w)} · set aside`;
  if (active && pausedTot >= 0.5) sub = `worked ${dL(w)} · paused ${dL(pausedTot)}`;
  else if (s === 'running' && isOver) {
    sub = 'running ' + dL(w);
    subTone = 'var(--redT)';
  }

  const leftS = (it.min - w) * 60;
  const pl = s === 'paused' ? n - it.pausedAt! : 0;

  const flags: Flag[] = [];
  if (missed) flags.push({ t: 'Missed', tone: 'y' });
  if (r.runsInto) flags.push({ t: 'runs into a fixed event', tone: 'y' });
  if (r.pastEnd) flags.push({ t: 'past wrap-up', tone: 'r' });

  const badges: string[] = [];
  if (it.repeat !== 'Once') badges.push('↻ ' + it.repeat);
  if (it.subtasks.length) badges.push(`☑ ${it.subtasks.filter((x) => x.d).length}/${it.subtasks.length}`);
  if (it.note) badges.push('✎ note');
  if (it.continued) badges.push('↷ continued');

  const t = c.showTimes;
  const showEnd = t && h >= 60;
  return {
    type: 'item',
    key: it.id,
    id: it.id,
    idx,
    it,
    s,
    w,
    p,
    pausedTot,
    isOver,
    active,
    missed,
    start: r.start,
    end: r.end,
    h,
    capBg,
    capBorder,
    op: pBuf || s === 'done' || s === 'postponed' ? 0.45 : s === 'skipped' ? 0.3 : 1,
    mutedT: ['done', 'skipped', 'postponed'].includes(s) || it.kind === 'buffer',
    sub,
    subTone,
    count: active ? (it.card ? cd(w * 60) : leftS >= 0 ? cd(leftS) : '+' + cd(-leftS)) : null,
    countColor: s === 'paused' ? 'var(--muted)' : isOver ? 'var(--redT)' : RUN_T,
    countSub: s === 'paused' ? 'Paused ' + (pl < 1 ? Math.floor(pl * 60) + 's' : dL(pl)) : it.card ? 'so far' : null,
    flags,
    badges,
    t1: t ? fTs(r.start, c.clock24) : null,
    t2: showEnd ? fTs(r.end, c.clock24) : null,
    ap1: t ? suffix(r.start, c.clock24) : null,
    ap2: showEnd ? suffix(r.end, c.clock24) : null,
    fixedAt:
      it.kind === 'fixed' && it.fixedAt != null ? fT(it.fixedAt, c.clock24) + (it.fixedAt >= 1440 ? ' +1' : '') : null,
    fixedNow: r.moved ? fT(r.start, c.clock24) + (r.start >= 1440 ? ' +1' : '') : null,
    hue: hueColor(it.hue),
    aStart: s === 'todo' && c.isToday && !ended && !missed && !pBuf && it.kind !== 'buffer',
    aCheck: s === 'done',
    aRestore: !ended && (s === 'skipped' || (s === 'postponed' && it.startedAt == null)),
    restoreLabel: s === 'postponed' ? 'Undo' : 'Restore',
    glyph: !c.isToday && s === 'todo' ? '○' : null,
    nowIn: null,
  };
}

/** The ordered list for the Spine timeline: items, idle gaps and the now line. */
export function timelineRows(c: Ctx): TimelineRow[] {
  const out: TimelineRow[] = [];
  for (const r of c.rows) {
    if (untimed(r.it.kind)) continue; // checks and habits live in the Checklist
    const v = itemVM(r, c);
    if (r.gap) out.push({ type: 'gap', key: 'g' + v.id, gap: dL(r.gap) });
    out.push(v);
  }

  if (c.isToday && c.rows.length) {
    const n = c.n;
    const live = (x: TimelineRow): x is ItemVM => x.type === 'item' && x.s !== 'skipped' && x.s !== 'postponed';
    const inside = out.find((x) => live(x) && x.start <= n && n < x.end) as ItemVM | undefined;
    if (inside) inside.nowIn = Math.max(0, Math.min(1, (n - inside.start) / (inside.end - inside.start)));
    else {
      let at = out.findIndex((x) => live(x) && x.start >= n);
      if (at > 0 && out[at - 1].type === 'gap') at--;
      const nr: TimelineRow = { type: 'now', key: 'now' };
      if (at < 0) out.push(nr);
      else out.splice(at, 0, nr);
    }
  }
  return out;
}

/**
 * While a task is being dragged, how far (px) each other row slides to open a gap where it will
 * land: rows between its old place and the new one move up or down by its height `h`.
 */
export function dragShifts(
  rows: TimelineRow[],
  drag: { id: string; over: number | null; h: number } | null,
  count: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!drag || drag.over == null) return out;
  const from = rows.findIndex((r) => r.type === 'item' && r.id === drag.id);
  if (from < 0) return out;
  // The gap opens in front of the item it lands before, including that item's idle-time row.
  let to = rows.length;
  if (drag.over < count) {
    to = rows.findIndex((r) => r.type === 'item' && r.idx === drag.over);
    if (to > 0 && rows[to - 1].type === 'gap') to--;
  }
  if (to > from) for (let i = from + 1; i < to; i++) out[rows[i].key] = -drag.h;
  else for (let i = to; i < from; i++) out[rows[i].key] = drag.h;
  return out;
}

/** Week-strip dot: lime = all done, rose = some pending, faint = planned, none = empty. */
export function dayDot(d: Day | undefined, key: string, today: string): string | null {
  if (!d) return null;
  // Habits come back every day: they don't make a day look planned or pending.
  const real = d.items.filter(
    (i) =>
      i.kind !== 'buffer' &&
      i.kind !== 'habit' &&
      i.status !== 'skipped' &&
      !(i.status === 'postponed' && !isPartial(i)),
  );
  if (!real.length) return null;
  if (key > today) return 'var(--faint)';
  const done = real.filter((i) => i.status === 'done' || isPartial(i)).length;
  const pending = real.length - done;
  if (key === today && done === 0) return 'var(--faint)';
  if (pending === 0) return '#84cc16';
  return '#f43f5e';
}

/** One piece of a small day strip: a timed task (or the idle gap before it), as long as it takes. */
export interface StripSeg {
  key: string;
  id: string | null;
  min: number;
  c: string;
  gap: boolean;
  faded: boolean;
}

/**
 * The day's timed tasks as a strip (New task's preview, the task sheet): skipped and moved ones
 * left out, idle gaps shown once the day has started, done ones faded.
 */
export function stripSegs(rows: Row[], started: boolean): StripSeg[] {
  return rows
    .filter(
      (r) => !untimed(r.it.kind) && r.it.status !== 'skipped' && !(r.it.status === 'postponed' && !isPartial(r.it)),
    )
    .flatMap((r) => [
      ...(started && r.gap >= 1 ? [{ key: r.it.id + '-g', id: null, min: r.gap, c: '', gap: true, faded: false }] : []),
      {
        key: r.it.id,
        id: r.it.id,
        min: Math.max(1, r.end - r.start),
        c: r.it.kind === 'buffer' ? 'var(--line)' : hueColor(r.it.hue),
        gap: false,
        faded: r.it.status === 'done' || isPartial(r.it),
      },
    ]);
}
