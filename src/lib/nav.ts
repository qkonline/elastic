import { planner as P, type Screen } from './planner.svelte';

/** The screens the bottom bar (phone) and the sidebar (iPad and computer) switch between. */
export type Tab = 'today' | 'habits' | 'goals' | 'review';

export const TABS: [Tab, string][] = [
  ['today', 'Today'],
  ['habits', 'Habits'],
  ['goals', 'Goals'],
  ['review', 'Review'],
];

/** Open a screen. Tapping Today while on another day of the plan comes back to today. */
export function go(t: Tab): void {
  if (t === 'today' && P.screen.type === 'today') {
    if (!P.isToday || P.view !== 'day') {
      if (P.view !== 'day') P.setView('day');
      P.backToToday();
    }
    return;
  }
  P.openScreen({ type: t } as Screen);
}

/** What the + adds on the screen in view: a habit on Habits, a goal on Goals, else a task. */
export const addLabel = (): string =>
  P.screen.type === 'habits' ? 'Add habit' : P.screen.type === 'goals' ? 'Add goal' : 'Add task';

/**
 * The + (bottom bar, sidebar). On Habits, New task opens with Habit picked; on Goals, the screen's
 * own new goal opens (`P.goalAsked`). From a screen without the plan in sight, a new task goes on
 * Today, not a day last looked at.
 */
export async function addTask(): Promise<void> {
  if (P.screen.type === 'goals') {
    P.goalAsked++;
    return;
  }
  const habit = P.screen.type === 'habits';
  if (P.screen.type !== 'today' && !P.isToday) await P.switchDay(P.today);
  if (P.locked) P.sayLocked();
  else P.openSheet(habit ? { type: 'add', kind: 'habit' } : { type: 'add' });
}
