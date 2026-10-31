<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import { calendarRows, dayTotals, untimedCounts } from '../lib/calendar';
  import { planner as P } from '../lib/planner.svelte';
  import { dL, keyDate, longDate, minutesInto, monthGrid } from '../lib/time';
  import { hueColor, type Item } from '../lib/types';
  import AgendaDay from './AgendaDay.svelte';
  import HabitRing from './HabitRing.svelte';

  // The month the anchor day falls in, Monday first. Each day shows how full it is: on a
  // computer its first tasks by name, a bar of time planned and logged and a ring for the
  // habits kept; on a phone a small strip of its tasks and a line for the habits kept. On a computer a click opens the day and tasks
  // can be dragged to another day; on a phone a tap picks the day and lists it underneath.
  const wide = new MediaQuery('(min-width: 768px)', false);
  const month = $derived(P.viewKey.slice(0, 7));
  // Six weeks cover any month; a last week wholly in the next month is left off.
  const keys = $derived.by(() => {
    const all = monthGrid(P.viewKey);
    return all.slice(35).some((k) => k.slice(0, 7) === month) ? all : all.slice(0, 35);
  });
  const SHOW = 3;

  const cells = $derived(
    keys.map((k) => {
      const day = P.days[k];
      const n = minutesInto(k, P.minute);
      const rows = day ? calendarRows(P.planOf(day), n) : [];
      const totals = day ? dayTotals(day, n) : { planned: 0, logged: 0 };
      const counts = day ? untimedCounts(day, n) : null;
      const length = day ? Math.max(60, day.wrap - day.dayStart) : 480;
      return {
        k,
        d: keyDate(k),
        rows,
        inMonth: k.slice(0, 7) === month,
        planned: Math.min(1, totals.planned / length),
        logged: Math.min(1, totals.logged / length),
        hours: totals.logged >= 1 && k <= P.today ? totals.logged : totals.planned,
        habits: counts && counts.habits ? counts : null,
      };
    }),
  );

  // ---------- dragging a task to another day (computer) ----------

  let drag = $state<{ it: Item; from: string; x: number; y: number; over: string | null } | null>(null);
  let dragEnded = 0;
  function down(e: PointerEvent, from: string, it: Item, todo: boolean) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !todo) return;
    const x0 = e.clientX,
      y0 = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) started = true;
      if (!started) return;
      const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>(
        '[data-key]',
      );
      drag = { it, from, x: ev.clientX, y: ev.clientY, over: over?.dataset.key ?? null };
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (!started) return;
      dragEnded = Date.now();
      const to = drag?.over;
      drag = null;
      if (to && to !== from) void P.moveItem(from, it.id, to);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  function tapCell(k: string) {
    if (Date.now() - dragEnded < 400) return;
    // A computer opens the day; a phone picks it first, and a second tap opens it.
    if (wide.current || k === P.viewKey) void P.openDay(k);
    else void P.switchDay(k);
  }
  function openTask(e: MouseEvent, k: string, id: string) {
    e.stopPropagation();
    if (Date.now() - dragEnded < 400) return;
    void P.openTaskOn(k, id);
  }
</script>

