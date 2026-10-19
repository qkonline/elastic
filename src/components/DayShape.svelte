<script lang="ts" module>
  export interface Shape {
    start: number;
    length: number;
    flex: boolean;
  }
  /** "Your day: 9:00 am → 5:00 pm", or how a flexible day works. */
  export function describe(
    s: Shape,
    clock24: boolean,
    fT: (m: number, c: boolean) => string,
    dL: (m: number) => string,
  ) {
    if (s.flex) return `${dL(s.length)}, counted from when you press Start my day`;
    const end = s.start + s.length;
    return `${fT(s.start, clock24)} → ${fT(end, clock24)}${end >= 1440 ? ' (next day)' : ''}`;
  }
</script>

<script lang="ts">
  // The two questions that shape a day: when it usually starts, and how long a productive day
  // is. Used by the welcome and by Settings → Your day.
  import { dL, fT, hhmm, hm } from '../lib/time';

  let {
    part,
    shape,
    clock24,
    onchange,
  }: { part: 'start' | 'length'; shape: Shape; clock24: boolean; onchange: (s: Shape) => void } = $props();

  const STARTS = [360, 420, 480, 540, 600, 720];
  const LENGTHS = [240, 360, 480, 600, 720, 900];
  const isPresetStart = $derived(!shape.flex && STARTS.includes(shape.start));
  const isPresetLength = $derived(LENGTHS.includes(shape.length));
  let otherStart = $state(false);
  let customLength = $state(false);
  const set = (p: Partial<Shape>) => onchange({ ...shape, ...p });
</script>

{#if part === 'start'}
  <div class="chips">
    {#each STARTS as m (m)}
      <button
        class="chip"
        aria-pressed={!shape.flex && shape.start === m && !otherStart}
        onclick={() => {
          otherStart = false;
          set({ start: m, flex: false });
        }}>{fT(m, clock24).replace(':00', '')}</button
      >
    {/each}
    <button
      class="chip"
      aria-pressed={otherStart || (!shape.flex && !isPresetStart)}
      onclick={() => {
        otherStart = true;
        set({ flex: false });
      }}>Other time</button
    >
    <button
      class="chip"
      aria-pressed={shape.flex}
      onclick={() => {
        otherStart = false;
        set({ flex: true });
      }}>It varies</button
    >
  </div>
  {#if otherStart || (!shape.flex && !isPresetStart)}
    <input
      class="time"
      type="time"
      aria-label="Start time"
      value={hhmm(shape.start)}
      onchange={(e) => e.currentTarget.value && set({ start: hm(e.currentTarget.value), flex: false })}
    />
  {/if}
{:else}
  <div class="chips">
    {#each LENGTHS as m (m)}
      <button
        class="chip"
        aria-pressed={shape.length === m && !customLength}
        onclick={() => {
          customLength = false;
          set({ length: m });
        }}>{dL(m)}</button
      >
    {/each}
    <button class="chip" aria-pressed={customLength || !isPresetLength} onclick={() => (customLength = true)}
      >{isPresetLength ? 'Custom' : dL(shape.length)}</button
    >
  </div>
  {#if customLength}
    <label class="custom">
      <span class="sr-only">Hours</span>
      <select value={Math.round(shape.length / 60)} onchange={(e) => set({ length: +e.currentTarget.value * 60 })}>
        {#each Array.from({ length: 20 }, (_, i) => i + 1) as h (h)}<option value={h}>{h} hours</option>{/each}
      </select>
    </label>
  {/if}
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .time,
  select {
    margin-top: 10px;
    height: 44px;
    padding: 0 12px;
    border-radius: var(--r-ctl);
    border: none;
    background: var(--sunk);
    color: var(--text);
    font: 400 15px/1 var(--font);
  }
  select {
    appearance: none;
    -webkit-appearance: none;
    padding-right: 28px;
  }
  .custom {
    display: inline-flex;
  }
</style>
