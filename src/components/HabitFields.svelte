<script lang="ts" module>
  import type { Habit } from '../lib/types';

  export const HABIT_TYPES: [Habit['type'], string, string][] = [
    ['check', 'Yes or no', 'Done or not, once a day.'],
    ['amount', 'Amount', 'A number to reach, like 8 glasses of water. Each tap adds one.'],
    ['time', 'Time', 'Minutes to spend, like 30 minutes reading. Timed tasks can count towards it.'],
    ['quit', 'Break a habit', 'Something to stop doing. Each day counts as clean unless you mark a slip.'],
  ];

  const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /** The weekdays a repeat covers, Monday first. */
  export function repeatDays(repeat: string): string[] {
    if (repeat === 'Every day') return WEEK;
    if (repeat === 'Weekdays') return WEEK.slice(0, 5);
    return repeat.startsWith('Every ') ? WEEK.filter((d) => repeat.slice(6).split(', ').includes(d)) : WEEK;
  }

  /** The repeat for a set of weekdays. */
  export function daysRepeat(days: string[]): string {
    const set = WEEK.filter((d) => days.includes(d));
    if (set.length === 7 || !set.length) return 'Every day';
    if (set.length === 5 && set.every((d, i) => d === WEEK[i])) return 'Weekdays';
    return 'Every ' + set.join(', ');
  }

  /** How often, in words: "Every day", "Mon, Wed, Fri", "3 times a week". */
  export function oftenText(h: Habit, repeat: string): string {
    if (h.type === 'quit') return 'Every day';
    if (h.per !== 'day') return `${h.times} ${h.times === 1 ? 'time' : 'times'} a ${h.per}`;
    if (repeat === 'Every day' || repeat === 'Weekdays') return repeat;
    return repeatDays(repeat)
      .map((d) => d.slice(0, 3))
      .join(', ');
  }
</script>

<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { habitDefaults } from '../lib/habits';
  import { hhmm, hm } from '../lib/time';
  import { reducedMotion } from '../lib/ui.svelte';
  import Fields from './Fields.svelte';
  import SwitchRow from './SwitchRow.svelte';

  // A habit's settings, in New task and in its sheet: what kind of habit, how much, how often,
  // and an optional reminder. Each change goes straight out through `onchange`.
  let {
    habit,
    repeat,
    onchange,
    typeLocked = false,
  }: {
    habit: Habit;
    repeat: string;
    onchange: (habit: Habit, repeat: string) => void;
    /** In a habit's sheet the kind stays as it was made (its history means that kind). */
    typeLocked?: boolean;
  } = $props();

  type Often = 'daily' | 'days' | 'week' | 'month';
  const often = $derived<Often>(
    habit.per === 'week' ? 'week' : habit.per === 'month' ? 'month' : repeat === 'Every day' ? 'daily' : 'days',
  );
  const days = $derived(repeatDays(repeat));
  const set = (patch: Partial<Habit>, r = repeat) => onchange({ ...habit, ...patch }, r);

  function pickType(t: Habit['type']) {
    const d = habitDefaults(t);
    // Keep how often and the reminder; take the new kind's own target and unit.
    onchange(
      { ...habit, type: t, target: d.target, unit: d.unit, ...(t === 'quit' ? { per: 'day' } : {}) },
      t === 'quit' ? 'Every day' : repeat,
    );
  }

  function pickOften(o: Often) {
    if (o === 'daily') set({ per: 'day' }, 'Every day');
    else if (o === 'days') set({ per: 'day' }, repeat === 'Every day' ? 'Weekdays' : repeat);
    else set({ per: o, times: Math.min(habit.times, o === 'week' ? 6 : 20) || 3 }, 'Every day');
  }

  function toggleDay(d: string) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    if (next.length) set({}, daysRepeat(next));
  }

  // Parts that come and go slide open and shut, so what's below them glides instead of jumping.
  const unfold = () => ({ duration: reducedMotion.current ? 0 : 220, easing: cubicOut });

  const maxTimes = $derived(habit.per === 'week' ? 7 : 31);
  const hint = $derived(HABIT_TYPES.find(([t]) => t === habit.type)?.[2] ?? '');
</script>

