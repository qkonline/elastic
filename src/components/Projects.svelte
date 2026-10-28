<script lang="ts">
  import { cardsFor } from '../lib/boardo.svelte';
  import { planner as P } from '../lib/planner.svelte';
  import { isActive, worked } from '../lib/schedule';
  import { dL } from '../lib/time';
  import { hueColor, isHue } from '../lib/types';
  import Collapsible from './Collapsible.svelte';

  // Project cards from Boardo for the day on screen (R8.6 to R8.11): the ones assigned to me
  // whose dates cover it, ones overdue and not done yet, and ones finished today (ticked).
  // They're never dragged into the plan: Start puts a timer for one at the current point.
  // Only shown when connected and in at least one board.
  const B = P.boardo;
  const rows = $derived(B.connected && B.boards > 0 ? cardsFor(P.viewKey, B.cards, P.today, P.settings.clock24) : []);
  const done = $derived(rows.filter((r) => r.ticked).length);
  // The card item running or paused on the day on screen, by card id.
  const going = $derived(new Map(P.day.items.filter((i) => i.card && isActive(i)).map((i) => [i.card!.id, i])));
  // Time worked on each card that day, over every time it was started (its rows in the timeline).
  const spent = $derived.by(() => {
    const m = new Map<string, number>();
    for (const i of P.day.items) if (i.card) m.set(i.card.id, (m.get(i.card.id) ?? 0) + worked(i, P.n));
    return m;
  });
  const colour = (h: string) => (h === 'rose' ? '#f43f5e' : isHue(h) ? hueColor(h) : '#22d3ee');
  let list: HTMLUListElement | null = $state(null);
  // The last fetch failed: these are the cards as they were then, which may be out of date.
  const asOf = $derived.by(() => {
    if (!B.error || !B.fetchedAt) return null;
    const d = new Date(B.fetchedAt);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !P.settings.clock24 });
    return new Date().toDateString() === d.toDateString()
      ? time
      : `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
  });
</script>

{#if B.connected && B.boards > 0}
  <Collapsible
    id="projects"
    label="Projects"
    icon="projects"
    tally={rows.length ? `${done}/${rows.length}` : ''}
    count={rows.length}
    kind="projects"
    bind:list
  >
    {#snippet children(shut)}
      {#if asOf}
        <li class="none stale">Boardo can't be reached. These are as of {asOf}.</li>
      {/if}
      {#if !rows.length}
        <li class="none">No project cards on this day.</li>
      {/if}
      {#each rows as r, i (r.card.board.id + r.card.id)}
        {@const g = going.get(r.card.id)}
        <li class:done={r.ticked} inert={shut && i >= 3}>
          <span class="bar" style:background={colour(r.card.board.hue)}></span>
          <button class="title" onclick={() => P.openSheet({ type: 'card', id: r.card.id })}>
            <span class="t">{r.card.title}</span>
            <span class="meta">
              <span class="proj" style:color={colour(r.card.board.hue)}>{r.card.board.name}</span>
              {#if r.card.status.label}<span class="st">{r.card.status.label}</span>{/if}
              {#if r.deadline}<span class:late={r.overdue}>{r.deadline}</span>{/if}
              {#if (spent.get(r.card.id) ?? 0) >= 1}<span>Worked {dL(spent.get(r.card.id)!)}</span>{/if}
              <!-- A Completed card's status already says so; "your part" only means something while
                   others still have theirs to do (a card for one person is Completed with it). -->
              {#if r.ticked && !r.card.completed}<span>Your part is done</span>
              {:else if r.ticked && !r.card.status.label}<span>Completed</span>{/if}
            </span>
          </button>
          {#if !r.ticked && P.isToday && !P.locked}
            {#if g}
              <button class="start on" onclick={() => P.startCard(r.card)}
                >{g.status === 'paused' ? 'Resume' : 'Running'}</button
              >
            {:else}
              <button
                class="start"
                aria-label="Start {r.card.title}"
                aria-disabled={P.waiting}
                onclick={() => P.startCard(r.card)}
                ><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" /></svg
                >Start</button
              >
            {/if}
          {/if}
        </li>
      {/each}
    {/snippet}
  </Collapsible>
{/if}

<style>
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    background: var(--raised);
  }
  .none {
    color: var(--muted);
    font-size: 14px;
    min-height: 40px;
  }
  .stale {
    color: var(--yelT);
  }
  .bar {
    width: 4px;
    align-self: stretch;
    margin: 8px 0;
    border-radius: var(--r-bar);
    flex: none;
  }
  .title {
    all: unset;
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 3px;
    padding: 6px 0;
    cursor: pointer;
  }
  .title:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .t {
    font: 400 15px/1.3 var(--font);
    color: var(--text);
    overflow-wrap: anywhere;
  }
  .done .t {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: var(--faint);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    font: 400 12px/1.3 var(--font);
    color: var(--muted);
  }
  .proj {
    font-weight: 500;
    filter: brightness(0.85);
  }
  .st {
    padding: 2px 6px;
    border-radius: var(--r-sm);
    background: var(--sunk);
  }
  .late {
    color: var(--redT);
    font-weight: 500;
  }
  .start {
    flex: none;
    min-height: 40px;
    padding: 0 12px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 13px/1 var(--font);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .start svg {
    fill: currentColor;
  }
  .start[aria-disabled='true'] {
    opacity: 0.45;
  }
  .start.on {
    border-color: var(--now);
    color: var(--nowT);
  }
</style>
