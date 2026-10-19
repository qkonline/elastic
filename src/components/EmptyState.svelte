<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
</script>

<div class="empty">
  <span class="cap" aria-hidden="true"></span>
  <div class="h">Nothing planned yet.</div>
  <div class="p">
    Add what you want to do and how long it takes. The order is the plan, and the times work themselves out.
  </div>
  <button class="sample" onclick={() => P.loadSample()}>load a sample day</button>
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
  .sample {
    border: none;
    background: transparent;
    color: var(--orT);
    font: 400 14px/1 var(--font);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    padding: 12px;
  }
</style>
