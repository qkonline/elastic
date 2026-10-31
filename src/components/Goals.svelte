<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { addQuarters, quarterLabel, quarterRange } from '../lib/goals';
  import { planner as P } from '../lib/planner.svelte';
  import { dayDiff } from '../lib/time';
  import type { Goal } from '../lib/types';
  import GoalCard from './GoalCard.svelte';
  import ScreenHeader from './ScreenHeader.svelte';

  // A quarter's goals, this quarter first. Back and forward through quarters.
  let { start }: { start?: string } = $props();
  const current = $derived(P.quarterOf(P.today));
  const quarterEnd = (q: string) => quarterRange(q)[1];
  let quarter = $state(untrack(() => start) ?? P.quarterOf(P.today));
  // A goal left without a name (only older versions could store one) goes when you leave the screen.
  onDestroy(() => {
    for (const g of P.goals) if (!g.title.trim()) void P.removeGoal(g.id);
  });
  const goals = $derived(P.goals.filter((g) => g.quarter === quarter).sort((a, b) => a.order - b.order));
  // A new goal being written: not stored until Add goal.
  let adding = $state<Goal | null>(null);

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

  function add(title = '', target: Goal['target'] = null) {
    adding = { id: '', quarter, title, why: '', target, milestones: [], status: 'open', order: 0 };
  }
  // With no goals yet this quarter: a few to start from. A tap opens a new goal filled in.
  const EXAMPLES: { title: string; target: Goal['target'] }[] = [
    { title: 'Launch the new website', target: null },
    { title: 'Read 6 books', target: { now: 0, goal: 6, unit: 'books' } },
    { title: 'Run 100 km', target: { now: 0, goal: 100, unit: 'km' } },
  ];
  // The + (bottom bar, sidebar) on this screen: a new goal, in this quarter or a later one.
  let asked = untrack(() => P.goalAsked);
  $effect(() => {
    if (P.goalAsked === asked) return;
    asked = P.goalAsked;
    untrack(() => {
      if (quarter < current) quarter = current;
      if (adding?.quarter !== quarter) add();
    });
  });
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
    {#if quarter >= current && !adding}
      <div class="examples" role="group" aria-label="Examples">
        <span class="label">For example</span>
        {#each EXAMPLES as x (x.title)}
          <button class="example" onclick={() => add(x.title, x.target && { ...x.target })}>{x.title}</button>
        {/each}
      </div>
    {/if}
  {/if}
  {#each goals as g (g.id)}
    <GoalCard goal={g} />
  {/each}
  {#if adding?.quarter === quarter}
    {#key adding}<GoalCard goal={adding} onclose={() => (adding = null)} />{/key}
  {:else if quarter >= current}
    <button class="btn-add" onclick={() => add()}
      ><span class="plus" aria-hidden="true"
        ><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2.5v9M2.5 7h9" /></svg></span
      >Add a goal</button
    >
  {/if}
</div>

<style>
  .examples {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 6px;
  }
  .example {
    min-height: 48px;
    padding: 0 14px;
    border: 1px dashed var(--line);
    border-radius: var(--r-ctl);
    background: var(--raised);
    color: var(--text);
    font: 400 15px/1.3 var(--font);
    text-align: left;
    cursor: pointer;
  }
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
