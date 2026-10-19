<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { dayStats } from '../lib/schedule';
  import { dL, fNZ } from '../lib/time';

  // "End my day": what got done, and what to do with the rest.
  const items = $derived(P.day.items);
  const st = $derived(dayStats(P.day, P.n));
  // One-off things not done yet. Repeating ones come back tomorrow by themselves.
  const left = $derived(items.filter((i) => i.status === 'todo' && i.kind !== 'buffer' && i.repeat === 'Once'));
  const started = $derived(P.day.dayStarted);
</script>

<div class="head">
  <span class="h">End your day?</span>
  {#if started != null}
    <span class="note">You started at {fNZ(started, P.settings.clock24)}.</span>
  {/if}
</div>

<div class="stats">
  <div class="stat"><span class="num">{st.tasksDone}/{st.tasks}</span><span class="what">tasks done</span></div>
  <div class="stat"><span class="num">{dL(st.logged)}</span><span class="what">logged</span></div>
  {#if st.checks}
    <div class="stat"><span class="num">{st.checksDone}/{st.checks}</span><span class="what">checks</span></div>
  {/if}
</div>

{#if P.active}
  <p class="note running">{P.active.title} is still running. It will be marked done.</p>
{/if}

{#if left.length}
  <div class="left">
    <span class="label">Not done yet</span>
    <ul>
      {#each left.slice(0, 5) as it (it.id)}<li>{it.title}</li>{/each}
    </ul>
    {#if left.length > 5}<span class="more">and {left.length - 5} more</span>{/if}
  </div>
{/if}

<div class="foot">
  {#if left.length}
    <button class="pri" onclick={() => P.endDay(true)}>End and move {left.length} to tomorrow</button>
    <button class="sec" onclick={() => P.endDay(false)}>End and leave them here</button>
  {:else}
    <button class="pri" onclick={() => P.endDay(false)}>End my day</button>
  {/if}
  <button class="cancel" onclick={() => P.closeSheet()}>Not yet</button>
</div>

<style>
  .head {
    padding: 22px 20px 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .h {
    font: 600 21px/1.2 var(--font);
    letter-spacing: -0.01em;
  }
  .note {
    margin: 0;
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
  }
  .running {
    padding: 0 20px 4px;
  }
  .stats {
    display: flex;
    gap: 10px;
    padding: 14px 20px 12px;
  }
  .stat {
    flex: 1;
    padding: 12px 14px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .num {
    font: 600 26px/1 var(--font);
    letter-spacing: -0.02em;
  }
  .what {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
  .left {
    padding: 4px 20px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    font: 400 15px/1.5 var(--font);
  }
  .more {
    font: 400 13px/1 var(--font);
    color: var(--muted);
  }
  .foot {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 18px 20px calc(20px + env(safe-area-inset-bottom));
  }
  .foot button {
    height: 48px;
    border-radius: var(--r-card);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .pri {
    border: none;
    background: var(--text);
    color: var(--bg);
  }
  .sec {
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
  }
  .cancel {
    border: none;
    background: transparent;
    color: var(--muted);
  }
</style>
