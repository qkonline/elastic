<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { isActive, isMissed, isPartial, worked, type Row } from '../lib/schedule';
  import { dL, fNZ } from '../lib/time';
  import { hueColor, untimed } from '../lib/types';

  // The day's times at the top of the plan: when it started (or is planned to) and when it's
  // likely done, the day between them as a ribbon of its tasks (each as long as it takes, in its
  // colour; buffers and idle time left clear; done ones faded; a dot for now), and the time
  // worked and left beneath. Tapping a stretch of the ribbon lifts it and says which task it is.
  // The pencil beside the start opens the day's hours.
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

  // The ribbon: from the start (or the first task) to the end of the day.
  const rFrom = $derived(
    rows.length ? Math.min(rows[0].start - (started ? rows[0].gap : 0), d.dayStarted ?? 1e9) : d.dayStart,
  );
  const rTo = $derived(d.dayEnded ?? Math.max(rFrom + 1, to));
  const rSpan = $derived(Math.max(1, rTo - rFrom));
  interface Seg {
    key: string;
    min: number;
    kind: 'task' | 'buffer' | 'gap';
    row?: Row;
    faded?: boolean;
    /** Running: the share already worked. */
    fill?: number;
  }
  const segs = $derived.by((): Seg[] => {
    const out: Seg[] = [];
    for (const r of rows) {
      if (started && r.gap >= 1) out.push({ key: r.it.id + '-gap', min: r.gap, kind: 'gap' });
      const len = Math.max(1, r.end - r.start);
      if (r.it.kind === 'buffer') out.push({ key: r.it.id, min: len, kind: 'buffer', row: r });
      else
        out.push({
          key: r.it.id,
          min: len,
          kind: 'task',
          row: r,
          faded: r.it.status === 'done' || isPartial(r.it),
          fill: isActive(r.it) ? Math.max(0, Math.min(1, worked(r.it, n) / len)) : undefined,
        });
    }
    return out;
  });
  const nowAt = $derived(live && started && open ? Math.max(0, Math.min(1, (n - rFrom) / rSpan)) : null);

  // The stretch tapped: lifted, with a tip saying which task it is.
  let picked = $state<string | null>(null);
  const pickedSeg = $derived(segs.find((x) => x.key === picked && x.row));
  let ribbon: HTMLElement | null = $state(null);
  let tipEl: HTMLElement | null = $state(null);
  let tipLeft = $state(0);
  $effect(() => {
    if (!pickedSeg || !ribbon || !tipEl) return;
    const seg = ribbon.querySelector<HTMLElement>(`[data-seg="${pickedSeg.key}"]`);
    if (!seg) return;
    const mid = seg.offsetLeft + seg.offsetWidth / 2;
    tipLeft = Math.max(0, Math.min(ribbon.offsetWidth - tipEl.offsetWidth, mid - tipEl.offsetWidth / 2));
  });
  $effect(() => {
    if (!picked) return;
    const away = (e: Event) => {
      if (!ribbon?.contains(e.target as Node)) picked = null;
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (picked = null);
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc);
    };
  });
  function stateOf(r: Row): string {
    const it = r.it;
    if (it.status === 'done') return it.marked ? 'Marked done' : `Done, took ${dL(Math.max(1, worked(it, n)))}`;
    if (it.status === 'paused') return `Paused, ${dL(worked(it, n))} worked`;
    if (it.status === 'running') return `On now, ${dL(worked(it, n))} worked`;
    if (isPartial(it)) return `Partly done, ${dL(worked(it, n))} worked`;
    if (live && started && isMissed(r, n)) return 'Missed';
    return it.kind === 'buffer' ? 'Kept free' : 'Still to do';
  }
  const segLabel = (r: Row) => `${r.it.title}, ${t(r.start)} to ${t(r.end)}`;

  type Cell = [label: string, value: string];
  const view = $derived.by((): { cells: Cell[]; left: string; right: string } => {
    if (!started) {
      if (!P.timesShown) return { cells: [['Planned', dL(to - from)]], left: '', right: '' };
      return {
        cells: [
          ['Planned start', t(from)],
          ['Planned finish', t(to)],
        ],
        left: `${dL(to - from)} planned`,
        right: '',
      };
    }
    const s: Cell = ['Day started', t(d.dayStarted!)];
    const w = `${dL(doneMin)} worked`;
    if (d.dayEnded != null) return { cells: [s, ['Day ended', t(d.dayEnded)]], left: w, right: '' };
    if (live && open) return { cells: [s, ['Likely done by', t(likely)]], left: w, right: `${dL(leftMin)} to go` };
    if (lastEnd != null) return { cells: [s, ['Last task done', t(lastEnd)]], left: w, right: '' };
    return { cells: [s], left: live ? 'Nothing left to do' : '', right: '' };
  });
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
          <span class="vrow">
            <span class="v">{v}</span>
            {#if i === 0 && !P.locked}
              <button class="edit hit" aria-label="Edit the day's hours" onclick={() => P.openSheet({ type: 'hours' })}>
                <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"
                  ><path d="M3.5 16.5l.8-3.9 9.4-9.4a1.6 1.6 0 0 1 2.3 0l.8.8a1.6 1.6 0 0 1 0 2.3l-9.4 9.4z" /><path
                    class="nib"
                    d="M12.6 4.2l3.2 3.2"
                  /></svg
                >
              </button>
            {/if}
          </span>
        </span>
      {/each}
    </div>
    {#if segs.length}
      <div class="ribbon" bind:this={ribbon}>
        <div class="segs">
          {#each segs as g (g.key)}
            {#if g.row}
              <button
                class="seg {g.kind}"
                class:faded={g.faded}
                class:running={g.fill != null}
                class:on={picked === g.key}
                data-seg={g.key}
                style:flex-grow={g.min}
                style:--c={g.kind === 'task' ? hueColor(g.row.it.hue) : ''}
                style:--fill="{(g.fill ?? 0) * 100}%"
                aria-label={segLabel(g.row)}
                aria-pressed={picked === g.key}
                onclick={() => (picked = picked === g.key ? null : g.key)}><span></span></button
              >
            {:else}
              <span class="seg gap" style:flex-grow={g.min}><span></span></span>
            {/if}
          {/each}
        </div>
        {#if nowAt != null}<span class="dot" style:left="{nowAt * 100}%"></span>{/if}
        {#if pickedSeg?.row}
          {@const r = pickedSeg.row}
          <div class="tip" bind:this={tipEl} style:left="{tipLeft}px" role="status">
            <span class="tt">
              {#if r.it.kind !== 'buffer'}<i style:background={hueColor(r.it.hue)}></i>{/if}{r.it.title}
            </span>
            <span class="tm">{t(r.start)} to {t(r.end)}, {dL(Math.max(1, Math.round(r.end - r.start)))}</span>
            <span class="tm">{stateOf(r)}</span>
          </div>
        {/if}
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
    grid-template-columns: 1fr auto;
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
  .vrow {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .edit {
    --hit-x: 8px;
    --hit-y: 8px;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--r-ctl);
    background: color-mix(in oklab, var(--text) 5%, transparent);
    cursor: pointer;
  }
  .edit:hover {
    background: color-mix(in oklab, var(--text) 10%, transparent);
  }
  .edit svg {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .edit .nib {
    stroke: var(--now);
  }
  /* The day as a ribbon of its tasks. Each stretch is a button as tall as a finger needs; the
     colour inside is a thin band that thickens when it's picked. */
  .ribbon {
    position: relative;
  }
  .segs {
    display: flex;
    gap: 2px;
  }
  .seg {
    flex: 1 1 0;
    min-width: 3px;
    height: 24px;
    margin: -9px 0;
    padding: 0;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .seg > span {
    flex: 1;
    height: 6px;
    border-radius: var(--r-bar);
    background: var(--c);
    transition: height 160ms ease;
  }
  .seg.faded > span {
    opacity: 0.4;
  }
  .seg.running > span {
    background: linear-gradient(
      90deg,
      var(--c) 0 var(--fill),
      color-mix(in oklab, var(--c) 32%, var(--raised)) var(--fill) 100%
    );
  }
  .seg.buffer > span {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--faint);
  }
  .seg.gap {
    cursor: default;
  }
  .seg.gap > span {
    background: var(--sunk);
  }
  .seg.on > span {
    height: 12px;
    opacity: 1;
  }
  .seg:focus-visible {
    outline: none;
  }
  .seg:focus-visible > span {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .dot {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    translate: -50% -50%;
    border-radius: 50%;
    background: var(--text);
    box-shadow: 0 0 0 3px var(--raised);
    pointer-events: none;
  }
  .tip {
    position: absolute;
    bottom: calc(100% + 12px);
    z-index: 3;
    max-width: min(260px, 100%);
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 11px;
    box-sizing: border-box;
    border-radius: var(--r-ctl);
    background: var(--text);
    color: var(--bg);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
    pointer-events: none;
  }
  .tt {
    display: flex;
    align-items: center;
    gap: 7px;
    font: 600 14px/1.25 var(--font);
    overflow-wrap: anywhere;
  }
  .tt i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .tm {
    font: 400 12px/1.3 var(--font);
    opacity: 0.75;
  }
  @media (prefers-reduced-motion: reduce) {
    .seg > span {
      transition: none;
    }
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
