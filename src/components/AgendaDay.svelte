<script lang="ts">
  import { calendarRows, dayTotals, untimedCounts } from '../lib/calendar';
  import { planner as P } from '../lib/planner.svelte';
  import { dL, fT, keyDate, longDate, minutesInto, weekdayShort } from '../lib/time';
  import KindMark from './KindMark.svelte';

  // One day as a short list: its timed tasks with their times, how its checks and habits went,
  // and a way to add to it. The week's list view stacks seven of these; the month view shows the
  // chosen day's.
  let { key }: { key: string } = $props();

  const day = $derived(P.days[key]);
  const n = $derived(minutesInto(key, P.clock));
  const rows = $derived(day ? calendarRows(P.planOf(day), n) : []);
  const totals = $derived(day ? dayTotals(day, n) : { planned: 0, logged: 0 });
  const counts = $derived(day ? untimedCounts(day, n) : null);
  const d = $derived(keyDate(key));
  const past = $derived(key < P.today);
  const isToday = $derived(key === P.today);
  const ended = $derived(day?.dayEnded != null);
  const empty = $derived(!rows.length && !(counts && (counts.checks || counts.habits)));
  const STATE = { todo: '', done: 'Done', running: 'Running', missed: 'Missed', partial: 'Part done' } as const;
</script>

<section class="agenda" class:today={isToday} class:empty aria-label={longDate(d)}>
  <div class="dh">
    <button class="dname" onclick={() => P.openDay(key)}>
      <span class="wd">{weekdayShort(d)}</span>
      <span class="dn">{d.getDate()}</span>
      {#if isToday}<span class="tag">Today</span>{/if}
    </button>
    <span class="tot">
      {#if empty}
        <span class="none">{past ? 'Nothing was planned' : 'Nothing planned yet'}</span>
      {:else if past && totals.logged >= 1}
        {dL(Math.round(totals.logged))} logged
      {:else if totals.planned >= 1}
        {dL(Math.round(totals.planned))} planned
      {/if}
    </span>
    {#if !ended && !past}
      <button class="add hit" aria-label="Add a task on {longDate(d)}" onclick={() => P.addOn(key)}>+</button>
    {/if}
  </div>
  {#if rows.length}
    <ul>
      {#each rows as r (r.it.id)}
        <li class={r.state}>
          <button class="row" onclick={() => P.openTaskOn(key, r.it.id)}>
            <span class="time">{fT(r.start, P.settings.clock24)}</span>
            <KindMark kind={r.it.kind} hue={r.it.hue} size={10} />
            <span class="t">{r.it.title}</span>
            <span class="meta">{STATE[r.state] || dL(r.it.min)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if counts && (counts.checks || counts.habits)}
    <p class="untimed">
      {#if counts.checks}<span>Checklist {counts.checksDone}/{counts.checks}</span>{/if}
      {#if counts.habits}<span>Habits {counts.habitsMet}/{counts.habits}</span>{/if}
    </p>
  {/if}
</section>

<style>
  .agenda {
    padding: 10px 0 12px;
    border-bottom: 1px solid var(--border);
  }
  .dh {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
  }
  .dname {
    all: unset;
    display: flex;
    align-items: baseline;
    gap: 8px;
    cursor: pointer;
    padding: 4px 0;
  }
  .dname:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
    border-radius: 6px;
  }
  .wd {
    font: 400 13px/1 var(--font);
    color: var(--muted);
    width: 30px;
  }
  .dn {
    font: 300 22px/1 var(--font);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .today .dn {
    color: var(--nowT);
  }
  .tag {
    font: 400 12px/1 var(--font);
    color: var(--nowT);
  }
  .tot {
    flex: 1;
    text-align: right;
    font: 400 12px/1 var(--font);
    color: var(--muted);
  }
  .add {
    --hit-x: 6px;
    --hit-y: 6px;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 300 20px/1 var(--font);
    cursor: pointer;
    flex: none;
  }
  ul {
    list-style: none;
    margin: 4px 0 0;
    padding: 0 0 0 38px;
  }
  .row {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    cursor: pointer;
  }
  .row:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 1px;
    border-radius: 6px;
  }
  .time {
    width: 62px;
    flex: none;
    font: 400 13px/1 var(--font);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .t {
    flex: 1;
    min-width: 0;
    font: 400 15px/1.3 var(--font);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font: 400 12px/1 var(--font);
    color: var(--muted);
    white-space: nowrap;
  }
  .done .t {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: var(--faint);
  }
  .missed .meta {
    color: var(--redT);
  }
  .running .meta {
    color: var(--orT);
  }
  .untimed {
    display: flex;
    gap: 14px;
    margin: 4px 0 0 38px;
    font: 400 12px/1.4 var(--font);
    color: var(--muted);
  }
  .agenda.empty {
    padding: 4px 0;
  }
  .none {
    display: block;
    text-align: left;
    padding-left: 6px;
    font: 400 13px/1.4 var(--font);
    color: var(--faint);
  }
</style>
