<script lang="ts">
  import { completion, history, periodCount, streak } from '../lib/habits';
  import { planner as P } from '../lib/planner.svelte';
  import { addDays, keyDate, weekdayShort } from '../lib/time';
  import { hueColor, inkOn, type Series } from '../lib/types';
  import { oftenText } from './HabitFields.svelte';
  import HabitHistory from './HabitHistory.svelte';
  import KindMark from './KindMark.svelte';

  // Every habit at a glance: the last seven days, its streak and how often it's been kept.
  // Tapping one opens its record; from there it can be edited.
  const habits = $derived(
    P.series
      .filter((s) => s.kind === 'habit' && s.habit && (s.until == null || s.until >= P.today))
      .sort((a, b) => a.order - b.order),
  );
  const n = $derived(P.nowToday());
  const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(P.today, i - 6)));
  let open = $state<string | null>(null);

  function runText(s: Series): string {
    const h = s.habit!;
    const r = streak(P.dayAt, s, P.today, n);
    if (h.type === 'quit') return r === 1 ? '1 clean day' : `${r} clean days`;
    if (h.per !== 'day') return `${periodCount(P.dayAt, s, P.today, P.today, n)} of ${h.times} this ${h.per}`;
    return r === 0 ? '' : r === 1 ? '1 day in a row' : `${r} days in a row`;
  }

  /** Edit a habit: in its sheet on today, or on the next day it's due. */
  async function edit(s: Series) {
    for (let i = 0; i < 14; i++) {
      const key = addDays(P.today, i);
      const day = await P.ensureDay(key);
      const it = day.items.find((x) => x.seriesId === s.id);
      if (it) return P.openTaskOn(key, it.id);
    }
  }
</script>

<div class="head">
  <span class="h">Habits</span>
  <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
</div>
<div class="body">
  {#if !habits.length}
    <section class="card empty">
      <p>No habits yet. Add one to track something you want to do regularly, like drinking water or reading.</p>
      <button class="add" onclick={() => P.openSheet({ type: 'add', kind: 'habit' })}>Add a habit</button>
    </section>
  {:else}
    <div class="days" aria-hidden="true">
      <span></span>
      {#each days as k (k)}
        <span class:today={k === P.today}>{weekdayShort(keyDate(k)).slice(0, 1)}</span>
      {/each}
    </div>
    {#each habits as s (s.id)}
      {@const marks = history(P.dayAt, s, days[0], days[6], P.today, n)}
      {@const rate = completion(P.dayAt, s, P.today, n, 30)}
      <section class="card habit" style:--c={hueColor(s.hue)} style:--ink={inkOn(s.hue)}>
        <button class="row" aria-expanded={open === s.id} onclick={() => (open = open === s.id ? null : s.id)}>
          <span class="name">
            <KindMark kind="habit" hue={s.hue} size={14} />
            <span class="t">{s.title}</span>
          </span>
          <span class="week">
            {#each marks as m, i (i)}
              <i class={m} aria-hidden="true"></i>
            {/each}
          </span>
        </button>
        <div class="sub">
          <span>{oftenText(s.habit!, s.repeat)}</span>
          {#if runText(s)}<span>{runText(s)}</span>{/if}
          {#if rate != null}<span>{Math.round(rate * 100)}% lately</span>{/if}
        </div>
        {#if open === s.id}
          <div class="more">
            <HabitHistory series={s} hue={s.hue} />
            <button class="edit" onclick={() => edit(s)}>Edit habit</button>
          </div>
        {/if}
      </section>
    {/each}
    <button class="add" onclick={() => P.openSheet({ type: 'add', kind: 'habit' })}>Add a habit</button>
  {/if}
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
  }
  .h {
    flex: 1;
    font: 400 21px/1.2 var(--font);
    letter-spacing: -0.01em;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 16px calc(28px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .body > :global(*) {
    flex-shrink: 0;
  }
  .card {
    padding: 14px 16px;
    border-radius: 16px;
    background: var(--raised);
    border: 1px solid var(--border);
  }
  .empty p {
    margin: 0 0 12px;
    font: 400 14px/1.5 var(--font);
    color: var(--muted);
  }
  .days,
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(7, 22px);
    gap: 4px;
    align-items: center;
  }
  .days {
    padding: 0 17px;
    font: 400 11px/1 var(--font);
    color: var(--faint);
    text-align: center;
  }
  .days .today {
    color: var(--nowT);
  }
  .row {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    cursor: pointer;
    min-height: 32px;
  }
  .row:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 4px;
    border-radius: 8px;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }
  .t {
    font: 400 15px/1.3 var(--font);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .week {
    display: grid;
    grid-template-columns: repeat(7, 22px);
    gap: 4px;
    justify-items: center;
  }
  .week i {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    box-sizing: border-box;
  }
  .week .met {
    background: var(--c);
  }
  .week .missed {
    border: 1.5px solid color-mix(in oklab, var(--c) 40%, var(--line));
  }
  .week .skipped {
    border: 1.5px dashed var(--line);
  }
  .week .today {
    border: 1.5px solid var(--text);
  }
  .week .none {
    background: var(--sunk);
    transform: scale(0.45);
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    column-gap: 14px;
    margin-top: 4px;
    padding-left: 23px;
    font: 400 12px/1.4 var(--font);
    color: var(--muted);
  }
  .more {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .edit,
  .add {
    align-self: flex-start;
    height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .body > .add {
    margin-top: 4px;
  }
</style>
