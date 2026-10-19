<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { addQuarters, quarterLabel, quarterRange } from '../lib/goals';
  import { planner as P } from '../lib/planner.svelte';
  import { dayDiff } from '../lib/time';
  import GoalCard from './GoalCard.svelte';
  import ScreenHeader from './ScreenHeader.svelte';

  // A quarter's goals, this quarter first. Back and forward through quarters.
  let { start }: { start?: string } = $props();
  const current = $derived(P.quarterOf(P.today));
  const quarterEnd = (q: string) => quarterRange(q)[1];
  let quarter = $state(untrack(() => start) ?? P.quarterOf(P.today));
  // A goal added and left without a name goes when you leave the screen.
  onDestroy(() => {
    for (const g of P.goals) if (!g.title.trim()) void P.removeGoal(g.id);
  });
  const goals = $derived(P.goals.filter((g) => g.quarter === quarter).sort((a, b) => a.order - b.order));
  let fresh = $state<string | null>(null);

  const left = $derived(Math.max(0, dayDiff(P.today, quarterEnd(current))));
  const sub = $derived(
    quarter === current
      ? `${left === 1 ? '1 day' : `${left} days`} left this quarter`
      : quarter === addQuarters(current, 1)
        ? 'Next quarter'
        : quarter === addQuarters(current, -1)
          ? 'Last quarter'
          : quarter < current
            ? 'Earlier quarter'
            : 'Later quarter',
  );

  function add() {
    const g = P.addGoal({ quarter, title: '', why: '', target: null, milestones: [] });
    fresh = g.id;
  }
</script>

<ScreenHeader small={sub} title="Goals">
  <div class="qbar">
    <button class="nav" aria-label="Previous quarter" onclick={() => (quarter = addQuarters(quarter, -1))}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M9 3L5 7l4 4" /></svg>
    </button>
    <span class="ql">{quarterLabel(quarter)}</span>
    <button class="nav" aria-label="Next quarter" onclick={() => (quarter = addQuarters(quarter, 1))}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" /></svg>
    </button>
  </div>
</ScreenHeader>
<div class="body">
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
    <button class="btn-add" onclick={add}
      ><span class="plus" aria-hidden="true"
        ><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2.5v9M2.5 7h9" /></svg></span
      >Add a goal</button
    >
  {/if}
</div>

<style>
  .body {
    padding: 16px var(--px) 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .body > :global(*) {
    flex-shrink: 0;
  }
  .qbar {
    flex: none;
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: var(--r-ctl);
    background: var(--raised);
  }
  .ql {
    font: 500 14px/1 var(--font);
    white-space: nowrap;
  }
  .nav {
    width: 38px;
    height: 38px;
    border: none;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--text);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .nav svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .empty {
    margin: 6px 2px;
    font: 400 14px/1.5 var(--font);
    color: var(--muted);
  }
</style>
