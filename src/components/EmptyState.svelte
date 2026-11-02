<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { keyDate, shortDate } from '../lib/time';

  // A day with nothing in it: say how planning works, and start it (or try a sample day). A day
  // gone by that was never planned says so, with no sample day.
  const past = $derived(P.viewKey < P.today);
  function add() {
    if (P.locked) P.sayLocked();
    else P.openSheet({ type: 'add' });
  }
</script>

<div class="empty">
  <span class="cap" aria-hidden="true"></span>
  {#if past}
    <div class="h">Nothing was planned for {shortDate(keyDate(P.viewKey))}.</div>
    <div class="p">You can still add what you did, to keep a record of it.</div>
  {:else}
    <div class="h">Nothing planned yet.</div>
    <div class="p">
      Add what you want to do and how long it takes. The order is the plan, and the times work themselves out.
    </div>
  {/if}
  <button class="btn-add" onclick={add}
    ><span class="plus" aria-hidden="true"
      ><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2.5v9M2.5 7h9" /></svg></span
    >{past ? 'Add what you did' : 'Add a task'}</button
  >
  {#if !past}<button class="btn-plain sample" onclick={() => P.loadSample()}>Try a sample day</button>{/if}
</div>

<style>
  .empty {
    margin: 20px var(--px);
    padding: 40px 24px;
    border: 1.5px dashed var(--line);
    border-radius: var(--r-card);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }
  .cap {
    width: 10px;
    height: 56px;
    border-radius: var(--r-bar);
    border: 1.5px dashed var(--faint);
    margin-bottom: 6px;
  }
  .h {
    font: 600 19px/1.2 var(--font);
  }
  .p {
    font: 400 15px/1.5 var(--font);
    color: var(--muted);
    max-width: 320px;
    text-wrap: pretty;
  }
  .btn-add {
    margin-top: 8px;
  }
  .sample {
    height: 44px;
    font-size: 14px;
  }
</style>
