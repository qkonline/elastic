<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { stripSegs } from '../lib/rows';
  import { schedule } from '../lib/schedule';
  import { addDays, dL, fT, keyDate, shortDate } from '../lib/time';
  import { type Item, untimed } from '../lib/types';
  import KindMark from './KindMark.svelte';
  import SectionHead from './SectionHead.svelte';
  import SomedayList from './SomedayList.svelte';

  // Beside the plan on a computer or a wide iPad, while no task is open there: Someday, to drag
  // onto a day or tap to plan, and the next few days, to see which has room before dropping one
  // there: when each runs (and by how much it overruns its wrap-up), its first few tasks (each
  // opens), and how many more. An open task covers it, and closing the task shows it again.
  const SHOWN = 4;
  const keys = $derived([1, 2, 3].map((i) => addDays(P.today, i)));
  $effect(() => {
    for (const k of keys) void P.ensureDay(k);
  });
  const c24 = $derived(P.settings.clock24);
  const days = $derived(
    keys.map((k) => {
      const d = P.days[k];
      const label = k === addDays(P.today, 1) ? 'Tomorrow' : shortDate(keyDate(k));
      const date = k === addDays(P.today, 1) ? shortDate(keyDate(k)) : '';
      if (!d) return { k, label, date, span: '', over: 0, wrap: 0, segs: [], first: [] as Item[], more: '' };
      const plan = P.planOf(d);
      const sch = schedule(plan, 0);
      const timed = sch.rows.filter((r) => !untimed(r.it.kind) && r.it.status === 'todo');
      const tasks = timed.filter((r) => r.it.kind !== 'buffer').map((r) => r.it);
      const checks = d.items.filter((i) => i.kind === 'check' && i.status === 'todo').length;
      const rest = tasks.length - SHOWN;
      const more = [rest > 0 ? `and ${rest} more` : '', checks ? `${checks} check${checks === 1 ? '' : 's'}` : '']
        .filter(Boolean)
        .join(', ');
      const end = timed.length ? Math.max(...timed.map((r) => r.end)) : 0;
      return {
        k,
        label,
        date,
        span: timed.length ? `${fT(timed[0].start, c24)} to ${fT(end, c24)}` : '',
        over: timed.length ? Math.max(0, Math.round(end - d.wrap)) : 0,
        wrap: d.wrap,
        segs: stripSegs(sch.rows, false),
        first: tasks.slice(0, SHOWN),
        more: rest > 0 || !tasks.length ? more : more && `and ${more}`,
      };
    }),
  );
</script>

<aside class="col" aria-label="Someday and coming up">
  <section class="card" aria-label="Someday">
    <SectionHead icon="someday" title="Someday" tally={P.someday.length ? String(P.someday.length) : ''} inset />
    <div class="body">
      <p class="hint">
        {P.someday.length
          ? 'Drag one onto a day, or tap it to plan it.'
          : 'Tasks with no day yet wait here, until you plan them.'}
      </p>
      <SomedayList drag />
    </div>
  </section>

  <section class="card" aria-label="Coming up">
    <SectionHead icon="upcoming" title="Coming up" inset />
    <ul class="days">
      {#each days as d (d.k)}
        <li class="day" data-drop-day={d.k}>
          <button class="top" onclick={() => P.openDay(d.k)} aria-label="Open {d.label}{d.date ? `, ${d.date}` : ''}">
            <span class="dn"
              >{d.label}{#if d.date}<span class="dd">{d.date}</span>{/if}</span
            >
            <span class="ds">{d.span || 'Nothing planned yet'}</span>
          </button>
          {#if d.segs.length}
            <span class="strip" aria-hidden="true">
              {#each d.segs as g (g.key)}
                <span class:buf={g.c === 'var(--line)'} style:flex-grow={g.min} style:--c={g.c}></span>
              {/each}
            </span>
          {/if}
          {#if d.over >= 5}
            <span class="over">{dL(d.over)} past the {fT(d.wrap, c24)} wrap-up</span>
          {/if}
          {#if d.first.length}
            <ul class="tasks">
              {#each d.first as it (it.id)}
                <li>
                  <button class="task" onclick={() => P.openTaskOn(d.k, it.id)}>
                    <KindMark kind={it.kind} hue={it.hue} size={10} />
                    {#if it.kind === 'fixed' && it.fixedAt != null}<span class="at">{fT(it.fixedAt, c24)}</span>{/if}
                    <span class="tt">{it.title}</span>
                    <span class="len">{dL(it.min)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if d.more}<span class="more">{d.more}</span>{/if}
        </li>
      {/each}
    </ul>
  </section>
</aside>

<style>
  .col {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    width: 400px;
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    background: var(--bg);
    border-left: 1px solid var(--border);
  }
  @media (min-width: 1440px) {
    .col {
      width: 440px;
    }
  }
  .card {
    flex: none;
    border-radius: var(--r-card);
    background: var(--raised);
  }
  .body {
    padding: 12px 0 4px;
  }
  .hint {
    margin: 0;
    padding: 0 16px 6px;
    font: 400 14px/1.4 var(--font);
    color: var(--muted);
  }
  .days {
    list-style: none;
    margin: 0;
    padding: 4px 0 6px;
  }
  .day {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px 14px;
  }
  .day + .day {
    border-top: 1px solid var(--border);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin: -6px -8px 0;
    padding: 6px 8px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .dn {
    font: 600 16px/1.2 var(--font);
  }
  .dd {
    margin-left: 8px;
    font: 400 13px/1.2 var(--font);
    color: var(--muted);
  }
  .ds {
    font: 400 13px/1.3 var(--font);
    color: var(--muted);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .strip {
    display: flex;
    gap: 3px;
    height: 6px;
  }
  .strip span {
    flex: 1 1 0;
    min-width: 4px;
    border-radius: var(--r-bar);
    background: var(--c);
  }
  .strip .buf {
    background: none;
    box-shadow: inset 0 0 0 1px var(--faint);
  }
  .over {
    font: 500 13px/1.3 var(--font);
    color: var(--redT);
  }
  .tasks {
    list-style: none;
    margin: 2px 0 0;
    padding: 0;
  }
  .task {
    width: 100%;
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 -8px;
    padding: 0 8px;
    box-sizing: content-box;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--text);
    font: 400 14px/1.3 var(--font);
    text-align: left;
    cursor: pointer;
  }
  .at {
    flex: none;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .tt {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .len {
    flex: none;
    font-size: 13px;
    color: var(--muted);
  }
  .more {
    font: 400 13px/1.3 var(--font);
    color: var(--muted);
  }
  @media (hover: hover) {
    .top:hover,
    .task:hover {
      background: var(--sunk);
    }
  }
</style>
