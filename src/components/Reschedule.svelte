<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import type { ItemVM } from '../lib/rows';
  import { addDays, fT } from '../lib/time';
  import { intoView } from '../lib/ui.svelte';

  let { v }: { v: ItemVM } = $props();
  const c24 = $derived(P.settings.clock24);
  const tomorrow = $derived(addDays(P.today, 1));
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
      <span class="label tight">Later today</span>
      <div class="line">
        <input type="time" aria-label="Time" bind:value={P.resched.time} />
        <button class="b" onclick={() => P.reschedLater(v.id)}>Move</button>
      </div>
    </div>
    <div class="group">
      <span class="label tight">Another day</span>
      <div class="line wrap">
        <button class="b" onclick={() => P.moveToDay(v.id, tomorrow)}>Tomorrow</button>
        <input type="date" aria-label="Date" min={tomorrow} bind:value={P.resched.date} />
        <button class="b" onclick={() => P.resched?.date && P.moveToDay(v.id, P.resched.date)}>Move</button>
      </div>
    </div>
    <button class="cancel" onclick={() => (P.resched = null)}>Cancel</button>
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
  .line {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .line.wrap {
    flex-wrap: wrap;
  }
  input {
    flex: 1 1 auto;
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
  input[type='date'] {
    flex: 1 1 130px;
  }
  .b {
    height: 44px;
    padding: 0 16px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
    white-space: nowrap;
  }
  .cancel {
    align-self: flex-start;
    height: 40px;
    padding: 0 2px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
</style>
