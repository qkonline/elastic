<script lang="ts">
  import { dayTotals } from '../lib/calendar';
  import { planner as P } from '../lib/planner.svelte';
  import { stripSegs } from '../lib/rows';
  import { schedule } from '../lib/schedule';
  import { addDays, dL, keyDate, shortDate } from '../lib/time';
  import SectionHead from './SectionHead.svelte';
  import SomedayList from './SomedayList.svelte';

  // Beside the plan on a computer or a wide iPad, while no task is open there: Someday, to drag
  // onto a day or tap to plan, and the next few days, which take a drop too and open on a tap.
  // An open task covers it, and closing the task shows it again.
  const keys = $derived([1, 2, 3].map((i) => addDays(P.today, i)));
  $effect(() => {
    for (const k of keys) void P.ensureDay(k);
  });
  const days = $derived(
    keys.map((k) => {
      const d = P.days[k];
      const label = k === addDays(P.today, 1) ? 'Tomorrow' : shortDate(keyDate(k));
      if (!d) return { k, label, sub: '', segs: [] };
      const { planned } = dayTotals(d, 0);
      const checks = d.items.filter((i) => i.kind === 'check' && i.status === 'todo').length;
      const parts = [
        planned ? `${dL(planned)} of tasks` : '',
        checks ? `${checks} check${checks === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      return {
        k,
        label,
        sub: parts.length ? parts.join(', ') : 'Nothing planned yet',
        segs: stripSegs(schedule(P.planOf(d), 0).rows, false),
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
        <li>
          <button class="day" data-drop-day={d.k} onclick={() => P.openDay(d.k)}>
            <span class="top">
              <span class="dn">{d.label}</span>
              <span class="ds">{d.sub}</span>
            </span>
            {#if d.segs.length}
              <span class="strip" aria-hidden="true">
                {#each d.segs as g (g.key)}
                  <span class:buf={g.c === 'var(--line)'} style:flex-grow={g.min} style:--c={g.c}></span>
                {/each}
              </span>
            {/if}
          </button>
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
    padding: 6px 0;
  }
  .day {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 14px 16px;
    border: none;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  @media (hover: hover) {
    .day:hover {
      background: var(--sunk);
    }
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .dn {
    font: 600 16px/1.2 var(--font);
  }
  .ds {
    font: 400 13px/1.3 var(--font);
    color: var(--muted);
    text-align: right;
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
</style>
