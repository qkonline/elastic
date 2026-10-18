<script lang="ts">
  import { completion, history, streak, type HistoryMark } from '../lib/habits';
  import { planner as P } from '../lib/planner.svelte';
  import { addDays, keyDate, mondayOf } from '../lib/time';
  import { hueColor, inkOn, type Hue, type Series } from '../lib/types';

  // A habit's record: its streak, how often it was met lately, and a month of days.
  let { series, hue }: { series: Series; hue: Hue } = $props();

  const h = $derived(series.habit!);
  const n = $derived(P.nowToday());
  const run = $derived(streak(P.dayAt, series, P.today, n));
  const rate = $derived(completion(P.dayAt, series, P.today, n, 30));
  const runLabel = $derived(
    h.type === 'quit'
      ? run === 1
        ? 'clean day'
        : 'clean days'
      : h.per === 'day'
        ? run === 1
          ? 'day in a row'
          : 'days in a row'
        : `${h.per}${run === 1 ? '' : 's'} in a row`,
  );

  // The month on show, as its first day.
  let month = $state(P.today.slice(0, 8) + '01');
  const monthName = $derived(keyDate(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  const last = $derived.by(() => {
    const d = keyDate(month);
    return addDays(month, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - 1);
  });
  const gridFrom = $derived(mondayOf(month));
  const cells = $derived.by(() => {
    const to = addDays(mondayOf(last), 6);
    const marks = history(P.dayAt, series, gridFrom, to, P.today, n);
    return marks.map((m, i) => {
      const key = addDays(gridFrom, i);
      return { key, m, inMonth: key >= month && key <= last, day: keyDate(key).getDate() };
    });
  });
  const canNext = $derived(last < P.today);
  const canPrev = $derived(month > series.from.slice(0, 8) + '01');
  function shift(d: -1 | 1) {
    const x = keyDate(month);
    const next = new Date(x.getFullYear(), x.getMonth() + d, 1);
    month = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  }
  const WORD: Record<HistoryMark, string> = {
    met: 'done',
    missed: 'missed',
    skipped: 'skipped',
    today: 'today',
    none: '',
  };
</script>

<div class="hist" style:--c={hueColor(hue)} style:--ink={inkOn(hue)}>
  <div class="stats">
    <div class="stat">
      <span class="big">{run}</span>
      <span class="small">{runLabel}</span>
    </div>
    <div class="stat">
      <span class="big">{rate == null ? '–' : `${Math.round(rate * 100)}%`}</span>
      <span class="small">{h.per === 'day' ? 'of the last 30 days' : `of ${h.per}s lately`}</span>
    </div>
  </div>

  <div class="cal">
    <div class="mhead">
      <button class="nav" aria-label="Previous month" disabled={!canPrev} onclick={() => shift(-1)}>‹</button>
      <span class="mname">{monthName}</span>
      <button class="nav" aria-label="Next month" disabled={!canNext} onclick={() => shift(1)}>›</button>
    </div>
    <div class="grid" role="grid" aria-label="{monthName}, by day">
      {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d, i (i)}
        <span class="wd" aria-hidden="true">{d}</span>
      {/each}
      {#each cells as c (c.key)}
        <span
          class="cell {c.m}"
          class:out={!c.inMonth}
          role="gridcell"
          aria-label={c.inMonth ? `${c.day}${WORD[c.m] ? ', ' + WORD[c.m] : ''}` : undefined}
          aria-hidden={!c.inMonth}>{c.inMonth ? c.day : ''}</span
        >
      {/each}
    </div>
  </div>
</div>

<style>
  .hist {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .stats {
    display: flex;
    gap: 28px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .big {
    font: 300 32px/1 var(--font);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .small {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
  .mhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .mname {
    font: 400 14px/1 var(--font);
  }
  .nav {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    font: 300 20px/1 var(--font);
    cursor: pointer;
  }
  .nav:disabled {
    color: var(--faint);
    opacity: 0.5;
    cursor: default;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    justify-items: center;
  }
  .wd {
    font: 400 11px/20px var(--font);
    color: var(--faint);
  }
  .cell {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 400 12px/1 var(--font);
    color: var(--faint);
    font-variant-numeric: tabular-nums;
    box-sizing: border-box;
  }
  .cell.met {
    background: var(--c);
    color: var(--ink);
  }
  .cell.missed {
    border: 1.5px solid color-mix(in oklab, var(--c) 35%, transparent);
    color: var(--muted);
  }
  .cell.skipped {
    border: 1.5px dashed var(--line);
    color: var(--muted);
  }
  .cell.today {
    border: 1.5px solid var(--text);
    color: var(--text);
  }
  .cell.out {
    visibility: hidden;
  }
</style>
