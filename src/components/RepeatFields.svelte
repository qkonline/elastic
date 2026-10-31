<script lang="ts" module>
  import { type Ends, nthDay, parseRepeat, prevDay, timesUpTo, withEnds } from '../lib/repeat';
  import { keyDate, shortDate } from '../lib/time';
  import type { Series } from '../lib/types';

  /** A day's date for people, with its year when it isn't this one: "Fri 26 Mar 2027". */
  export function dayText(k: string, today: string): string {
    return shortDate(keyDate(k)) + (k.slice(0, 4) === today.slice(0, 4) ? '' : ` ${k.slice(0, 4)}`);
  }

  /** The repeat in a few words, for the switch's line: "Every Monday, 6 times". */
  export function repeatShort(repeat: string, ends: Ends, today: string): string {
    if (!ends) return repeat;
    return 'times' in ends
      ? `${repeat}, ${ends.times === 1 ? 'once' : `${ends.times} times`}`
      : `${repeat}, until ${dayText(ends.until, today)}`;
  }

  /** What the choices add up to: "Every Monday, 6 times. The last one is Mon 7 Dec." */
  export function repeatSummary(
    repeat: string,
    ends: Ends,
    from: string,
    today: string,
    was?: Pick<Series, 'skips' | 'prior'>,
  ): string {
    const first = nthDay(repeat, from, 1, was?.skips ?? {});
    if (!first) return `${repeat}.`;
    const start = first === today ? 'today' : dayText(first, today);
    if (!ends) return `${repeat}, starting ${start}.`;
    const s = withEnds({ repeat, from, until: null, ends: null, ...was }, ends);
    const total = timesUpTo(s, s.until!);
    const last = s.until! in (s.skips ?? {}) ? prevDay(s, s.until!) : s.until;
    const n = total === 1 ? 'once' : `${total} times`;
    return last ? `${repeat}, ${n}. The last one is ${dayText(last, today)}.` : `${repeat}, ${n}.`;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { DAY_NAMES, type MonthDay, monthDayText, type Rule, ruleText, WEEK_ORDER } from '../lib/repeat';
  import { reducedMotion } from '../lib/ui.svelte';

  // How a task repeats, and when it stops: how often (every day, weekdays, weekly or every 2
  // weeks on chosen days, monthly, or a custom interval), then never, after a number of times or
  // on a date, and a line saying what that adds up to. Shared by New task and Edit task.
  let {
    repeat,
    ends,
    day,
    from,
    today,
    was,
    onchange,
  }: {
    repeat: string;
    ends: Ends;
    /** The day the task is on, which the choices start from. */
    day: string;
    /** Where the repeat counts from (the series' start, or `day` for a new one). */
    from: string;
    today: string;
    /** The series being edited: its skipped days and the times before its rule last changed. */
    was?: Pick<Series, 'skips' | 'prior'>;
    onchange: (repeat: string, ends: Ends) => void;
  } = $props();

  type Mode = 'day' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
  const MODES: [Mode, string][] = [
    ['day', 'Every day'],
    ['weekdays', 'Weekdays'],
    ['weekly', 'Weekly'],
    ['biweekly', 'Every 2 weeks'],
    ['monthly', 'Monthly'],
    ['custom', 'Custom'],
  ];
  const d0 = untrack(() => keyDate(day));
  const dow = d0.getDay();
  const date = d0.getDate();
  const monthLen = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  // The days of the month the task's own day could stand for.
  const MONTH_ONS: MonthDay[] = [{ date }, { nth: date + 7 > monthLen ? 5 : Math.ceil(date / 7), dow }, { last: true }];
  const sameOn = (a: MonthDay, b: MonthDay) => JSON.stringify(a) === JSON.stringify(b);

  // The choices, read from the repeat it has (or the task's day for anything not set yet).
  const r0 = untrack(() => parseRepeat(repeat)) ?? { every: 'day', n: 1 };
  let mode = $state<Mode>(
    r0.every === 'weekdays'
      ? 'weekdays'
      : r0.n === 1
        ? r0.every === 'day'
          ? 'day'
          : r0.every === 'week'
            ? 'weekly'
            : 'monthly'
        : r0.every === 'week' && r0.n === 2
          ? 'biweekly'
          : 'custom',
  );
  let days = $state<number[]>(r0.every === 'week' ? r0.days : [dow]);
  let monthOn = $state<MonthDay>(r0.every === 'month' ? r0.on : MONTH_ONS[0]);
  const ons = $derived(MONTH_ONS.some((o) => sameOn(o, monthOn)) ? MONTH_ONS : [monthOn, ...MONTH_ONS]);
  let n = $state(r0.every !== 'weekdays' && r0.n > 1 ? r0.n : 3);
  let unit = $state<'day' | 'week' | 'month'>(r0.every === 'weekdays' ? 'week' : r0.n > 1 ? r0.every : 'week');

  const rule = $derived.by((): Rule => {
    if (mode === 'day') return { every: 'day', n: 1 };
    if (mode === 'weekdays') return { every: 'weekdays' };
    if (mode === 'weekly') return { every: 'week', n: 1, days };
    if (mode === 'biweekly') return { every: 'week', n: 2, days };
    if (mode === 'monthly') return { every: 'month', n: 1, on: monthOn };
    return unit === 'day'
      ? { every: 'day', n }
      : unit === 'week'
        ? { every: 'week', n, days }
        : { every: 'month', n, on: monthOn };
  });
  const showDays = $derived(mode === 'weekly' || mode === 'biweekly' || (mode === 'custom' && unit === 'week'));
  const showMonth = $derived(mode === 'monthly' || (mode === 'custom' && unit === 'month'));

  // How it ends.
  let endsBy = $state<'never' | 'times' | 'date'>(
    untrack(() => (!ends ? 'never' : 'times' in ends ? 'times' : 'date')),
  );
  let times = $state(untrack(() => (ends && 'times' in ends ? ends.times : 6)));
  let until = $state(untrack(() => (ends && 'until' in ends ? ends.until : '')));

  function emit() {
    const text = ruleText(rule);
    if (endsBy === 'date' && !until) until = nthDay(text, from, 6, was?.skips ?? {}) ?? from;
    onchange(text, endsBy === 'never' ? null : endsBy === 'times' ? { times } : { until });
  }
  function pickMode(m: Mode) {
    mode = m;
    emit();
  }
  function toggleDay(d: number) {
    // At least one day stays picked.
    if (days.includes(d) && days.length === 1) return;
    days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    emit();
  }
  const unfold = () => ({ duration: reducedMotion.current ? 0 : 220, easing: cubicOut });
  const summary = $derived(repeatSummary(repeat, ends, from, today, was));
  const firstDay = $derived(nthDay(repeat, from, 1, was?.skips ?? {}) ?? from);
</script>

<div class="rep">
  <div class="row" role="group" aria-label="How often">
    {#each MODES as [m, label] (m)}
      <button class="chip" aria-pressed={mode === m} onclick={() => pickMode(m)}>{label}</button>
    {/each}
  </div>

  {#if mode === 'custom'}
    <div class="sub" transition:slide={unfold()}>
      <span class="label">Every</span>
      <div class="every">
        <div class="step" role="group" aria-label="How many">
          <button aria-label="One fewer" disabled={n <= 2} onclick={() => ((n = Math.max(2, n - 1)), emit())}>−</button>
          <span class="num" aria-live="polite">{n}</span>
          <button aria-label="One more" disabled={n >= 99} onclick={() => ((n = Math.min(99, n + 1)), emit())}>+</button
          >
        </div>
        <div class="seg" role="group" aria-label="Days, weeks or months">
          {#each [['day', 'Days'], ['week', 'Weeks'], ['month', 'Months']] as [u, label] (u)}
            <button aria-pressed={unit === u} onclick={() => ((unit = u as typeof unit), emit())}>{label}</button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if showDays}
    <div class="sub" transition:slide={unfold()}>
      <span class="label">On</span>
      <div class="days" role="group" aria-label="On these days">
        {#each WEEK_ORDER as d (d)}
          <button aria-pressed={days.includes(d)} aria-label={DAY_NAMES[d]} onclick={() => toggleDay(d)}
            >{DAY_NAMES[d][0]}</button
          >
        {/each}
      </div>
    </div>
  {:else if showMonth}
    <div class="sub" transition:slide={unfold()}>
      <span class="label">On</span>
      <div class="ons" role="radiogroup" aria-label="Which day of the month">
        {#each ons as o (JSON.stringify(o))}
          <button
            role="radio"
            aria-checked={sameOn(o, monthOn)}
            onclick={() => {
              monthOn = o;
              emit();
            }}
            ><span class="dot" aria-hidden="true"></span>{monthDayText(o).replace(/^the/, 'The')} of each month</button
          >
        {/each}
      </div>
    </div>
  {/if}

  <div class="sub">
    <span class="label">Ends</span>
    <div class="row" role="group" aria-label="Ends">
      {#each [['never', 'Never'], ['times', 'After a number of times'], ['date', 'On a date']] as [e, label] (e)}
        <button class="chip" aria-pressed={endsBy === e} onclick={() => ((endsBy = e as typeof endsBy), emit())}
          >{label}</button
        >
      {/each}
    </div>
    {#if endsBy === 'times'}
      <div class="times" transition:slide={unfold()}>
        <div class="step" role="group" aria-label="How many times">
          <button
            aria-label="One fewer"
            disabled={times <= 1}
            onclick={() => ((times = Math.max(1, times - 1)), emit())}>−</button
          >
          <span class="num" aria-live="polite">{times}</span>
          <button
            aria-label="One more"
            disabled={times >= 999}
            onclick={() => ((times = Math.min(999, times + 1)), emit())}>+</button
          >
        </div>
        <span class="unit">{times === 1 ? 'time' : 'times'}</span>
      </div>
    {:else if endsBy === 'date'}
      <input
        class="date"
        type="date"
        aria-label="End date"
        min={firstDay}
        bind:value={until}
        onchange={() => until && emit()}
        transition:slide={unfold()}
      />
    {/if}
  </div>
  <p class="sum">{summary}</p>
</div>

<style>
  .rep {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .sub {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .every {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .step {
    display: flex;
    align-items: center;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: var(--r-ctl);
    background: var(--raised);
    flex: none;
  }
  .step button {
    width: 44px;
    height: 42px;
    border: none;
    background: transparent;
    color: var(--text);
    font: 400 20px/1 var(--font);
    cursor: pointer;
  }
  .step button:disabled {
    color: var(--faint);
    cursor: default;
  }
  .num {
    min-width: 30px;
    text-align: center;
    font: 600 17px/1 var(--font);
    font-variant-numeric: tabular-nums;
  }
  .seg {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-ctl);
    background: var(--sunk);
  }
  .seg button {
    height: 38px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .seg button[aria-pressed='true'] {
    background: var(--raised);
    color: var(--text);
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  .days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .days button {
    height: 44px;
    border: none;
    border-radius: var(--r-ctl);
    background: var(--sunk);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .days button[aria-pressed='true'] {
    background: var(--text);
    color: var(--bg);
    font-weight: 500;
  }
  .ons {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--r-ctl);
    overflow: hidden;
  }
  .ons button {
    min-height: 46px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 14px;
    border: none;
    background: transparent;
    color: var(--text);
    font: 400 15px/1.3 var(--font);
    text-align: left;
    cursor: pointer;
  }
  .ons button + button {
    border-top: 1px solid var(--border);
  }
  .ons button[aria-checked='true'] {
    font-weight: 500;
  }
  .dot {
    width: 18px;
    height: 18px;
    flex: none;
    box-sizing: border-box;
    border-radius: 50%;
    border: 1.5px solid var(--line);
  }
  [aria-checked='true'] .dot {
    border: 5px solid var(--text);
  }
  .times {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .unit {
    font: 400 15px/1 var(--font);
    color: var(--muted);
  }
  .date {
    height: 46px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--r-ctl);
    background: var(--raised);
    color: var(--text);
    font: 400 15px/1 var(--font);
    box-sizing: border-box;
    width: 100%;
  }
  .sum {
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--r-ctl);
    background: color-mix(in oklab, var(--accent) 10%, var(--raised));
    font: 400 14px/1.4 var(--font);
    color: var(--text);
    text-wrap: pretty;
  }
</style>
