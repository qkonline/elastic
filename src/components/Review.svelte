<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { addQuarters, quarterLabel, suggestStatus } from '../lib/goals';
  import { weekSpan } from '../lib/review';
  import { planner as P } from '../lib/planner.svelte';
  import { dL, fT } from '../lib/time';
  import type { Goal, Review } from '../lib/types';
  import GoalCard from './GoalCard.svelte';
  import ReviewNumbers from './ReviewNumbers.svelte';
  import ScreenHeader from './ScreenHeader.svelte';

  // The weekly or quarterly review that's due (or this week so far), and past reviews to read
  // back. A week's review is its numbers and a check-in on the quarter's goals; a quarter's is
  // how each goal went, the quarter's numbers, and the next quarter's goals.
  // Opening a review that's due counts as having done it: it's saved straight away (so the card
  // on Today goes), and saved again on leaving, with whatever was checked in on meanwhile. The
  // screen keeps showing that review after it's saved.
  let { id }: { id?: string } = $props();

  const past = $derived(id ? P.reviews.find((r) => r.id === id) : undefined);
  const due = untrack(() => (id ? null : P.dueReview));
  onMount(() => {
    if (due) P.finishReview(due);
    return () => {
      if (due) P.finishReview(due);
    };
  });
  // Once a minute is plenty (numbersFor reads the clock, which ticks 4 times a second).
  const live = $derived.by(() => {
    void P.minute;
    return untrack(() => (due ? P.numbersFor(due.from, due.to) : P.numbersFor(...P.thisWeek())));
  });
  const goals = $derived(due ? P.goalsFor(due) : []);
  const history = $derived(
    P.reviews
      .filter((r) => r.done != null && r.id !== due?.id)
      .sort((a, b) => (a.to < b.to ? 1 : a.to > b.to ? -1 : a.kind === 'quarter' ? -1 : 1)),
  );
  const nextQ = $derived(due?.kind === 'quarter' ? addQuarters(due.id, 1) : null);
  const nextGoals = $derived(nextQ ? P.goals.filter((g) => g.quarter === nextQ) : []);
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const titleOf = (r: { kind: 'week' | 'quarter'; id: string; from: string; to: string }) =>
    r.kind === 'quarter' ? quarterLabel(r.id) : weekSpan(r.from, r.to);
  const small = $derived.by(() => {
    if (due)
      return due.kind === 'quarter'
        ? quarterLabel(due.id)
        : `${due.to >= P.today ? 'This week' : 'Last week'}, ${titleOf(due)}`;
    const [from, to] = P.thisWeek();
    return `This week, ${weekSpan(from, to)}`;
  });
  const STATUS: [Goal['status'], string][] = [
    ['hit', 'Hit'],
    ['partly', 'Partly'],
    ['missed', 'Missed'],
  ];
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  function snapshotLine(g: Review['goals'][number]): string {
    const parts: string[] = [];
    if (g.target)
      parts.push(`${fmt(g.target.now)} of ${fmt(g.target.goal)}${g.target.unit ? ' ' + g.target.unit : ''}`);
    if (g.milestones[1]) parts.push(`${g.milestones[0]} of ${g.milestones[1]} milestones`);
    if (g.minutes >= 1) parts.push(`${dL(g.minutes)} on its tasks`);
    if (g.habitDays) parts.push(`${g.habitDays} habit days`);
    return parts.join(', ');
  }
</script>

