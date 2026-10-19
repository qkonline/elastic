<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { dL, keyDate } from '../lib/time';
  import { hueColor, hueName, type Hue, type ReviewNumbers } from '../lib/types';

  // A stretch of days in numbers: time logged and where it went, tasks done, habits kept, what
  // kept being moved, and days that ran long. A quarter also shows its weeks side by side.
  let { numbers: x }: { numbers: ReviewNumbers } = $props();

  const total = $derived(
    Math.max(
      1,
      x.byHue.reduce((s, h) => s + h.min, 0),
    ),
  );
  const names = $derived(P.settings.hueNames);
  // A colour you've named goes by its name. One you haven't goes by the tasks that took the time
  // ("Yellow" says nothing), falling back to the colour for reviews saved before tasks were kept.
  const named = (h: Hue) => !!names[h]?.trim();
  const label = (h: { hue: Hue; titles?: string[] }) =>
    named(h.hue) || !h.titles?.length ? hueName(h.hue, names) : h.titles.join(', ');
  const anyUnnamed = $derived(x.byHue.some((h) => !named(h.hue)));
  const weekMax = $derived(Math.max(1, ...(x.weeks ?? []).map((w) => w.logged)));
  const best = $derived(x.weeks?.length ? x.weeks.reduce((a, b) => (b.logged > a.logged ? b : a)) : null);
  const dayMonth = (k: string) => keyDate(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
</script>

<div class="nums">
  <div class="stats">
    <div class="stat">
      <span class="big">{x.logged >= 1 ? dL(x.logged) : '0m'}</span>
      <span class="small">logged</span>
    </div>
    <div class="stat">
      <span class="big">{x.tasksDone}<span class="of">/{x.tasks}</span></span>
      <span class="small">tasks done</span>
    </div>
    {#if x.habitsDue}
      <div class="stat">
        <span class="big">{Math.round((x.habitsKept / x.habitsDue) * 100)}%</span>
        <span class="small">habits kept</span>
      </div>
    {/if}
    {#if x.checks}
      <div class="stat">
        <span class="big">{x.checksDone}<span class="of">/{x.checks}</span></span>
        <span class="small">checks</span>
      </div>
    {/if}
  </div>

  {#if x.byHue.length}
    <div class="part">
      <span class="lbl">Where the time went</span>
      <div class="stack" aria-hidden="true">
        {#each x.byHue as h (h.hue)}
          <span style:width="{(h.min / total) * 100}%" style:background={hueColor(h.hue)}></span>
        {/each}
      </div>
      <ul class="legend">
        {#each x.byHue as h (h.hue)}
          <li>
            <i style:background={hueColor(h.hue)}></i>
            <span class="n">{label(h)}</span>
            <span class="v">{dL(h.min)}</span>
          </li>
        {/each}
      </ul>
      {#if anyUnnamed}
        <span class="note">Name your colours in Settings to see this by project.</span>
      {/if}
    </div>
  {/if}

  {#if x.weeks?.length}
    <div class="part">
      <span class="lbl">Week by week</span>
      <div class="weeks">
        {#each x.weeks as w (w.from)}
          <div class="wk" title="{dayMonth(w.from)}: {dL(w.logged)}">
            <span style:height="{Math.max(2, (w.logged / weekMax) * 100)}%" class:best={w === best}></span>
          </div>
        {/each}
      </div>
      {#if best && best.logged > 0}
        <span class="note">Busiest week: from {dayMonth(best.from)}, {dL(best.logged)} logged.</span>
      {/if}
    </div>
  {/if}

  {#if x.postponed.length || x.longDays}
    <div class="part">
      {#if x.postponed.length}
        <span class="lbl">Moved to another day most</span>
        <ul class="moved">
          {#each x.postponed as m (m.title)}
            <li><span>{m.title}</span><span class="v">{m.times === 1 ? 'once' : `${m.times} times`}</span></li>
          {/each}
        </ul>
      {/if}
      {#if x.longDays}
        <span class="note">{x.longDays === 1 ? '1 day' : `${x.longDays} days`} ran past the planned wrap-up.</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .nums {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 26px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .big {
    font: 300 28px/1 var(--font);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .of {
    font-size: 18px;
    color: var(--muted);
  }
  .small,
  .lbl {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }
  .stack {
    display: flex;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
    gap: 2px;
  }
  .legend,
  .moved {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .legend li,
  .moved li {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 400 14px/1.3 var(--font);
  }
  .legend i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .n,
  .moved li span:first-child {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .v {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .weeks {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 64px;
  }
  .wk {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }
  .wk span {
    width: 100%;
    border-radius: 3px 3px 0 0;
    background: var(--pfill);
  }
  .wk span.best {
    background: var(--text);
  }
  .note {
    font: 400 13px/1.4 var(--font);
    color: var(--muted);
  }
</style>
