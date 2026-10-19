<script lang="ts">
  import { onMount } from 'svelte';
  import { completion, habitMet, history, isHabit, periodCount, streak } from '../lib/habits';
  import { planner as P } from '../lib/planner.svelte';
  import { addDays, keyDate, mondayOf, weekdayShort } from '../lib/time';
  import { hueColor, type Habit, type Item, type Series } from '../lib/types';
  import { oftenText } from './HabitFields.svelte';
  import HabitRow from './HabitRow.svelte';
  import KindMark from './KindMark.svelte';
  import ScreenHeader from './ScreenHeader.svelte';

  // Every habit at a glance: this week kept, then each habit with today's control (the same ring
  // as in the Checklist), how often it's due, its streak and the last seven days. The name
  // opens the habit's sheet, with its full record and its settings.
  onMount(() => {
    // The rings act on today, so the plan behind follows today too.
    if (!P.isToday) P.backToToday();
  });
  const habits = $derived(
    P.series
      .filter((s) => s.kind === 'habit' && s.habit && (s.until == null || s.until >= P.today))
      .sort((a, b) => a.order - b.order),
  );
  const n = $derived(P.nowToday());
  const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(P.today, i - 6)));
  const todays = $derived(P.isToday ? (P.day.items.filter((i) => isHabit(i)) as (Item & { habit: Habit })[]) : []);
  const itemOf = (s: Series) => todays.find((i) => i.seriesId === s.id && i.status !== 'skipped');

  // This week, Monday to today: the share of habit days kept, and each day's share for the bars.
  const week = $derived.by(() => {
    const mon = mondayOf(P.today);
    const out: { key: string; share: number | null }[] = [];
    let kept = 0,
      due = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDays(mon, i);
      if (k > P.today) {
        out.push({ key: k, share: null });
        continue;
      }
      let dk = 0,
        dd = 0;
      for (const s of habits) {
        const m = history(P.dayAt, s, k, k, P.today, n)[0];
        if (m === 'met') (dk++, dd++);
        else if (m === 'missed') dd++;
        else if (m === 'today') dd++;
      }
      kept += dk;
      due += dd;
      out.push({ key: k, share: dd ? dk / dd : null });
    }
    return { days: out, share: due ? kept / due : null };
  });
  const keptToday = $derived(todays.filter((i) => habitMet(P.day, i, P.n)).length);

  function runText(s: Series): string {
    const h = s.habit!;
    const r = streak(P.dayAt, s, P.today, n);
    if (h.type === 'quit') return r === 1 ? '1 clean day' : `${r} clean days`;
    if (h.per !== 'day') return `${periodCount(P.dayAt, s, P.today, P.today, n)} of ${h.times} this ${h.per}`;
    return r === 0 ? '' : r === 1 ? '1 day in a row' : `${r} days in a row`;
  }

  /** A habit not due today: open it on the next day it's due. */
  async function edit(s: Series) {
    for (let i = 0; i < 14; i++) {
      const key = addDays(P.today, i);
      const day = await P.ensureDay(key);
      const it = day.items.find((x) => x.seriesId === s.id);
      if (it) return P.openTaskOn(key, it.id);
    }
  }
</script>