{#if past}
  <ScreenHeader title={titleOf(past)} back={() => P.openScreen({ type: 'review' })} />
{:else}
  <ScreenHeader {small} title="Review" />
{/if}
<div class="body">
  {#if past}
    <p class="when">
      {past.kind === 'week' ? 'Weekly review' : 'Quarterly review'}, done {past.done
        ? new Date(past.done).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
        : ''}
    </p>
    {#if past.numbers}
      <section class="card"><ReviewNumbers numbers={past.numbers} /></section>
    {/if}
    {#if past.goals.length}
      <section class="card">
        <span class="lbl">Goals then</span>
        <ul class="snap">
          {#each past.goals as g (g.id)}
            <li>
              <span class="gt">{g.title}</span>
              {#if g.status !== 'open'}<span class="st {g.status}">{STATUS.find(([s]) => s === g.status)?.[1]}</span
                >{/if}
              {#if snapshotLine(g)}<span class="gl">{snapshotLine(g)}</span>{/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else}
    {#if due}
      <section class="card lead">
        <span class="kind">{due.kind === 'week' ? 'Your week in review' : 'Your quarter in review'}</span>
        <span class="range">{titleOf(due)}</span>
      </section>
      <section class="card"><ReviewNumbers numbers={live} /></section>

      {#if due.kind === 'week'}
        {#if goals.length}
          <span class="sect">Check in on your goals</span>
          {#each goals as g (g.id)}
            <GoalCard goal={g} />
          {/each}
        {:else}
          <p class="muted">
            No goals for this quarter yet. <button class="link" onclick={() => P.openScreen({ type: 'goals' })}
              >Set some</button
            >
          </p>
        {/if}
      {:else}
        <span class="sect">How did each goal go?</span>
        {#each goals as g (g.id)}
          {@const p = P.progressOf(g)}
          {@const status = g.status === 'open' ? suggestStatus(p) : g.status}
          <section class="card result">
            <span class="gt">{g.title}</span>
            <div class="chips" role="group" aria-label="How {g.title} went">
              {#each STATUS as [s, l] (s)}
                <button class="chip" aria-pressed={status === s} onclick={() => P.editGoal(g.id, { status: s })}
                  >{l}</button
                >
              {/each}
            </div>
            {#if status !== 'hit' && nextQ}
              <button
                class="link"
                disabled={nextGoals.some((x) => x.title === g.title)}
                onclick={() => P.carryGoal(g.id)}
                >{nextGoals.some((x) => x.title === g.title)
                  ? 'Carried into next quarter'
                  : 'Carry it into next quarter'}</button
              >
            {/if}
          </section>
        {:else}
          <p class="muted">There were no goals for this quarter.</p>
        {/each}
        {#if nextQ}
          <section class="card">
            <span class="kind">Next quarter, {quarterLabel(nextQ)}</span>
            <span class="muted"
              >{nextGoals.length
                ? `${nextGoals.length} ${nextGoals.length === 1 ? 'goal' : 'goals'} so far.`
                : 'No goals yet.'}</span
            >
            <button class="pill" onclick={() => P.openScreen({ type: 'goals', quarter: nextQ })}
              >Set next quarter's goals</button
            >
          </section>
        {/if}
      {/if}

      <div class="acts">
        <button class="pill pri" onclick={() => P.openScreen({ type: 'today' })}>Done</button>
      </div>
    {:else}
      <section class="card">
        <span class="kind">This week so far</span>
        <ReviewNumbers numbers={live} />
      </section>
      <p class="muted">
        Your weekly review comes up on {WEEKDAYS[P.settings.reviewDay]}s at {fT(
          P.settings.reviewAt,
          P.settings.clock24,
        )}. You can change that in Settings.
      </p>
    {/if}

    {#if history.length}
      <span class="sect">Past reviews</span>
      <ul class="hist">
        {#each history as r (r.id)}
          <li>
            <button onclick={() => P.openScreen({ type: 'review', id: r.id })}>
              <span>{titleOf(r)}</span>
              <span class="k">{r.kind === 'week' ? 'Week' : 'Quarter'}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
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
  .card {
    padding: 14px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lead {
    background:
      linear-gradient(var(--raised), var(--raised)) padding-box,
      linear-gradient(120deg, var(--rainbow-stops)) border-box;
    border: 1.5px solid transparent;
    gap: 4px;
  }
  .kind {
    font: 600 16px/1.3 var(--font);
  }
  .range,
  .when,
  .muted {
    margin: 0;
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
  }
  .sect,
  .lbl {
    margin-top: 6px;
    font: 400 13px/1 var(--font);
    color: var(--muted);
  }
  .lbl {
    margin: 0;
  }
  .result {
    gap: 10px;
  }
  .gt {
    font: 400 15px/1.3 var(--font);
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .link {
    align-self: flex-start;
    border: none;
    background: transparent;
    padding: 0;
    color: var(--text);
    text-decoration: underline;
    text-underline-offset: 3px;
    font: 400 13px/1.4 var(--font);
    cursor: pointer;
  }
  .link:disabled {
    color: var(--muted);
    text-decoration: none;
    cursor: default;
  }
  .acts {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .pill {
    height: 48px;
    padding: 0 18px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 15px/1 var(--font);
    cursor: pointer;
    align-self: flex-start;
  }
  .pill.pri {
    flex: 1;
    border-color: var(--text);
    background: var(--text);
    color: var(--bg);
  }
  .snap {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .snap li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
  }
  .gl {
    flex-basis: 100%;
    font: 400 12px/1.4 var(--font);
    color: var(--muted);
  }
  .st {
    font: 400 12px/1 var(--font);
    color: var(--muted);
  }
  .st.hit {
    color: var(--grT);
  }
  .st.missed {
    color: var(--redT);
  }
  .hist {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: var(--r-card);
    border: 1px solid var(--border);
    background: var(--raised);
    overflow: hidden;
  }
  .hist li + li {
    border-top: 1px solid var(--border);
  }
  .hist button {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 48px;
    padding: 0 16px;
    font: 400 15px/1.3 var(--font);
    cursor: pointer;
  }
  .hist button:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: -2px;
  }
  .k {
    font: 400 12px/1 var(--font);
    color: var(--muted);
  }
</style>
