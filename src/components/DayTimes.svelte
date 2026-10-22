<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { isActive, isPartial, worked } from '../lib/schedule';
  import { dL, fNZ } from '../lib/time';
  import { untimed } from '../lib/types';

  // The day's times at the top of the plan: when it started (or is planned to) and when it's
  // likely done, a bar between them filled up to now, and the time worked and left beneath.
  // Edit opens the day's hours.
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
  const view = $derived.by((): { cells: Cell[]; left: string; right: string; p: number | null } => {
    if (!started) {
      if (!P.timesShown) return { cells: [['Planned', dL(to - from)]], left: '', right: '', p: null };
      return {
        cells: [
          ['Planned start', t(from)],
          ['Planned finish', t(to)],
        ],
        left: `${dL(to - from)} planned`,
        right: '',
        p: 0,
      };
    }
    const s: Cell = ['Day started', t(d.dayStarted!)];
    const w = `${dL(doneMin)} worked`;
    if (d.dayEnded != null) return { cells: [s, ['Day ended', t(d.dayEnded)]], left: w, right: '', p: 1 };
    if (live && open) {
      const p = Math.max(0, Math.min(1, (n - d.dayStarted!) / Math.max(1, likely - d.dayStarted!)));
      return { cells: [s, ['Likely done by', t(likely)]], left: w, right: `${dL(leftMin)} to go`, p };
    }
    if (lastEnd != null) return { cells: [s, ['Last task done', t(lastEnd)]], left: w, right: '', p: 1 };
    return { cells: [s], left: live ? 'Nothing left to do' : '', right: '', p: null };
  });
  // The bar runs in the day's colours, sunrise to evening, filled up to now.
  const nowDot = $derived(live && open && started);
</script>

{#snippet sun()}
  <svg class="ic sun" viewBox="0 1.9 20 20" width="15" height="15" aria-hidden="true"
    ><path d="M5.8 14.5a4.2 4.2 0 0 1 8.4 0" /><path d="M2.5 14.5h15M10 5.4v2M4.6 8.2l1.3 1.3M15.4 8.2l-1.3 1.3" /></svg
  >
{/snippet}
{#snippet moon()}
  <svg class="ic moon" viewBox="0 1.5 20 20" width="14" height="14" aria-hidden="true"
    ><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" /></svg
  >
{/snippet}

{#if rows.length || started}
  <section class="times" aria-label="Your day">
    <div class="top">
      {#each view.cells as [l, v], i (l)}
        <span class="cell" class:end={i === 1}>
          <span class="l"
            >{#if i === 0}{@render sun()}{/if}{l}{#if i === 1}{@render moon()}{/if}</span
          >
          <span class="v">{v}</span>
        </span>
        {#if i === 0}
          {#if !P.locked}
            <button class="edit hit" aria-label="Edit the day's hours" onclick={() => P.openSheet({ type: 'hours' })}>
              <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"
                ><path d="M3.5 16.5l.8-3.9 9.4-9.4a1.6 1.6 0 0 1 2.3 0l.8.8a1.6 1.6 0 0 1 0 2.3l-9.4 9.4z" /><path
                  class="tip"
                  d="M12.6 4.2l3.2 3.2"
                /></svg
              >Edit
            </button>
          {:else}<span></span>{/if}
        {/if}
      {/each}
    </div>
    {#if view.p != null}
      <div class="track" class:empty={view.p === 0} style:--p="{view.p * 100}%" aria-hidden="true">
        <span class="rest"></span>
        {#if nowDot}<span class="dot"></span>{/if}
      </div>
    {/if}
    {#if view.left || view.right}
      <div class="foot"><span>{view.left}</span><span>{view.right}</span></div>
    {/if}
    {#if over > 0}
      <span class="over">{dL(over)} past your {t(d.wrap)} wrap-up</span>
    {/if}
  </section>
{/if}

<style>
  .times {
    --day-stops: #818cf8, #c084fc, #f472b6, #f43f5e, #a21caf, #4338ca;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 14px var(--px) 0;
    padding: 14px 16px 14px;
    border-radius: var(--r-card);
    background: var(--raised);
    color: var(--text);
  }
  .top {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: start;
    gap: 10px;
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .cell.end {
    align-items: flex-end;
    text-align: right;
  }
  .l {
    display: flex;
    align-items: center;
    gap: 5px;
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
    white-space: nowrap;
  }
  .v {
    font: 600 22px/1.05 var(--font);
    letter-spacing: -0.015em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ic {
    flex: none;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sun {
    stroke: var(--now);
  }
  .moon {
    stroke: var(--accent);
  }
  .edit {
    --hit-y: 5px;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 12px 0 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-ctl);
    background: var(--bg);
    color: var(--text);
    font: 500 13px/1 var(--font);
    cursor: pointer;
  }
  .edit:hover {
    border-color: var(--muted);
  }
  .edit svg {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .edit .tip {
    stroke: var(--now);
  }
  /* The day from start to finish in its own colours, sunrise to evening; the part still to come
     is veiled, so the bright part is the day gone so far. */
  .track {
    position: relative;
    height: 8px;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--day-stops));
  }
  .rest {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: var(--p);
    border-radius: 0 3px 3px 0;
    background: color-mix(in oklab, var(--raised) 80%, transparent);
  }
  .track.empty .rest {
    border-radius: 3px;
  }
  .dot {
    position: absolute;
    top: 50%;
    left: var(--p);
    width: 14px;
    height: 14px;
    translate: -50% -50%;
    border-radius: 50%;
    background: var(--text);
    box-shadow: 0 0 0 3px var(--raised);
  }
  .foot {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: -4px;
    font: 400 13px/1.3 var(--font);
    color: var(--muted);
  }
  .over {
    margin-top: -6px;
    font: 400 13px/1.3 var(--font);
    color: var(--redT);
  }
</style>
