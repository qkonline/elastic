<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';

  // A day with nothing in it: say how planning works, and start it (or try a sample day).
  function add() {
    if (P.locked) P.sayLocked();
    else P.openSheet({ type: 'add' });
  }
</script>

<div class="empty">
  <span class="cap" aria-hidden="true"></span>
  <div class="h">Nothing planned yet.</div>
  <div class="p">
    Add what you want to do and how long it takes. The order is the plan, and the times work themselves out.
  </div>
  <button class="btn-add" onclick={add}
    ><span class="plus" aria-hidden="true"
      ><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2.5v9M2.5 7h9" /></svg></span
    >Add a task</button
  >
  <button class="btn-plain sample" onclick={() => P.loadSample()}>Try a sample day</button>
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
