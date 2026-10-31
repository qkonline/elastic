<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import type { ItemVM } from '../lib/rows';
  import { addDays, fT, hm, keyDate, shortDate } from '../lib/time';
  import { intoView } from '../lib/ui.svelte';

  // Start it now, or pick where it goes (later today, tomorrow or another day) and Move it there:
  // one Move button, named after where it's going.
  let { v }: { v: ItemVM } = $props();
  const c24 = $derived(P.settings.clock24);
  const tomorrow = $derived(addDays(P.today, 1));
  let where = $state<'later' | 'tomorrow' | 'day'>('later');
  const WHERE = [
    ['later', 'Later'],
    ['tomorrow', 'Tomorrow'],
    ['day', 'Another day'],
  ] as const;
  function pick(w: typeof where) {
    where = w;
    // Tomorrow has its own choice, so another day starts the day after.
    if (w === 'day' && P.resched && (!P.resched.date || P.resched.date <= tomorrow))
      P.resched.date = addDays(tomorrow, 1);
  }
  const ready = $derived(
    !!P.resched && (where === 'tomorrow' || (where === 'later' ? !!P.resched.time : !!P.resched.date)),
  );
  const moveLabel = $derived(
    !P.resched || !ready
      ? 'Move'
      : where === 'later'
        ? `Move to ${fT(hm(P.resched.time), c24)}`
        : where === 'tomorrow'
          ? 'Move to tomorrow'
          : `Move to ${shortDate(keyDate(P.resched.date))}`,
  );
  function move() {
    if (!ready || !P.resched) return;
    if (where === 'later') P.reschedLater(v.id);
    else void P.moveToDay(v.id, where === 'tomorrow' ? tomorrow : P.resched.date);
  }
</script>

{#if P.resched}
  <div class="panel" role="group" aria-label="Reschedule {v.it.title}" {@attach intoView}>
    <div class="head">
      <span class="h">Reschedule</span>
      <span class="was">Planned {fT(v.start, c24)} – {fT(v.end, c24)}</span>
    </div>
    <button class="now" onclick={() => P.reschedNow(v.id)}>
      {P.active ? `Do it next, after ${P.active.title}` : '▶ Start now'}
    </button>
    <div class="group">
      <span class="label tight" id="move-to-{v.id}">Or move it to</span>
      <div class="where" role="radiogroup" aria-labelledby="move-to-{v.id}">
        {#each WHERE as [w, label] (w)}
          <button role="radio" aria-checked={where === w} class:on={where === w} onclick={() => pick(w)}>{label}</button
          >
        {/each}
      </div>
      {#if where === 'later'}
        <input type="time" aria-label="Time" bind:value={P.resched.time} />
      {:else if where === 'day'}
        <input type="date" aria-label="Date" min={addDays(tomorrow, 1)} bind:value={P.resched.date} />
      {/if}
    </div>
    <div class="foot">
      <button class="cancel" onclick={() => (P.resched = null)}>Cancel</button>
      <button class="b" disabled={!ready} onclick={move}>{moveLabel}</button>
    </div>
  </div>
{/if}

<style>
  .panel {
    padding: 14px;
    border-radius: var(--r-card);
    background: var(--sunk);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .h {
    font: 400 15px/1.3 var(--font);
  }
  .was {
    font: 400 13px/1.3 var(--font);
    color: var(--muted);
  }
  .now {
    height: 48px;
    padding: 0 14px;
    border-radius: var(--r-ctl);
    background: var(--text);
    color: var(--bg);
    border: 1px solid var(--text);
    font: 400 15px/1.2 var(--font);
    cursor: pointer;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .tight {
    letter-spacing: 0.05em;
  }
  /* Where it goes: three choices side by side, the picked one raised. */
  .where {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-ctl);
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .where button {
    flex: 1 1 auto;
    min-height: 40px;
    padding: 0 6px;
    white-space: nowrap;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    font: 400 14px/1.2 var(--font);
    cursor: pointer;
  }
  .where button.on {
    background: var(--raised);
    color: var(--text);
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  input {
    width: 100%;
    min-width: 0;
    height: 44px;
    padding: 0 10px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 15px/1 var(--font);
    box-sizing: border-box;
  }
  .b {
    height: 44px;
    padding: 0 16px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 500 14px/1 var(--font);
    cursor: pointer;
    white-space: nowrap;
  }
  .b:disabled {
    color: var(--faint);
    cursor: default;
  }
  .cancel {
    height: 40px;
    padding: 0 2px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
</style>