<div class="hf">
  {#if !typeLocked}
    <div class="group">
      <span class="label">Kind of habit</span>
      <div class="row">
        {#each HABIT_TYPES as [t, l] (t)}
          <button class="chip" aria-pressed={habit.type === t} onclick={() => pickType(t)}>{l}</button>
        {/each}
      </div>
      <p class="hint">{hint}</p>
    </div>
  {/if}

  {#if habit.type === 'amount' || habit.type === 'time'}
    <div class="group" transition:slide={unfold()}>
      <span class="label">Each day it's done</span>
      {#if habit.type === 'amount'}
        <div class="amount">
          <div class="stepper" role="group" aria-label="Target">
            <button aria-label="Fewer" disabled={habit.target <= 1} onclick={() => set({ target: habit.target - 1 })}
              >−</button
            >
            <input
              type="number"
              inputmode="numeric"
              min="1"
              max="999"
              aria-label="Target"
              value={habit.target}
              onchange={(e) => set({ target: Math.max(1, Math.min(999, Math.round(+e.currentTarget.value) || 1)) })}
            />
            <button aria-label="More" onclick={() => set({ target: Math.min(999, habit.target + 1) })}>+</button>
          </div>
          <input
            class="unit"
            placeholder="times"
            aria-label="Unit, like glasses"
            maxlength="30"
            value={habit.unit}
            onchange={(e) => set({ unit: e.currentTarget.value.trim() })}
          />
        </div>
      {:else}
        <Fields field="duration" min={habit.target} showLabel={false} onMin={(m) => set({ target: m })} />
      {/if}
    </div>
  {/if}

  {#if habit.type !== 'quit'}
    <div class="group" transition:slide={unfold()}>
      <span class="label">How often</span>
      <div class="row">
        <button class="chip" aria-pressed={often === 'daily'} onclick={() => pickOften('daily')}>Every day</button>
        <button class="chip" aria-pressed={often === 'days'} onclick={() => pickOften('days')}>On some days</button>
        <button class="chip" aria-pressed={often === 'week'} onclick={() => pickOften('week')}>Times a week</button>
        <button class="chip" aria-pressed={often === 'month'} onclick={() => pickOften('month')}>Times a month</button>
      </div>
      {#if often !== 'daily'}
        <div class="more" transition:slide={unfold()}>
          {#if often === 'days'}
            <div class="days" role="group" aria-label="Days">
              {#each ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as d (d)}
                <button class="day" aria-pressed={days.includes(d)} aria-label={d} onclick={() => toggleDay(d)}
                  >{d.slice(0, 1)}</button
                >
              {/each}
            </div>
          {:else}
            <div class="amount">
              <div class="stepper" role="group" aria-label="Times">
                <button aria-label="Fewer" disabled={habit.times <= 1} onclick={() => set({ times: habit.times - 1 })}
                  >−</button
                >
                <span class="num">{habit.times}</span>
                <button
                  aria-label="More"
                  disabled={habit.times >= maxTimes}
                  onclick={() => set({ times: Math.min(maxTimes, habit.times + 1) })}>+</button
                >
              </div>
              <span class="per">{habit.times === 1 ? 'time' : 'times'} a {habit.per}, on any days</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <div class="props">
    <SwitchRow
      label="Reminder"
      note={habit.remindAt == null
        ? 'No reminder'
        : habit.type === 'quit'
          ? 'A nudge at this time each day'
          : "At this time, if it isn't done yet"}
      on={habit.remindAt != null}
      ontoggle={() => set({ remindAt: habit.remindAt == null ? 9 * 60 : null })}
    >
      <input
        class="time"
        type="time"
        aria-label="Reminder time"
        value={habit.remindAt != null ? hhmm(habit.remindAt) : ''}
        onchange={(e) => e.currentTarget.value && set({ remindAt: hm(e.currentTarget.value) })}
      />
    </SwitchRow>
  </div>
</div>

<style>
  .hf {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .hf > :global(*) {
    flex-shrink: 0;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  /* Two lines whatever the kind, so the fields under it don't move as the hint changes. */
  .hint {
    margin: 0;
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    max-width: 46ch;
    min-height: 2.9em;
  }
  /* Room for the chips' focus ring, which the slide's clipping would otherwise cut off. */
  .more {
    padding: 2px;
    margin: -2px;
  }
  .amount {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    height: 44px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--raised);
    overflow: hidden;
  }
  .stepper button {
    width: 44px;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--text);
    font: 300 20px/1 var(--font);
    cursor: pointer;
  }
  .stepper button:disabled {
    color: var(--faint);
    cursor: default;
  }
  .stepper input,
  .num {
    width: 52px;
    height: 100%;
    border: none;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font: 400 16px/44px var(--font);
    text-align: center;
    padding: 0;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .stepper input::-webkit-inner-spin-button,
  .stepper input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .unit {
    flex: 1;
    min-width: 120px;
    height: 44px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--raised);
    color: var(--text);
    font: 400 15px/1 var(--font);
    box-sizing: border-box;
  }
  .per {
    font: 400 14px/1.3 var(--font);
    color: var(--muted);
  }
  .days {
    display: flex;
    gap: 6px;
  }
  .day {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--muted);
    font: 400 14px/1 var(--font);
    cursor: pointer;
    padding: 0;
  }
  .day[aria-pressed='true'] {
    background: var(--text);
    border-color: var(--text);
    color: var(--bg);
  }
  .props {
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--raised);
    overflow: hidden;
  }
  .time {
    height: 44px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--raised);
    color: var(--text);
    font: 400 16px/1 var(--font);
  }
</style>
