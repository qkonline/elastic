<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import { axis, calendarRows, untimedCounts, type CalRow } from '../lib/calendar';
  import { planner as P } from '../lib/planner.svelte';
  import { addDays, fT, keyDate, longDate, minutesInto, mondayOf, weekdayShort } from '../lib/time';
  import { hueColor, inkOn } from '../lib/types';
  import AgendaDay from './AgendaDay.svelte';
  import KindMark from './KindMark.svelte';

  // The week the anchor day falls in, as a time grid (each task a block at its time, like a
  // wall planner) or as a list of days. The grid is the default on a computer, the list on a
  // phone; the choice is remembered on this device. In the grid, drag a task still to do to
  // another day or time, or tap an empty slot to add a task there.
  const LAYOUT_KEY = 'elastic-day:week-layout';
  const wide = new MediaQuery('(min-width: 768px)', false);
  function readLayout(): 'grid' | 'list' | null {
    try {
      const v = localStorage.getItem(LAYOUT_KEY);
      return v === 'grid' || v === 'list' ? v : null;
    } catch {
      return null;
    }
  }
  let chosen = $state(readLayout());
  const layout = $derived(chosen ?? (wide.current ? 'grid' : 'list'));
  function pick(l: 'grid' | 'list') {
    chosen = l;
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      /* storage blocked */
    }
  }

  const keys = $derived(Array.from({ length: 7 }, (_, i) => addDays(mondayOf(P.viewKey), i)));
  const cols = $derived(
    keys.map((k) => {
      const day = P.days[k];
      const n = minutesInto(k, P.clock);
      return {
        k,
        d: keyDate(k),
        rows: day ? calendarRows(P.planOf(day), n) : [],
        counts: day ? untimedCounts(day, n) : null,
        ended: day?.dayEnded != null,
        n,
      };
    }),
  );
  const span = $derived(axis(cols.map((c) => c.rows)));
  const PX = 0.9; // per minute: 54 px an hour
  const height = $derived((span[1] - span[0]) * PX);
  const hours = $derived(Array.from({ length: (span[1] - span[0]) / 60 + 1 }, (_, i) => span[0] + i * 60));
  const y = (m: number) => (m - span[0]) * PX;
  /** "9 am" or "09", for the hour lines. */
  const hourLabel = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    if (P.settings.clock24) return String(h).padStart(2, '0');
    return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
  };

  // ---------- dragging a task in the grid ----------

  let colEls: HTMLElement[] = $state([]);
  let drag = $state<{
    row: CalRow;
    from: string;
    x: number;
    y: number;
    w: number;
    h: number;
    grabY: number;
    over: { key: string; at: number } | null;
  } | null>(null);
  let dragEnded = 0;

  /** The day and minute under a point (the top of the dragged block). */
  function locate(x: number, top: number): { key: string; at: number } | null {
    for (const [i, el] of colEls.entries()) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right) {
        const at = Math.round((span[0] + (top - r.top) / PX) / 15) * 15;
        return { key: keys[i], at: Math.max(0, at) };
      }
    }
    return null;
  }

  function down(e: PointerEvent, from: string, row: CalRow) {
    if ((e.button && e.button !== 0) || row.state !== 'todo') return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x0 = e.clientX,
      y0 = e.clientY;
    const touch = e.pointerType !== 'mouse';
    let started = false;
    const begin = () => {
      started = true;
      drag = { row, from, x: rect.left, y: rect.top, w: rect.width, h: rect.height, grabY: y0 - rect.top, over: null };
    };
    // A finger holds first (a quick move scrolls the page); a mouse just drags.
    const hold = touch ? setTimeout(begin, 350) : null;
    const move = (ev: PointerEvent) => {
      if (!started) {
        const dist = Math.hypot(ev.clientX - x0, ev.clientY - y0);
        if (!touch && dist > 6) begin();
        else if (touch && dist > 8) return stop();
        if (!started) return;
      }
      ev.preventDefault();
      drag = {
        ...drag!,
        x: rect.left + ev.clientX - x0,
        y: rect.top + ev.clientY - y0,
        over: locate(ev.clientX, ev.clientY - drag!.grabY),
      };
    };
    const noScroll = (ev: TouchEvent) => started && ev.cancelable && ev.preventDefault();
    const up = () => {
      stop();
      if (!started || !drag) return;
      dragEnded = Date.now();
      const o = drag.over;
      drag = null;
      if (o && (o.key !== from || row.it.kind === 'fixed' || o.at !== Math.round(row.start / 15) * 15))
        void P.moveItem(from, row.it.id, o.key, o.at);
    };
    const stop = () => {
      if (hold) clearTimeout(hold);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeEventListener('touchmove', noScroll);
    };
    const cancel = () => {
      stop();
      drag = null;
    };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    addEventListener('touchmove', noScroll, { passive: false });
  }

  function openRow(key: string, row: CalRow) {
    if (Date.now() - dragEnded < 400) return;
    void P.openTaskOn(key, row.it.id);
  }

  /** A tap on an empty part of a day's column: a new task at that time. */
  function tapColumn(e: MouseEvent, i: number) {
    if (Date.now() - dragEnded < 400 || e.target !== e.currentTarget) return;
    const c = cols[i];
    if (c.ended || c.k < P.today) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = Math.round((span[0] + (e.clientY - r.top) / PX) / 15) * 15;
    void P.addOn(c.k, at);
  }
