<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { addQuarters, quarterLabel } from '../lib/goals';
  import { planner as P } from '../lib/planner.svelte';
  import GoalCard from './GoalCard.svelte';

  // A quarter's goals, this quarter first. Back and forward through quarters.
  let { start }: { start?: string } = $props();
  const current = $derived(P.quarterOf(P.today));
  let quarter = $state(untrack(() => start) ?? P.quarterOf(P.today));
  // A goal added and left without a name goes when the sheet closes.
  onDestroy(() => {
    for (const g of P.goals) if (!g.title.trim()) void P.removeGoal(g.id);
  });
  const goals = $derived(P.goals.filter((g) => g.quarter === quarter).sort((a, b) => a.order - b.order));
  let fresh = $state<string | null>(null);

  function add() {
    const g = P.addGoal({ quarter, title: '', why: '', target: null, milestones: [] });
    fresh = g.id;
  }
</script>

<div class="head">
  <span class="h">Goals</span>
  <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
</div>
<div class="body">
  <div class="qbar">
    <button class="nav" aria-label="Previous quarter" onclick={() => (quarter = addQuarters(quarter, -1))}>‹</button>
    <span class="q">
      <span class="ql">{quarterLabel(quarter)}</span>
      <span class="qs"
        >{quarter === current
          ? 'This quarter'
          : quarter === addQuarters(current, 1)
            ? 'Next quarter'
            : quarter === addQuarters(current, -1)
              ? 'Last quarter'
              : ''}</span
      >
    </span>
    <button class="nav" aria-label="Next quarter" onclick={() => (quarter = addQuarters(quarter, 1))}>›</button>
  </div>

  {#if !goals.length}
    <p class="empty">
      {quarter < current
        ? 'No goals were set for this quarter.'
        : 'What do you want to have done by the end of the quarter? A few goals keep the days pointed somewhere.'}
    </p>
  {/if}
  {#each goals as g (g.id)}
    <GoalCard goal={g} startEditing={g.id === fresh} />
  {/each}
  {#if quarter >= current}
    <button class="add" onclick={add}>Add a goal</button>
  {/if}
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
  }
  .h {
    flex: 1;
    font: 400 21px/1.2 var(--font);
    letter-spacing: -0.01em;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 16px calc(28px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .body > :global(*) {
    flex-shrink: 0;
  }
  .qbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .q {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .ql {
    font: 400 16px/1 var(--font);
  }
  .qs {
    font: 400 12px/1 var(--font);
    color: var(--muted);
    min-height: 12px;
  }
  .nav {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    font: 400 22px/1 var(--font);
    cursor: pointer;
  }
  .empty {
    margin: 6px 2px;
    font: 400 14px/1.5 var(--font);
    color: var(--muted);
  }
  .add {
    align-self: flex-start;
    height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
</style>
