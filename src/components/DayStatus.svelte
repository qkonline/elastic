<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { planner as P } from '../lib/planner.svelte';
  import { isActive } from '../lib/schedule';
  import { dL, fNZ } from '../lib/time';
  import { untimed } from '../lib/types';
  import { reducedMotion } from '../lib/ui.svelte';

  // Once a day has started: when it began, when it's likely to end, and a thread in the task
  // colours showing how far along it is. It takes the place of the Start my day button, and
  // tapping it opens the day's hours. Before the day starts there's nothing to show.
  const c24 = $derived(P.settings.clock24);
  const d = $derived(P.day);
  const live = $derived(P.isToday && d.dayEnded == null);
  // Still something to do that takes time (checks and leftover buffers don't keep a day going).
  const open = $derived(
    d.items.some((i) => (i.status === 'todo' || isActive(i)) && !untimed(i.kind) && i.kind !== 'buffer'),
  );
  const likely = $derived(Math.ceil(P.sch.finish / 5) * 5);
  // A past day that was never ended: the last thing finished is as close as it gets.
  const lastEnd = $derived.by(() => {
    const ends = d.items.map((i) => i.endedAt).filter((x): x is number => x != null);
    return ends.length ? Math.max(...ends) : null;
  });
  const over = $derived(live && open ? Math.round(likely - d.wrap) : 0);
  const done = $derived.by(() => {
    const s = d.dayStarted;
    if (s == null || !live || !open) return 1;
    return likely > s ? Math.min(1, Math.max(0, (P.n - s) / (likely - s))) : 1;
  });
  const summary = $derived(
    d.dayEnded != null
      ? `ended at ${fNZ(d.dayEnded, c24)}`
      : live
        ? open
          ? `likely done by ${fNZ(likely, c24)}`
          : 'nothing left to do'
        : lastEnd != null
          ? `last task done at ${fNZ(lastEnd, c24)}`
          : '',
  );
  const unfold = () => ({ duration: reducedMotion.current ? 0 : 280, easing: cubicOut });
</script>

{#if d.dayStarted != null}
  <button
    class="status"
    in:slide={unfold()}
    aria-label={`Day started at ${fNZ(d.dayStarted, c24)}${summary ? ', ' + summary : ''}${P.locked ? '' : '. Change day hours'}`}
    onclick={() => (P.locked ? P.sayLocked() : P.openSheet({ type: 'hours' }))}
  >
    <span class="line">
      <span>Day started at <span class="t">{fNZ(d.dayStarted, c24)}</span></span>
      {#if d.dayEnded != null}
        <span>Ended at <span class="t">{fNZ(d.dayEnded, c24)}</span></span>
      {:else if live && open}
        <span>Likely done by <span class="t" class:late={over > 0}>{fNZ(likely, c24)}</span></span>
      {:else if live}
        <span>Nothing left to do</span>
      {:else if lastEnd != null}
        <span>Last task done at <span class="t">{fNZ(lastEnd, c24)}</span></span>
      {/if}
    </span>
    <span class="thread" aria-hidden="true">
      <span class="rest" style:left="{done * 100}%"></span>
      {#if done < 1}<span class="now" style:left="{done * 100}%"></span>{/if}
    </span>
    {#if over > 0}
      <span class="over">{dL(over)} past your {fNZ(d.wrap, c24)} wrap-up</span>
    {/if}
  </button>
{/if}

<style>
  .status {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: calc(100% - 2 * var(--px));
    margin: 16px var(--px) 6px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 15px/1.3 var(--font);
    text-align: left;
    cursor: pointer;
  }
  .status:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 6px;
    border-radius: 6px;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 16px;
  }
  .t {
    color: var(--text);
  }
  .t.late {
    color: var(--redT);
  }
  /* The same five colours as the Start my day button it replaces; the grey is what's left. */
  .thread {
    position: relative;
    height: 4px;
    border-radius: 99px;
    background: linear-gradient(90deg, #fb923c, #fde047, #a3e635, #22d3ee, #818cf8);
  }
  .rest {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    border-radius: 0 99px 99px 0;
    background: var(--line);
  }
  .now {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    border-radius: 99px;
    background: var(--now);
    box-shadow: 0 0 0 3px var(--bg);
  }
  .over {
    font: 400 13px/1.3 var(--font);
    color: var(--redT);
  }
</style>
