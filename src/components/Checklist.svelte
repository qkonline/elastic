<script lang="ts">
  import { justDragged, pickUp, tapped } from '../lib/drag';
  import { habitMet, habitValue, isHabit } from '../lib/habits';
  import { iconOf } from '../lib/icons';
  import { planner as P } from '../lib/planner.svelte';
  import { keyDate, shortDate } from '../lib/time';
  import { hueColor, inkOn, type Item } from '../lib/types';
  import Collapsible from './Collapsible.svelte';
  import HabitRow from './HabitRow.svelte';
  import SectionHead from './SectionHead.svelte';
  import TaskIcon from './TaskIcon.svelte';

  // The day's untimed entries: checks (tasks with no duration, ticked off) and habits, kept out
  // of the timeline. Habits sit among the checks in the Checklist, or in a Habits section of
  // their own (Settings), as `mode` says. Like a task's Start button, ticking waits for the day
  // to start (unticking never does); tapping one before then says so. Entries are in the day's
  // order: press and hold one (or drag it with a mouse) to move it. Settings shows them as a
  // list that folds above three, or as a row of chips that scrolls sideways. In the list each
  // entry has its icon on the left and its box or ring on the right, a strip under the title
  // fills in as they're done, and the done ones gather at the bottom under "Done today".
  let { mode }: { mode: 'both' | 'checks' | 'habits' } = $props();

  const entries = $derived(
    P.day.items
      .map((it, idx) => ({ it, idx }))
      .filter(
        ({ it }) =>
          it.status !== 'skipped' &&
          (it.kind === 'check' ? mode !== 'habits' : it.kind === 'habit' && mode !== 'checks'),
      ),
  );
  const done = $derived(
    entries.filter(({ it }) => (isHabit(it) ? habitMet(P.day, it, P.n) : it.status === 'done')).length,
  );
  // In the combined list the title says what's in it: checks, habits, or both.
  const hasHabits = $derived(entries.some(({ it }) => it.kind === 'habit'));
  const hasChecks = $derived(entries.some(({ it }) => it.kind === 'check'));
  const title = $derived(
    mode === 'habits' || (mode === 'both' && hasHabits && !hasChecks)
      ? 'Habits'
      : mode === 'both' && hasHabits
        ? 'Checklist + Habits'
        : 'Checklist',
  );

  const icon = $derived(title === 'Habits' ? 'habits' : 'checks');

  // Done, for the list: a ticked check, or a habit met (a habit to break stays up: it can still
  // be slipped). A check moved to another day has been dealt with too.
  const finished = (it: Item) =>
    isHabit(it) ? it.habit.type !== 'quit' && habitMet(P.day, it, P.n) : it.status !== 'todo';
  // How far each one has got, for the strip.
  const share = (it: Item) =>
    isHabit(it)
      ? habitMet(P.day, it, P.n)
        ? 1
        : it.habit.type === 'check' || it.habit.type === 'quit'
          ? 0
          : Math.min(1, habitValue(P.day, it, P.n) / it.habit.target)
      : it.status === 'done'
        ? 1
        : 0;
  const row = $derived(P.settings.checklistLayout === 'row');
  // The list's order: still to do, then done. The chips keep the day's order.
  const shown = $derived(
    row ? entries : [...entries.filter((e) => !finished(e.it)), ...entries.filter((e) => finished(e.it))],
  );
  const firstDone = $derived(row ? -1 : shown.findIndex((e) => finished(e.it)));

  let list: HTMLUListElement | null = $state(null);

  // While an entry is dragged, the ones between its old and new place slide to open a gap.
  const shifts = $derived.by(() => {
    const out: Record<string, number> = {};
    const d = P.drag;
    if (!d || d.over == null) return out;
    const from = shown.findIndex((e) => e.it.id === d.id);
    if (from < 0) return out;
    // Dropped in front of the entry at day index `over`, or after them all.
    let to = shown.findIndex((e) => e.idx === d.over);
    if (to < 0) to = shown.length;
    if (to > from) for (let i = from + 1; i < to; i++) out[shown[i].it.id] = -d.h;
    else for (let i = to; i < from; i++) out[shown[i].it.id] = d.h;
    return out;
  });
  const lifted = (it: Item) => !!P.drag && P.drag.id === it.id;
  const grab = (e: PointerEvent, id: string) =>
    pickUp(P, e, id, () => list, e.pointerType === 'mouse' ? 'capsule' : 'row', row ? 'x' : 'y');
  const along = (px: number) => (row ? `translateX(${px}px)` : `translateY(${px}px)`);
  const tick = (it: Item, waiting: boolean) =>
    justDragged() ? null : P.locked ? P.sayLocked() : waiting ? P.askToStartDay('check') : P.toggleCheck(it.id);
