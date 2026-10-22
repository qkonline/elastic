<script lang="ts">
  import { tick } from 'svelte';
  import { tapped } from '../lib/drag';
  import { habitMet, habitValue, periodCount, progressText, streak } from '../lib/habits';
  import { planner as P } from '../lib/planner.svelte';
  import { hueColor, type Habit, type Item } from '../lib/types';
  import HabitRing from './HabitRing.svelte';

  // One habit in the Checklist or the Habits section. The ring is the control: a tap ticks a
  // yes/no habit, adds one to an amount, opens the minutes for a time habit, or marks a slip on
  // a habit to break. Pressing and holding an amount opens the number to type it in.
  let { it }: { it: Item & { habit: Habit } } = $props();

  const HOLD_MS = 450;
  const h = $derived(it.habit);
  const day = $derived(P.day);
  const n = $derived(P.n);
  const value = $derived(habitValue(day, it, n));
  const met = $derived(habitMet(day, it, n));
  const slipped = $derived(h.type === 'quit' && !!it.progress);
  const series = $derived(it.seriesId ? P.series.find((s) => s.id === it.seriesId) : undefined);
  // As of the day on screen; a day ahead has no streak yet.
  const asOf = $derived(P.viewKey < P.today ? P.viewKey : P.today);
  const run = $derived(
    series && P.viewKey <= P.today ? streak(P.dayAt, series, asOf, P.viewKey === P.today ? n : 1e6) : 0,
  );
  const sofar = $derived(progressText(day, it, n));
  const period = $derived(
    series && h.per !== 'day' ? periodCount(P.dayAt, series, P.viewKey, P.today, n, P.viewKey) : 0,
  );
  const runText = $derived.by(() => {
    if (h.type === 'quit') return run === 1 ? '1 clean day' : `${run} clean days`;
    if (run < 2) return '';
    return h.per === 'day' ? `${run} in a row` : `${run} ${h.per}s in a row`;
  });

  const undo = $derived(h.type === 'check' ? met : slipped);
  const off = $derived(P.locked || (P.waiting && !undo));

  let editing = $state(false);
  let draft = $state('');
  let input: HTMLInputElement | null = $state(null);
  let hold: ReturnType<typeof setTimeout> | null = null;
  let held = false;

  async function openEntry() {
    if (P.locked) return P.sayLocked();
    if (P.waiting) return P.askToStartDay('check');
    draft = String(it.progress ?? 0);
    editing = true;
    await tick();
    input?.select();
  }
  // The number typed in is only kept on Save (or Enter).
  // (A number field's binding gives a number, or null when it's empty.)
  const typed = $derived(draft === '' || draft == null ? NaN : Number(draft));
  const changed = $derived(Number.isFinite(typed) && typed !== (it.progress ?? 0));
  function save() {
    if (!editing) return;
    editing = false;
    if (changed) P.setHabitProgress(it.id, typed);
  }

  function down(e: PointerEvent) {
    // The ring has its own press-and-hold; it shouldn't pick the row up for dragging.
    e.stopPropagation();
    held = false;
    if (h.type !== 'amount' || off) return;
    hold = setTimeout(() => {
      held = true;
      void openEntry();
    }, HOLD_MS);
  }
  // After a hold on a touch screen, the touchend handler cancels the tap the browser would add,
  // which would take the focus away from the number just opened.
  const cancelHold = () => {
    if (hold) clearTimeout(hold);
    hold = null;
  };
  function tap() {
    cancelHold();
    if (held) return; // the hold already opened the number
    if (P.locked) return P.sayLocked();
    if (h.type === 'time') return void openEntry();
    if (off) return P.askToStartDay('check');
    P.tapHabit(it.id);
  }

  const label = $derived(
    h.type === 'check'
      ? it.title
      : h.type === 'quit'
        ? `${it.title}: ${slipped ? 'take back the slip' : 'mark a slip today'}`
        : h.type === 'amount'
          ? `${it.title}: add one, ${sofar} so far. Press and hold to type a number.`
          : `${it.title}: add minutes, ${sofar} so far`,
  );
</script>