</script>

<div class="week">
  <div class="bar">
    <button class="nav" aria-label="Previous week" onclick={() => P.step(-1)}>‹</button>
    <div class="layout" role="group" aria-label="Layout">
      <button aria-pressed={layout === 'grid'} onclick={() => pick('grid')}>Grid</button>
      <button aria-pressed={layout === 'list'} onclick={() => pick('list')}>List</button>
    </div>
    <button class="nav" aria-label="Next week" onclick={() => P.step(1)}>›</button>
  </div>

  {#if layout === 'list'}
    <div class="list">
      {#each keys as k (k)}
        <AgendaDay key={k} />
      {/each}
    </div>
  {:else}
    <div class="grid-wrap" data-no-swipe>
      <div class="heads">
        <span></span>
        {#each cols as c (c.k)}
          <button class="head" class:today={c.k === P.today} onclick={() => P.openDay(c.k)} aria-label={longDate(c.d)}>
            <span class="wd">{weekdayShort(c.d)}</span>
            <span class="dn">{c.d.getDate()}</span>
            {#if c.counts && (c.counts.checks || c.counts.habits)}
              <span class="mini">{c.counts.checksDone + c.counts.habitsMet}/{c.counts.checks + c.counts.habits}</span>
            {/if}
          </button>
        {/each}
      </div>
      <div class="grid" style:height="{height}px">
        <div class="gutter">
          {#each hours as h (h)}
            <span class="hr" style:top="{y(h)}px">{hourLabel(h)}</span>
          {/each}
        </div>
        {#each cols as c, i (c.k)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div
            class="col"
            class:today={c.k === P.today}
            class:past={c.k < P.today}
            bind:this={colEls[i]}
            onclick={(e) => tapColumn(e, i)}
          >
            {#each hours as h (h)}
              <span class="line" style:top="{y(h)}px"></span>
            {/each}
            {#if drag?.over?.key === c.k}
              <span class="drop" style:top="{y(drag.over.at)}px">{fT(drag.over.at, P.settings.clock24)}</span>
            {/if}
            {#each c.rows as r (r.it.id)}
              {@const h = Math.max(18, (r.end - r.start) * PX - 2)}
              <button
                class="blk {r.state} {r.it.kind}"
                class:lifted={drag?.row.it.id === r.it.id}
                style:top="{y(r.start) + 1}px"
                style:height="{h}px"
                style:--c={hueColor(r.it.hue)}
                style:--ink={inkOn(r.it.hue)}
                aria-label="{r.it.title}, {fT(r.start, P.settings.clock24)}"
                onpointerdown={(e) => down(e, c.k, r)}
                onclick={() => openRow(c.k, r)}
              >
                <span class="bt">{r.it.title}</span>
                {#if h > 34}<span class="bm">{fT(r.start, P.settings.clock24)}</span>{/if}
              </button>
            {/each}
            {#if c.k === P.today && c.n >= span[0] && c.n <= span[1]}
              <span class="now" style:top="{y(c.n)}px"></span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if drag}
  <div
    class="ghost"
    style:left="{drag.x}px"
    style:top="{drag.y}px"
    style:width="{drag.w}px"
    style:height="{drag.h}px"
    style:--c={hueColor(drag.row.it.hue)}
    style:--ink={inkOn(drag.row.it.hue)}
  >
    <KindMark kind={drag.row.it.kind} hue={drag.row.it.hue} size={10} />
    <span>{drag.row.it.title}</span>
  </div>
{/if}

<style>
  .week {
    padding: 8px var(--px) 120px;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .nav {
    width: 44px;
    height: 40px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    font: 400 22px/1 var(--font);
    cursor: pointer;
  }
  .nav:hover {
    background: var(--sunk);
    color: var(--text);
  }
  .layout {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: 10px;
    background: var(--sunk);
  }
  .layout button {
    height: 30px;
    padding: 0 14px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    font: 400 13px/1 var(--font);
    cursor: pointer;
  }
  .layout button[aria-pressed='true'] {
    background: var(--raised);
    color: var(--text);
    box-shadow: 0 0 0 1px var(--border);
  }

  /* ---------- grid ---------- */
  .grid-wrap {
    --gut: 48px;
    overflow-x: auto;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--raised);
  }
  .heads,
  .grid {
    display: grid;
    grid-template-columns: var(--gut) repeat(7, minmax(64px, 1fr));
    min-width: calc(var(--gut) + 7 * 64px);
  }
  .heads {
    position: sticky;
    top: 0;
    border-bottom: 1px solid var(--border);
  }
  .head {
    all: unset;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 10px 0 8px;
    cursor: pointer;
  }
  .head:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: -2px;
  }
  .head .wd {
    font: 400 12px/1 var(--font);
    color: var(--muted);
  }
  .head .dn {
    font: 300 20px/1 var(--font);
    font-variant-numeric: tabular-nums;
  }
  .head.today .dn,
  .head.today .wd {
    color: var(--nowT);
  }
  .mini {
    font: 400 11px/1 var(--font);
    color: var(--faint);
  }
  .grid {
    position: relative;
  }
  .gutter {
    position: relative;
  }
  .hr {
    position: absolute;
    right: 8px;
    transform: translateY(-50%);
    font: 400 11px/1 var(--font);
    color: var(--faint);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .hr:first-child {
    transform: none;
  }
  .col {
    position: relative;
    border-left: 1px solid var(--border);
    cursor: copy;
  }
  .col.past {
    cursor: default;
    background: color-mix(in oklab, var(--sunk) 45%, transparent);
  }
  .col.today {
    background: color-mix(in oklab, var(--now) 5%, transparent);
  }
  .line {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
    pointer-events: none;
  }
  .blk {
    position: absolute;
    left: 3px;
    right: 3px;
    padding: 3px 6px;
    border: none;
    border-radius: 8px;
    background: var(--c);
    color: var(--ink);
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
    cursor: pointer;
    box-sizing: border-box;
    touch-action: pan-y;
  }
  .blk:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 1px;
  }
  .bt {
    font: 400 12px/1.25 var(--font);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .bm {
    font: 400 11px/1.2 var(--font);
    opacity: 0.8;
  }
  .blk.done,
  .blk.partial {
    opacity: 0.5;
  }
  .blk.done .bt {
    text-decoration: line-through;
  }
  .blk.missed {
    background: color-mix(in oklab, var(--c) 14%, var(--raised));
    color: var(--text);
    box-shadow: inset 0 0 0 1.5px var(--c);
  }
  .blk.buffer {
    background: repeating-linear-gradient(
      -45deg,
      color-mix(in oklab, var(--muted) 12%, transparent) 0 6px,
      transparent 6px 12px
    );
    color: var(--muted);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .blk.running {
    box-shadow:
      0 0 0 2px var(--raised),
      0 0 0 4px #fb923c;
  }
  .blk.lifted {
    opacity: 0.25;
  }
  .drop {
    position: absolute;
    left: 2px;
    right: 2px;
    border-top: 2px solid var(--now);
    font: 400 10px/1 var(--font);
    color: var(--nowT);
    padding-top: 2px;
    pointer-events: none;
    z-index: 2;
  }
  .now {
    position: absolute;
    left: -1px;
    right: 0;
    height: 2px;
    background: var(--now);
    pointer-events: none;
    z-index: 1;
  }
  .now::before {
    content: '';
    position: absolute;
    left: -4px;
    top: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--now);
  }
  .ghost {
    position: fixed;
    z-index: 30;
    pointer-events: none;
    padding: 4px 7px;
    border-radius: 8px;
    background: var(--c);
    color: var(--ink);
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font: 400 12px/1.25 var(--font);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
    transform: rotate(-1.5deg);
    box-sizing: border-box;
    overflow: hidden;
  }
</style>
