<script lang="ts">
  import { justDragged, pickUp, tapped } from '../lib/drag';
  import { planner as P } from '../lib/planner.svelte';
  import type { ItemVM } from '../lib/rows';
  import { dL } from '../lib/time';
  import { hueColor, inkOn } from '../lib/types';
  import { desktop } from '../lib/ui.svelte';
  import NowLine from './NowLine.svelte';
  import FinishChooser from './FinishChooser.svelte';
  import PostponeChooser from './PostponeChooser.svelte';
  import Reschedule from './Reschedule.svelte';
  import StepBox from './StepBox.svelte';

  let { v, list, shift = 0 }: { v: ItemVM; list: () => HTMLElement | null; shift?: number } = $props();

  const id = $derived(v.id);
  const it = $derived(v.it);
  const lifted = $derived(!!P.drag && P.drag.id === id);
  // Tasks can only be started once "Start my day" has been pressed; tapping Start before then says so.
  const dayStarted = $derived(P.day.dayStarted != null);
  const hovered = $derived(desktop.current && P.hover === id);
  const postponeArmed = $derived(P.armed('postpone', id));
  const finishArmed = $derived(P.armed('finish', id));
  const rsOpen = $derived(!!P.resched && P.resched.id === id && v.missed);
  const showSkip = $derived(P.isToday && !P.locked && hovered && v.s === 'todo' && !v.missed);

  type Ctl = { g: string; l: string; k?: 'primary' | 'done' | 'ghost' | 'resched' | 'mark'; on: () => void };
  const controls: Ctl[] | null = $derived.by(() => {
    if (postponeArmed || finishArmed) return null;
    if (v.missed)
      return rsOpen
        ? null
        : [
            { g: '↻', l: 'Reschedule', k: 'resched', on: () => P.openResched(id) },
            { g: '✓', l: 'Mark done', k: 'mark', on: () => P.markDone(id, v.start, v.end) },
          ];
    if (v.s === 'running')
      return [
        { g: '‖', l: 'Pause', on: () => P.pause(id) },
        { g: '✓', l: 'Done', k: 'done', on: () => P.done(id) },
        { g: '↷', l: 'Postpone', k: 'ghost', on: () => (it.card ? P.setAside(id) : P.arm('postpone', id)) },
      ];
    if (v.s === 'paused')
      return [
        { g: '▶', l: 'Resume', k: 'primary', on: () => P.resume(id) },
        { g: '✓', l: 'Done', k: 'done', on: () => P.done(id) },
        { g: '↷', l: 'Postpone', k: 'ghost', on: () => (it.card ? P.setAside(id) : P.arm('postpone', id)) },
      ];
    return null;
  });

  const boxRing = $derived(v.isOver ? 'rgba(248,113,113,.6)' : 'var(--border)');

  // Press and hold anywhere on the task's text to pick it up (touch). A pointer-only shortcut:
  // keyboard and screen-reader users move tasks with Earlier / Later in the task sheet.
  function holdToDrag(el: HTMLElement) {
    const down = (e: PointerEvent) => pickUp(P, e, id, list, 'row');
    el.addEventListener('pointerdown', down);
    return () => el.removeEventListener('pointerdown', down);
  }

  // Not when this tap is the end of a press-and-hold drag.
  const open = () => !justDragged() && P.openSheet({ type: 'task', id });
  const capKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };
</script>

<li
  data-drag-idx={v.idx}
  class="row"
  class:active={v.active}
  class:hovered={hovered && !v.active}
  class:lifted
  style:opacity={lifted ? 1 : v.op}
  style:transform={lifted ? `translateY(${P.drag!.dy}px) scale(1.02)` : shift ? `translateY(${shift}px)` : undefined}
  style:min-height="{v.h + 8}px"
  style:--box-ring={boxRing}
  onmouseenter={() => desktop.current && P.hover !== id && (P.hover = id)}
  onmouseleave={() => P.hover === id && (P.hover = null)}