<button
  class="ctl-ring hit"
  role={h.type === 'check' ? 'checkbox' : undefined}
  aria-checked={h.type === 'check' ? met : undefined}
  aria-pressed={h.type === 'quit' ? slipped : undefined}
  aria-label={label}
  aria-disabled={off}
  class:off
  onpointerdown={down}
  onpointerup={cancelHold}
  onpointerleave={cancelHold}
  onpointercancel={cancelHold}
  ontouchend={(e) => held && e.preventDefault()}
  oncontextmenu={(e) => e.preventDefault()}
  onclick={tap}
>
  <HabitRing
    hue={it.hue}
    {value}
    target={h.type === 'check' || h.type === 'quit' ? 1 : h.target}
    segments={h.type === 'amount' && h.target <= 12}
    met={h.type === 'quit' ? !slipped : met}
    {slipped}
  />
</button>
<div class="text">
  <button class="title" class:done={met && h.type !== 'quit'} onclick={() => tapped(P, it.id)}>{it.title}</button>
  {#if editing}
    <form class="entry" onsubmit={(e) => (e.preventDefault(), save())}>
      <input
        bind:this={input}
        bind:value={draft}
        type="number"
        inputmode="numeric"
        min="0"
        aria-label={h.type === 'time' ? 'Minutes added by hand' : `How many ${h.unit || 'times'}`}
        onkeydown={(e) => e.key === 'Escape' && ((editing = false), e.stopPropagation())}
      />
      <span class="unit">{h.type === 'time' ? 'min by hand' : h.unit || 'times'}</span>
      <button type="submit" class="esave" class:ok={changed}>Save</button>
      <button type="button" class="ecancel" aria-label="Cancel" onclick={() => (editing = false)}>×</button>
    </form>
  {:else if sofar || h.per !== 'day' || runText}
    <span class="meta">
      {#if sofar}<span>{sofar}</span>{/if}
      {#if h.per !== 'day'}<span
          class="pips"
          style:--c={hueColor(it.hue)}
          aria-label="{period} of {h.times} this {h.per}"
        >
          {#each Array.from({ length: Math.min(h.times, 7) }, (_, i) => i) as i (i)}
            <i class:on={i < period}></i>
          {/each}
          {#if h.times > 7}<span>{period}/{h.times}</span>{/if}
          <span class="pt">this {h.per}</span>
        </span>{/if}
      {#if runText}<span class="run" class:slip={slipped}>{runText}</span>{/if}
    </span>
  {/if}
</div>

<style>
  .ctl-ring {
    --hit-x: 8px;
    --hit-y: 8px;
    width: 28px;
    height: 28px;
    flex: none;
    margin: 0 -2px 0 0;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 50%;
    touch-action: manipulation;
    -webkit-touch-callout: none;
    user-select: none;
  }
  .ctl-ring.off {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .ctl-ring:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 3px;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
  }
  .title {
    all: unset;
    font: 400 15px/1.3 var(--font);
    color: var(--text);
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .title.done {
    color: var(--muted);
  }
  .title:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 10px;
    row-gap: 2px;
    font: 400 12px/1.3 var(--font);
    color: var(--muted);
  }
  .pips {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .pips i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--pfill);
  }
  .pips i.on {
    background: var(--c);
  }
  .pt {
    margin-left: 3px;
  }
  .run.slip {
    color: var(--redT);
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .entry input {
    width: 72px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-ctl);
    background: var(--bg);
    color: var(--text);
    font: 400 16px/1 var(--font);
    box-sizing: border-box;
  }
  .esave {
    height: 34px;
    padding: 0 12px;
    border: none;
    border-radius: var(--r-ctl);
    background: var(--sunk);
    color: var(--faint);
    font: 400 13px/1 var(--font);
    cursor: pointer;
  }
  .esave.ok {
    background: var(--text);
    color: var(--bg);
    font-weight: 500;
  }
  .ecancel {
    width: 34px;
    height: 34px;
    margin-left: -4px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 18px/1 var(--font);
    cursor: pointer;
  }
  .unit {
    font: 400 13px/1 var(--font);
    color: var(--muted);
  }
</style>
