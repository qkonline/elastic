// Quarterly goals: calendar quarters ('2026-Q4' is October to December), and how far each goal
// has got: its number, its milestones, and the time and habit days that count towards it.

import { habitMet, isHabit } from './habits';
import type { DayAt } from './habits';
import { worked } from './schedule';
import { addDays, keyDate } from './time';
import type { Goal, GoalSnapshot } from './types';
import { untimed } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function quarterOf(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

/** The first and last day of a quarter. */
export function quarterRange(q: string): [string, string] {
  const y = Number(q.slice(0, 4)),
    i = Number(q.slice(6)) - 1;
  const from = `${y}-${String(i * 3 + 1).padStart(2, '0')}-01`;
  const to = new Date(y, i * 3 + 3, 0);
  return [from, `${y}-${String(i * 3 + 3).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`];
}

export function addQuarters(q: string, n: number): string {
  const y = Number(q.slice(0, 4)),
    i = Number(q.slice(6)) - 1 + n;
  return `${y + Math.floor(i / 4)}-Q${(((i % 4) + 4) % 4) + 1}`;
}

/** "Oct–Dec 2026" */
export function quarterLabel(q: string): string {
  const [from, to] = quarterRange(q);
  const a = keyDate(from),
    b = keyDate(to);
  return `${MONTHS[a.getMonth()]}–${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

export interface GoalProgress {
  /** 0–1 from its number or milestones, or null when it has neither. */
  share: number | null;
  /** Minutes logged on tasks that count towards it this quarter. */
  minutes: number;
  /** Days its habits were kept this quarter. */
  habitDays: number;
  milestones: [number, number];
}

/** How far a goal has got, up to `today` (`n` minutes into today). */
export function goalProgress(g: Goal, dayAt: DayAt, today: string, n: number): GoalProgress {
  const [from, to] = quarterRange(g.quarter);
  let minutes = 0,
    habitDays = 0;
  for (let k = from; k <= to && k <= today; k = addDays(k, 1)) {
    const d = dayAt(k);
    if (!d) continue;
    const at = k === today ? n : 1e6;
    for (const it of d.items) {
      if (it.goalId !== g.id) continue;
      if (isHabit(it)) habitMet(d, it, at) && habitDays++;
      else if (!untimed(it.kind)) minutes += worked(it, at);
    }
  }
  const done = g.milestones.filter((m) => m.done).length;
  const share = g.target
    ? Math.max(0, Math.min(1, g.target.goal ? g.target.now / g.target.goal : 0))
    : g.milestones.length
      ? done / g.milestones.length
      : null;
  return { share, minutes, habitDays, milestones: [done, g.milestones.length] };
}

/** How it went, going by the numbers (the quarter's review suggests it). */
export function suggestStatus(p: GoalProgress): Goal['status'] {
  if (p.share == null) return 'partly';
  return p.share >= 1 ? 'hit' : p.share >= 0.5 ? 'partly' : 'missed';
}

export function snapshot(g: Goal, p: GoalProgress): GoalSnapshot {
  return {
    id: g.id,
    title: g.title,
    target: g.target ? { ...g.target } : null,
    milestones: p.milestones,
    minutes: Math.round(p.minutes),
    habitDays: p.habitDays,
    status: g.status,
  };
}