</script>

{#snippet entry(it: Item, idx: number, hidden: boolean)}
  {@const moved = it.status === 'postponed'}
  {@const waiting = P.waiting && it.status === 'todo'}
  {@const off = waiting || P.locked}
  <li
    class:done={it.kind === 'check' && it.status === 'done'}
    class:moved
    class:lifted={lifted(it)}
    class:sorting={!!P.drag}
    data-drag-idx={idx}
    inert={hidden}
    style:transform={lifted(it) ? `${along(P.drag!.dy)} scale(1.02)` : shifts[it.id] ? along(shifts[it.id]) : undefined}
    onpointerdown={(e) => grab(e, it.id)}
  >
    {#if isHabit(it)}
      <HabitRow {it} wide={!row} />
    {:else if !row}
      <TaskIcon name={iconOf(it)} hue={it.hue} faded={it.status !== 'todo'} />
      <span class="text">
        <button class="title" onclick={() => tapped(P, it.id)}>{it.title}</button>
        {#if moved && it.movedKey}
          <span class="meta">Moved to {shortDate(keyDate(it.movedKey))}</span>
        {:else if it.repeat !== 'Once' && (it.repeat !== 'Every day' || P.repeatCount(it))}
          <span class="meta">↻ {it.repeat}{P.repeatCount(it) ? ` · ${P.repeatCount(it)}` : ''}</span>
        {/if}
      </span>
      {#if !moved}
        <button
          class="box big hit"
          role="checkbox"
          aria-checked={it.status === 'done'}
          aria-label={it.title}
          aria-disabled={off}
          style:--c={hueColor(it.hue)}
          style:--ink={inkOn(it.hue)}
          onclick={() => tick(it, waiting)}
          ><svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M3 7.2l2.6 2.6L11 4.4" /></svg
          ></button
        >
      {/if}
    {:else}
      <button
        class="box hit"
        role="checkbox"
        aria-checked={it.status === 'done'}
        aria-label={it.title}
        disabled={moved}
        aria-disabled={off}
        style:--c={hueColor(it.hue)}
        style:--ink={inkOn(it.hue)}
        onclick={() => tick(it, waiting)}>{it.status === 'done' ? '✓' : ''}</button
      >
      <span class="text">
        <button class="title" onclick={() => tapped(P, it.id)}>{it.title}</button>
        {#if moved && it.movedKey}
          <span class="meta">Moved to {shortDate(keyDate(it.movedKey))}</span>
        {/if}
      </span>
    {/if}
  </li>
{/snippet}

{#if entries.length && row}
  <section class="rowsec {mode === 'habits' ? 'habits' : 'checklist'}" aria-label={title}>
    <div class="rhead"><SectionHead {icon} {title} tally="{done}/{entries.length}" /></div>
    <ul class="chips" bind:this={list} data-no-swipe>
      {#each entries as { it, idx } (it.id)}
        {@render entry(it, idx, false)}
      {/each}
    </ul>
  </section>
{:else if entries.length}
  <Collapsible
    id={mode}
    label={title}
    count={entries.length}
    {icon}
    tally="{done}/{entries.length}"
    kind={mode === 'habits' ? 'habits' : 'checklist'}
    bind:list
  >
    {#snippet strip()}
      <div class="strip" aria-hidden="true">
        {#each entries as { it } (it.id)}
          <span style:--c={hueColor(it.hue)}><i style:width="{share(it) * 100}%"></i></span>
        {/each}
      </div>
    {/snippet}
    {#snippet children(shut)}
      {#each shown as { it, idx }, i (it.id)}
        {#if i === firstDone}
          <li class="done-head" inert={shut && i >= 3}>{P.isToday ? 'Done today' : 'Done'}</li>
        {/if}
        {@render entry(it, idx, shut && i >= (firstDone >= 0 && i >= firstDone ? 2 : 3))}
      {/each}
    {/snippet}
  </Collapsible>
{/if}

<style>
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    background: var(--raised);
    position: relative;
  }
  li.sorting {
    transition: transform 180ms ease;
  }
  li.lifted {
    z-index: 2;
    transition: none;
    border-radius: var(--r-ctl);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }
  .box {
    --hit-x: 10px;
    --hit-y: 10px;
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 5px;
    border: 1.5px solid var(--c);
    background: color-mix(in oklab, var(--c) 14%, transparent);
    color: var(--ink);
    font: 400 13px/1 var(--font);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    transition:
      background 200ms,
      border-color 200ms;
  }
  .done .box {
    background: var(--c);
  }
  /* In the list: a bigger box on the right, its tick in the box's ink once done. */
  .box.big {
    --hit-x: 11px;
    --hit-y: 11px;
    width: 26px;
    height: 26px;
    margin-right: 7px;
    border-width: 2px;
    border-radius: var(--r-sm);
    background: color-mix(in oklab, var(--c) 10%, transparent);
  }
  .box.big svg {
    fill: none;
    stroke: transparent;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .done .box.big {
    background: var(--c);
  }
  .done .box.big svg {
    stroke: var(--ink);
  }
  /* Under the title: one stretch per entry, filling in its colour as it's done. */
  .strip {
    display: flex;
    gap: 3px;
    padding: 10px 16px 6px;
  }
  .strip span {
    flex: 1;
    height: 6px;
    border-radius: var(--r-bar);
    overflow: hidden;
    background: color-mix(in oklab, var(--c) 22%, transparent);
  }
  .strip i {
    display: block;
    height: 100%;
    background: var(--c);
    transition: width 260ms ease-out;
  }
  .done-head {
    min-height: 0;
    padding: 12px 0 4px;
    font: 500 13px/1.2 var(--font);
    color: var(--muted);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
  }
  .chips .text {
    flex: none;
    padding: 0;
  }
  .title {
    all: unset;
    min-width: 0;
    font: 400 15px/1.3 var(--font);
    color: var(--text);
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .title:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .done .title,
  .moved .title {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: var(--faint);
  }
  .box:disabled,
  .box[aria-disabled='true'] {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .moved .box {
    cursor: default;
  }
  .meta {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
    white-space: nowrap;
  }
  /* As a row of chips that scrolls sideways. */
  .rowsec {
    margin: 14px 0 0;
  }
  .rhead {
    padding: 0 var(--px) 8px;
  }
  .chips {
    position: relative; /* entries measure their place (offsetLeft) from the row */
    list-style: none;
    margin: 0;
    padding: 2px var(--px) 4px;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chips li {
    flex: none;
    gap: 8px;
    min-height: 44px;
    padding: 0 12px 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--r-ctl);
    box-sizing: border-box;
  }
  .chips li.done {
    background: var(--text);
    border-color: var(--text);
  }
  .chips li.done .title {
    color: var(--bg);
    text-decoration: none;
  }
  .chips .box {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    font-size: 11px;
  }
  .chips .title {
    flex: none;
    white-space: nowrap;
    font-size: 14px;
  }
  /* Chips are small: the box or ring is the control there. */
  .chips :global(.row-key) {
    display: none;
  }
  .chips :global(.text) {
    padding: 4px 0;
  }
  .chips :global(.text .title) {
    white-space: nowrap;
    font-size: 14px;
  }
  @media (prefers-reduced-motion: reduce) {
    li.sorting,
    .strip i {
      transition: none;
    }
  }
</style>