<ScreenHeader small={todays.length ? `${keptToday} of ${todays.length} kept today` : 'Your habits'} title="Habits" />
<div class="body">
  {#if !habits.length}
    <section class="card empty">
      <p>No habits yet. Add one to track something you want to do regularly, like drinking water or reading.</p>
      <button class="add" onclick={() => P.openSheet({ type: 'add', kind: 'habit' })}>Add a habit</button>
    </section>
  {:else}
    {#if week.share != null}
      <section class="card week" aria-label="This week">
        <div class="big">
          <span class="pct">{Math.round(week.share * 100)}%</span>
          <span class="cap">kept this week</span>
        </div>
        <div class="bars" aria-hidden="true">
          {#each week.days as d (d.key)}
            <span class="bar">
              <i
                style:height="{d.share == null ? 3 : Math.max(3, d.share * 40)}px"
                class:today={d.key === P.today}
                class:empty={d.share == null}
              ></i>
              <span class="dl" class:today={d.key === P.today}>{weekdayShort(keyDate(d.key)).slice(0, 1)}</span>
            </span>
          {/each}
        </div>
      </section>
    {/if}

    <section class="card list" aria-label="Your habits">
      <div class="days" aria-hidden="true">
        {#each days as k (k)}
          <span class:today={k === P.today}>{weekdayShort(keyDate(k)).slice(0, 1)}</span>
        {/each}
      </div>
      {#each habits as s (s.id)}
        {@const it = itemOf(s)}
        {@const marks = history(P.dayAt, s, days[0], days[6], P.today, n)}
        {@const rate = completion(P.dayAt, s, P.today, n, 30)}
        <div class="row" style:--c={hueColor(s.hue)}>
          {#if it}
            <div class="habit"><HabitRow {it} /></div>
          {:else}
            <div class="habit">
              <span class="notdue"><KindMark kind="habit" hue={s.hue} size={18} /></span>
              <div class="text">
                <button class="title" onclick={() => edit(s)}>{s.title}</button>
                <span class="meta">Not due today</span>
              </div>
            </div>
          {/if}
          <span class="week7">
            {#each marks as m, i (i)}
              <i class={m} aria-hidden="true"></i>
            {/each}
          </span>
          <span class="sub">
            <span>{oftenText(s.habit!, s.repeat)}</span>
            {#if runText(s)}<span>{runText(s)}</span>{/if}
            {#if rate != null}<span>{Math.round(rate * 100)}% lately</span>{/if}
          </span>
        </div>
      {/each}
    </section>
    <button class="add wide" onclick={() => P.openSheet({ type: 'add', kind: 'habit' })}>Add a habit</button>
  {/if}
</div>

<style>
  .body {
    padding: 16px var(--px) 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card {
    padding: 14px;
    border-radius: var(--r-card);
    background: var(--raised);
  }
  .empty p {
    margin: 0 0 12px;
    font: 400 14px/1.5 var(--font);
    color: var(--muted);
  }
  .week {
    display: flex;
    align-items: flex-end;
    gap: 16px;
  }
  .big {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pct {
    font: 600 32px/1 var(--font);
    letter-spacing: -0.03em;
  }
  .cap {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
  .bars {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
    align-items: end;
  }
  .bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .bar i {
    width: 100%;
    border-radius: var(--r-bar);
    background: #84cc16;
  }
  .bar i.today {
    background: color-mix(in oklab, #84cc16 45%, var(--raised));
  }
  .bar i.empty {
    background: var(--sunk);
  }
  .dl {
    font: 400 10px/1 var(--font);
    color: var(--faint);
  }
  .dl.today {
    color: var(--text);
    font-weight: 600;
  }
  .list {
    padding: 0;
    overflow: hidden;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(7, 12px);
    gap: 3px;
    justify-content: end;
    padding: 10px 14px 4px;
    font: 400 10px/1 var(--font);
    color: var(--faint);
    text-align: center;
  }
  .days .today {
    color: var(--text);
    font-weight: 600;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'habit week'
      'sub sub';
    column-gap: 12px;
    align-items: center;
    padding: 8px 14px 10px;
    border-top: 1px solid var(--border);
  }
  .habit {
    grid-area: habit;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .notdue {
    width: 28px;
    display: grid;
    place-items: center;
    opacity: 0.5;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
  }
  .title {
    all: unset;
    font: 400 15px/1.3 var(--font);
    color: var(--text);
    cursor: pointer;
  }
  .title:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .meta {
    font: 400 12px/1.3 var(--font);
    color: var(--muted);
  }
  .week7 {
    grid-area: week;
    display: grid;
    grid-template-columns: repeat(7, 12px);
    gap: 3px;
  }
  .week7 i {
    width: 12px;
    height: 12px;
    border-radius: var(--r-bar);
    box-sizing: border-box;
  }
  .week7 .met {
    background: var(--c);
  }
  .week7 .missed {
    border: 1.5px solid var(--line);
  }
  .week7 .skipped {
    border: 1.5px dashed var(--line);
  }
  .week7 .today {
    border: 1.5px solid var(--text);
  }
  .week7 .none {
    background: var(--sunk);
  }
  .sub {
    grid-area: sub;
    display: flex;
    flex-wrap: wrap;
    column-gap: 12px;
    padding-left: 40px;
    font: 400 12px/1.4 var(--font);
    color: var(--muted);
  }
  .add {
    height: 44px;
    padding: 0 16px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .add.wide {
    height: 48px;
    border: 1px dashed var(--faint);
    background: transparent;
    font-size: 15px;
  }
</style>
