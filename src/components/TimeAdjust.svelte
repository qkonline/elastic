<script lang="ts">
  import { clockToDay, hhmm, hm } from '../lib/time';
  import TimeRuler from './TimeRuler.svelte';

  // The strip of time (TimeRuler) with a five-minute step either way and a box to type the time:
  // how a recorded time is corrected (a task's start or finish, the day's start).
  let {
    value,
    range,
    span = null,
    others = [],
    now = null,
    hue,
    clock24,
    label,
    late,
    onchange,
  }: {
    value: number;
    range: [number, number];
    span?: [number, number] | null;
    others?: [number, number][];
    now?: number | null;
    hue: string;
    clock24: boolean;
    label: string;
    /** How far the day reaches (minutes), so a typed small-hours time lands after midnight. */
    late: number;
    onchange: (v: number) => void;
  } = $props();
  const set = (v: number) => onchange(Math.min(range[1], Math.max(range[0], Math.round(v))));
</script>

<div class="adjust">
  <TimeRuler {value} {range} {span} {others} {now} {hue} {clock24} {label} onchange={set} />
  <div class="steps">
    <button class="step" disabled={value <= range[0]} onclick={() => set(value - 5)}>−5 min</button>
    <input
      class="time"
      type="time"
      aria-label={label}
      value={hhmm(value)}
      onchange={(e) => e.currentTarget.value && set(clockToDay(hm(e.currentTarget.value), late))}
    />
    <button class="step" disabled={value >= range[1]} onclick={() => set(value + 5)}>+5 min</button>
  </div>
</div>

<style>
  .adjust {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .steps {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .step {
    flex: none;
    padding: 0 14px;
    height: 44px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .step:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .time {
    flex: 1;
    min-width: 0;
    height: 44px;
    padding: 0 8px;
    border-radius: var(--r-ctl);
    border: none;
    background: var(--sunk);
    color: var(--text);
    font: 400 15px/1 var(--font);
    text-align: center;
  }
</style>
