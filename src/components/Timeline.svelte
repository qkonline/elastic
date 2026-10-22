<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { dragShifts, timelineRows } from '../lib/rows';
  import { untimed } from '../lib/types';
  import ItemRow from './ItemRow.svelte';
  import NowLine from './NowLine.svelte';
  import SectionHead from './SectionHead.svelte';

  let listEl: HTMLOListElement | null = $state(null);

  const showTimes = $derived(
    !P.isToday || P.settings.showTimes === 'always' || (P.settings.showTimes === 'started' && P.day.dayStarted != null),
  );
  const rows = $derived(
    timelineRows({
      day: P.day,
      rows: P.sch.rows,
      n: P.n,
      isToday: P.isToday,
      showTimes,
      clock24: P.settings.clock24,
    }),
  );
  // While a task is dragged, the rows between its old and new place slide to open a gap.
  const shifts = $derived(dragShifts(rows, P.drag, P.day.items.length));
  // The title bar's count: the day's timed tasks (not buffers, nor ones skipped or moved off).
  const tasks = $derived(
    P.day.items.filter(
      (i) => !untimed(i.kind) && i.kind !== 'buffer' && i.status !== 'skipped' && i.status !== 'postponed',
    ),
  );
  const done = $derived(tasks.filter((i) => i.status === 'done').length);
  const moved = (key: string) => (shifts[key] ? `translateY(${shifts[key]}px)` : undefined);
</script>

<div class="thead"><SectionHead icon="timed" title="Timed tasks" tally={tasks.length ? `${done}/${tasks.length}` : ''} /></div>
<ol
  class="timeline"
  class:no-times={!showTimes}
  class:sorting={!!P.drag}
  bind:this={listEl}
  aria-label="Plan for the day"
>
  {#each rows as r (r.key)}
    {#if r.type === 'item'}
      <ItemRow v={r} list={() => listEl} shift={shifts[r.key] ?? 0} />
    {:else if r.type === 'gap'}
      <li class="gap" style:transform={moved(r.key)}>
        <span></span>
        <span class="gline"><span></span></span>
        <span class="gtext"><span>{r.gap}</span> unaccounted for</span>
      </li>
    {:else}
      <li class="now" aria-label="Now" style:transform={moved(r.key)}><NowLine /></li>
    {/if}
  {/each}
</ol>

<style>
  .thead {
    margin: 14px var(--px) 0;
  }
  .timeline {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 10px var(--px) 12px;
    display: flex;
    flex-direction: column;
  }
  /* Times hidden (setting, or the day hasn't started): drop their column, and the spine and
     tasks move over into the space. Every row sizes that column from --tc. */
  .timeline.no-times {
    --tc: 0px;
  }
  .timeline.no-times :global(.times) {
    padding: 0;
  }
  .gap {
    display: grid;
    grid-template-columns: var(--tc) var(--sc) minmax(0, 1fr);
    min-height: 30px;
    align-items: center;
  }
  /* Idle time: a hatched stretch of the colour bar. */
  .gline {
    align-self: stretch;
    display: flex;
    justify-content: center;
    padding: 2px 0;
  }
  .gline span {
    width: 8px;
    border-radius: var(--r-bar);
    background: repeating-linear-gradient(135deg, var(--line) 0 3px, transparent 3px 6px);
  }
  .gtext {
    font: 400 13px/1 var(--font);
    color: var(--muted);
    padding-left: 10px;
  }
  .gtext span {
    color: var(--orT);
  }
  /* Rows glide out of the way while a task is dragged (the lifted row follows the finger). */
  .sorting > :global(li:not(.lifted)) {
    transition: transform 180ms ease;
  }
  .now {
    display: grid;
    grid-template-columns: var(--tc) minmax(0, 1fr);
    align-items: center;
    height: 22px;
    position: relative;
    z-index: 2;
  }
</style>
