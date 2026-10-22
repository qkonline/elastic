<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { isActive, isPartial, worked } from '../lib/schedule';
  import { dL, fNZ } from '../lib/time';
  import { untimed } from '../lib/types';

  // The day's times at the top of the plan: when it started (or is planned to) and when it's
  // likely done, with the time worked and left beneath. Tapping it opens the day's hours.
  const c24 = $derived(P.settings.clock24);
  const d = $derived(P.planDay);
  const started = $derived(d.dayStarted != null);
  const live = $derived(P.isToday && d.dayEnded == null);
  const n = $derived(P.n);
  const t = (m: number) => fNZ(m, c24);

  const rows = $derived(
    P.sch.rows.filter(
      (r) => !untimed(r.it.kind) && r.it.status !== 'skipped' && !(r.it.status === 'postponed' && !isPartial(r.it)),
    ),
  );
  const open = $derived(rows.some((r) => (r.it.status === 'todo' || isActive(r.it)) && r.it.kind !== 'buffer'));
  const from = $derived(rows.length ? Math.min(rows[0].start, d.dayStarted ?? 1e9) : d.dayStart);
  const to = $derived(rows.length ? Math.max(P.sch.finish, ...rows.map((r) => r.end)) : d.wrap);
  const likely = $derived(Math.ceil(P.sch.finish / 5) * 5);
  const lastEnd = $derived.by(() => {
    const ends = d.items.map((i) => i.endedAt).filter((x): x is number => x != null);
    return ends.length ? Math.max(...ends) : null;
  });
  const doneMin = $derived(rows.reduce((s, r) => s + (r.it.kind === 'buffer' ? 0 : worked(r.it, n)), 0));
  const leftMin = $derived(live && open ? Math.max(0, likely - Math.max(n, from)) : 0);
  const over = $derived(live && open && started ? Math.round(likely - d.wrap) : 0);

  type Cell = [label: string, value: string];
  const view = $derived.by((): { cells: Cell[]; note: string } => {
    if (!started) {
      if (!P.timesShown) return { cells: [['Planned', dL(to - from)]], note: '' };
      return {
        cells: [
          ['Planned start', t(from)],
          ['Planned finish', t(to)],
        ],
        note: `${dL(to - from)} planned`,
      };
    }
    const s: Cell = ['Day started', t(d.dayStarted!)];
    const w = `${dL(doneMin)} worked`;
    if (d.dayEnded != null) return { cells: [s, ['Day ended', t(d.dayEnded)]], note: w };
    if (live && open) return { cells: [s, ['Likely done by', t(likely)]], note: `${w}, ${dL(leftMin)} to go` };
    if (lastEnd != null) return { cells: [s, ['Last task done', t(lastEnd)]], note: w };
    return { cells: [s], note: live ? 'Nothing left to do' : '' };
  });
</script>

{#if rows.length || started}
  <button
    class="times"
    aria-label={`${view.cells.map(([l, v]) => `${l} ${v}`).join(', ')}${P.locked ? '' : '. Change day hours'}`}
    onclick={() => (P.locked ? P.sayLocked() : P.openSheet({ type: 'hours' }))}
  >
    <span class="cells">
      {#each view.cells as [l, v] (l)}
        <span class="cell"><span class="l">{l}</span><span class="v">{v}</span></span>
      {/each}
    </span>
    {#if !P.locked}
      <svg class="go" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M5 3l4 4-4 4" /></svg>
    {/if}
    {#if view.note}<span class="note">{view.note}</span>{/if}
    {#if over > 0}
      <span class="over">{dL(over)} past your {t(d.wrap)} wrap-up</span>
    {/if}
  </button>
{/if}

<style>
  .times {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px 12px;
    width: calc(100% - 2 * var(--px));
    margin: 14px var(--px) 0;
    padding: 14px 14px 14px 16px;
    border: none;
    border-radius: var(--r-card);
    background: var(--raised);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
  }
  .cells {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .l {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
  .v {
    font: 600 20px/1.1 var(--font);
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .go {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .note,
  .over {
    grid-column: 1 / -1;
    font: 400 13px/1.3 var(--font);
    color: var(--muted);
  }
  .over {
    color: var(--redT);
  }
</style>