<div class="month">
  <div class="bar">
    <button class="nav" aria-label="Previous month" onclick={() => P.step(-1)}>‹</button>
    <button class="nav" aria-label="Next month" onclick={() => P.step(1)}>›</button>
  </div>
  <div class="grid" role="grid" aria-label="Days of the month">
    {#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as w (w)}
      <span class="wd" aria-hidden="true">{wide.current ? w : w.slice(0, 1)}</span>
    {/each}
    {#each cells as c (c.k)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
      <div
        class="cell"
        class:out={!c.inMonth}
        class:today={c.k === P.today}
        class:sel={!wide.current && c.k === P.viewKey}
        class:past={c.k < P.today}
        class:over={drag?.over === c.k && drag.from !== c.k}
        data-key={c.k}
        data-drop-day={c.k}
        role="gridcell"
        tabindex="0"
        aria-label="{longDate(c.d)}{c.rows.length ? `, ${c.rows.length} tasks` : ''}"
        onclick={() => tapCell(c.k)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), P.openDay(c.k))}
      >
        <div class="top">
          <span class="dn">{c.d.getDate()}</span>
          {#if c.habits && wide.current}
            <span class="hab" title="Habits {c.habits.habitsMet} of {c.habits.habits}">
              <HabitRing
                hue="lime"
                value={c.habits.habitsMet}
                target={c.habits.habits}
                met={c.habits.habitsMet === c.habits.habits}
                size={wide.current ? 16 : 12}
              />
            </span>
          {/if}
        </div>
        {#if wide.current}
          <ul class="titles">
            {#each c.rows.slice(0, SHOW) as r (r.it.id)}
              <li>
                <button
                  class="chipt {r.state}"
                  style:--c={hueColor(r.it.hue)}
                  onpointerdown={(e) => down(e, c.k, r.it, r.state === 'todo')}
                  onclick={(e) => openTask(e, c.k, r.it.id)}><i></i><span>{r.it.title}</span></button
                >
              </li>
            {/each}
            {#if c.rows.length > SHOW}
              <li class="moreN">+{c.rows.length - SHOW} more</li>
            {/if}
          </ul>
        {:else}
          <div class="foot" aria-hidden="true">
            {#if c.rows.length}
              <div class="mini">
                {#each c.rows as r (r.it.id)}
                  <i
                    class:faded={r.state === 'todo' || r.state === 'missed'}
                    style:flex-grow={Math.max(1, r.end - r.start)}
                    style:background={r.it.kind === 'buffer' ? 'var(--line)' : hueColor(r.it.hue)}
                  ></i>
                {/each}
              </div>
            {/if}
            {#if c.habits}
              <span class="hline" style:width="{(c.habits.habitsMet / c.habits.habits) * 100}%"></span>
            {/if}
          </div>
        {/if}
        {#if wide.current && (c.planned > 0 || c.logged > 0)}
          <div class="hours" title={dL(Math.round(c.hours))}>
            <span class="planned" style:width="{c.planned * 100}%"></span>
            <span class="logged" style:width="{c.logged * 100}%"></span>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if !wide.current}
    <div class="picked">
      <AgendaDay key={P.viewKey} />
      <button class="open" onclick={() => P.openDay(P.viewKey)}>Open this day</button>
    </div>
  {/if}
</div>

{#if drag}
  <div class="ghost" style:left="{drag.x + 8}px" style:top="{drag.y + 8}px" style:--c={hueColor(drag.it.hue)}>
    <i></i>{drag.it.title}
  </div>
{/if}

<style>
  .foot {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .mini {
    display: flex;
    gap: 1px;
    height: 6px;
  }
  .mini i {
    flex: 1 1 0;
    min-width: 1px;
    border-radius: 1px;
  }
  .mini i.faded {
    opacity: 0.35;
  }
  .hline {
    height: 2px;
    border-radius: 1px;
    background: #84cc16;
  }
  .month {
    padding: 8px var(--px) 120px;
  }
  .bar {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .nav {
    width: 44px;
    height: 40px;
    border: none;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--muted);
    font: 400 22px/1 var(--font);
    cursor: pointer;
  }
  .nav:hover {
    background: var(--sunk);
    color: var(--text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }
  .wd {
    text-align: center;
    font: 400 12px/24px var(--font);
    color: var(--muted);
  }
  .cell {
    min-height: 62px;
    padding: 6px 5px 6px;
    border-radius: var(--r-sm);
    background: var(--raised);
    border: none;
    display: flex;
    flex-direction: column;
    gap: 5px;
    cursor: pointer;
    box-sizing: border-box;
    min-width: 0;
    outline: none;
  }
  .cell:focus-visible {
    box-shadow: 0 0 0 2px var(--text);
  }
  .cell.out {
    background: transparent;
    border-color: transparent;
    opacity: 0.45;
  }
  .cell.today .dn {
    background: var(--text);
    color: var(--bg);
  }
  .cell.sel {
    border-color: var(--text);
    box-shadow: inset 0 0 0 1px var(--text);
  }
  .cell.over {
    border-color: var(--now);
    box-shadow: inset 0 0 0 1px var(--now);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2px;
  }
  .dn {
    min-width: 22px;
    height: 22px;
    padding: 0 4px;
    border-radius: var(--r-ctl);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: 400 13px/1 var(--font);
    font-variant-numeric: tabular-nums;
    box-sizing: border-box;
  }
  .past .dn {
    color: var(--muted);
  }
  .hab {
    display: flex;
  }
  .hours {
    margin-top: auto;
    position: relative;
    height: 3px;
    border-radius: 2px;
    background: var(--sunk);
    overflow: hidden;
  }
  .hours span {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 2px;
  }
  .planned {
    background: var(--pfill);
  }
  .logged {
    background: color-mix(in oklab, var(--text) 70%, transparent);
  }
  .titles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .chipt {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 4px;
    border-radius: 6px;
    font: 400 12px/1.3 var(--font);
    cursor: pointer;
  }
  .chipt:hover {
    background: var(--sunk);
  }
  .chipt:focus-visible {
    outline: 2px solid var(--text);
  }
  .chipt i {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
  }
  .chipt span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chipt.done span {
    color: var(--muted);
    text-decoration: line-through;
  }
  .chipt.missed span {
    color: var(--muted);
  }
  .moreN {
    padding: 0 4px;
    font: 400 11px/1.3 var(--font);
    color: var(--muted);
  }
  .picked {
    margin-top: 14px;
  }
  .open {
    margin-top: 10px;
    width: 100%;
    height: 44px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .ghost {
    position: fixed;
    z-index: 30;
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 8px;
    background: var(--raised);
    border: 1px solid var(--border);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    font: 400 12px/1.2 var(--font);
  }
  .ghost i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
  }
  @media (min-width: 768px) {
    .cell {
      min-height: 112px;
      padding: 8px;
    }
  }
</style>