>
  <div class="times" {@attach holdToDrag}>
    {#if v.t1}<span class="t1">{v.t1}</span>{/if}
    {#if v.ap1}<span class="ap">{v.ap1}</span>{/if}
    {#if v.t2}<span class="t2">{v.t2}</span>{/if}
    {#if v.ap2}<span class="ap faint">{v.ap2}</span>{/if}
  </div>

  <div class="spine">
    <span
      role="button"
      tabindex="0"
      data-no-swipe
      aria-label="{it.title}. Tap to edit, hold to reorder"
      class="cap"
      class:buffer={it.kind === 'buffer'}
      style:height="{v.h}px"
      style:--bar={v.capBg}
      style:--bar-edge={v.capBorder}
      onpointerdown={(e) => pickUp(P, e, id, list, 'capsule')}
      onclick={() => tapped(P, id)}
      onkeydown={capKey}
      oncontextmenu={(e) => e.preventDefault()}
    >
    </span>
  </div>

  <div class="content" {@attach holdToDrag}>
    <div class="meta">
      <button class="dur hit" style:--hit-x="4px" style:--hit-y="12px" onclick={open}
        >{it.card ? 'Project' : dL(it.min)}</button
      >
      {#if v.sub}<span style:color={v.subTone}>{v.sub}</span>{/if}
      {#if v.fixedNow}
        <!-- Moved by the tasks before it: the time it was set for, and where it is now. -->
        <span class="fixed moved" aria-label="fixed at {v.fixedAt}, moved to {v.fixedNow}"
          >fixed · <s>{v.fixedAt}</s> {v.fixedNow}</span
        >
      {:else if v.fixedAt}<span class="fixed">fixed · {v.fixedAt}</span>{/if}
      {#if showSkip}
        <button class="hover-btn skip" onclick={() => P.skip(id)}>Skip</button>
        <button class="hover-btn pp" onclick={() => P.arm('postpone', id)}>Postpone</button>
      {/if}
    </div>
    <button class="title" class:muted={v.mutedT} class:struck={v.s === 'skipped' || v.s === 'done'} onclick={open}
      >{it.title}</button
    >
    {#if v.active}
      <div class="clock">
        <span class="count" style:color={v.countColor}>{v.count}</span>
        <span class="cl">{v.countSub ?? (v.isOver ? 'over' : 'left')}</span>
      </div>
    {/if}
    {#if v.badges.length || v.flags.length}
      <div class="badges">
        {#each v.badges as b (b)}<span class="badge">{b}</span>{/each}
        {#each v.flags as f (f.t)}<span class="flag {f.tone}">{f.t}</span>{/each}
      </div>
    {/if}
  </div>

  <div class="acts">
    {#if v.aStart}
      <button
        class="start"
        aria-label="Start {it.title}"
        aria-disabled={!dayStarted}
        onclick={(e) => {
          e.stopPropagation();
          if (dayStarted) P.startItem(id);
          else P.askToStartDay('timer');
        }}
        ><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.6v8.8L10.4 6z" /></svg
        >Start</button
      >
    {/if}
    {#if v.aCheck}
      <button
        class="check hit"
        aria-label="Reopen {it.title}"
        style:--c={hueColor(it.hue)}
        style:--ink={inkOn(it.hue)}
        onclick={() => P.reopen(id)}>✓</button
      >
    {/if}
    {#if v.aRestore}
      <button class="restore hit" style:--hit-y="4px" onclick={() => P.restore(id)}>{v.restoreLabel}</button>
    {/if}
    {#if v.glyph}<span class="glyph" aria-label="Planned">{v.glyph}</span>{/if}
  </div>

  {#if v.active && it.subtasks.length}
    <div class="wide subs">
      {#each it.subtasks as x, xi (x.id)}
        <button class="sub" onclick={() => P.toggleSub(id, x.id)} role="checkbox" aria-checked={x.d}>
          <StepBox index={xi} done={x.d} />
          <span class="subt" class:done={x.d}>{x.t}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if controls}
    <div class="wide ctls">
      {#each controls as c, i (i)}
        <button class="ctl {c.k ?? ''}" aria-label="{c.l} {it.title}" onclick={c.on}
          ><span class="g">{c.g}</span>{c.l}</button
        >
      {/each}
    </div>
  {/if}

  {#if postponeArmed}
    <div class="wide confirm"><PostponeChooser {id} title={it.title} worked={v.active ? v.w : 0} /></div>
  {/if}

  {#if finishArmed}
    <div class="wide confirm"><FinishChooser {id} title={it.title} worked={v.w} min={it.min} /></div>
  {/if}

  {#if rsOpen}
    <div class="wide confirm"><Reschedule {v} /></div>
  {/if}

  {#if v.nowIn != null}
    <div
      class="now-in"
      aria-hidden="true"
      style:left="0"
      style:right={v.active ? 'calc(100% - var(--tc) - var(--sc) - 2px)' : '0'}
      style:top="calc(4px + {v.nowIn} * (100% - 8px))"
    >
      <NowLine />
    </div>
  {/if}
</li>

<style>
  .row {
    display: grid;
    grid-template-columns: var(--tc) var(--sc) minmax(0, 1fr) var(--ac);
    align-content: start;
    border-radius: var(--r-card);
    position: relative;
    transition:
      opacity 200ms,
      background 240ms,
      box-shadow 240ms;
  }
  /* Picked up: floats above the list and follows the finger. */
  .row.lifted {
    z-index: 5;
    background: var(--raised);
    box-shadow: 0 14px 32px -10px rgba(0, 0, 0, 0.35);
    border-radius: var(--r-card);
    transition: box-shadow 150ms;
  }
  /* Long-press on a task picks it up, so don't let the phone select its text or pop a menu. */
  .times,
  .content {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  .row.hovered {
    background: var(--sunk);
  }
  /* The task under way: its text, clock and controls on a card beside its colour bar. */
  .row.active {
    margin: 4px 0;
  }
  .row.active::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: calc(var(--tc) + var(--sc) + 2px);
    border-radius: var(--r-card);
    background: var(--raised);
    box-shadow: inset 0 0 0 1px var(--box-ring);
    pointer-events: none;
  }
  .row.active > :not(.now-in) {
    position: relative;
  }
  .row.active .acts {
    padding-right: 12px;
  }
  /* The bar runs the full height of the card beside it. */
  .row.active .cap {
    height: auto !important;
    align-self: stretch;
  }

  .times {
    grid-row: 1 / span 4;
    padding: 11px 10px 0 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
  }
  .t1 {
    font: 400 13px/1 var(--font);
  }
  .t2 {
    font: 400 12px/1 var(--font);
    color: var(--faint);
    margin-top: 5px;
  }
  .ap {
    font: 400 10px/1 var(--font);
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .ap.faint {
    color: var(--faint);
  }

  .spine {
    grid-row: 1 / span 4;
    position: relative;
    display: flex;
    justify-content: center;
    padding: 4px 0;
  }
  /* The colour bar, as tall as the task is long. The whole column is its handle: tap to edit,
     move to pick it up. */
  .cap {
    width: var(--sc);
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    position: relative;
    z-index: 1;
    flex: none;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .cap::before {
    content: '';
    width: 8px;
    height: 100%;
    border-radius: var(--r-bar);
    background: var(--bar);
    outline: var(--bar-edge);
    outline-offset: 1px;
    box-sizing: border-box;
    transition: background 240ms ease;
  }
  .cap.buffer::before {
    outline-offset: -1.5px;
  }
  .cap:focus-visible {
    outline: none;
  }
  .cap:focus-visible::before {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }

  .content {
    padding: 8px 0 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font: 400 13px/1.2 var(--font);
    color: var(--muted);
  }
  .dur {
    all: unset;
    position: relative;
    cursor: pointer;
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    text-decoration-color: var(--faint);
  }
  .fixed {
    font: 400 11px/1 var(--font);
    padding: 4px 8px;
    border-radius: var(--r-sm);
    background: var(--sunk);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .fixed.moved {
    background: rgba(250, 204, 21, 0.14);
    border-color: rgba(234, 179, 8, 0.45);
  }
  .fixed s {
    color: var(--muted);
    text-decoration-color: var(--muted);
  }
  .hover-btn {
    font: 400 13px/1 var(--font);
    padding: 6px 10px;
    border-radius: var(--r-ctl);
    background: var(--raised);
    cursor: pointer;
  }
  .hover-btn.skip {
    margin-left: auto;
    color: var(--text);
    border: 1px solid var(--border);
  }
  .hover-btn.pp {
    color: var(--orT);
    border: 1.5px solid var(--now);
  }
  .title {
    all: unset;
    font: 400 15px/1.3 var(--font);
    color: var(--text);
    text-wrap: pretty;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .title.muted {
    color: var(--muted);
  }
  .title.struck {
    text-decoration: line-through;
  }
  .title:focus-visible,
  .dur:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
  }
  .badge {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
  .flag {
    font: 400 12px/1 var(--font);
    padding: 5px 8px;
    border-radius: var(--r-sm);
    white-space: nowrap;
    background: rgba(253, 224, 71, 0.3);
    color: var(--yelT);
  }
  .flag.r {
    background: rgba(248, 113, 113, 0.16);
    color: var(--redT);
  }

  .acts {
    padding-top: 9px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
  }
  .start {
    height: 40px;
    padding: 0 12px 0 10px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--line);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .start svg {
    fill: currentColor;
  }
  .start[aria-disabled='true'] {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .clock {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 4px;
  }
  .count {
    font: 500 38px/1 var(--font);
    letter-spacing: -0.03em;
    transition: color 240ms;
  }
  .cl {
    font: 400 13px/1.2 var(--font);
    color: var(--muted);
  }
  .check {
    width: 32px;
    height: 32px;
    margin: 2px 4px 0 0;
    border-radius: var(--r-ctl);
    border: none;
    background: var(--c);
    color: var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .restore {
    height: 36px;
    padding: 0 10px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 13px/1 var(--font);
    cursor: pointer;
  }
  .glyph {
    width: 32px;
    height: 32px;
    margin: 2px 4px 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--faint);
    font: 400 16px/1 var(--font);
  }

  .wide {
    grid-column: 3 / span 2;
  }
  .subs {
    padding: 0 12px 10px 10px;
    display: flex;
    flex-direction: column;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    border: none;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: var(--text);
    font: 400 14px/1.3 var(--font);
  }
  .subt.done {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: var(--faint);
  }
  .ctls {
    padding: 2px 12px 12px 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .confirm {
    margin: 0 12px 14px 10px;
  }
  .now-in {
    position: absolute;
    height: 20px;
    margin-top: -10px;
    display: grid;
    grid-template-columns: var(--tc) minmax(0, 1fr);
    align-items: center;
    pointer-events: none;
    z-index: 3;
  }
</style>
