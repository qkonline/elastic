<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { planner as P } from '../lib/planner.svelte';
  import { clockToDay, fT, hhmm, hm, keyDate, shortDate, weekdayLong } from '../lib/time';
  import { habitDefaults } from '../lib/habits';
  import { stripSegs } from '../lib/rows';
  import { isPartial } from '../lib/schedule';
  import type { Habit, Hue, Kind } from '../lib/types';
  import { hueColor, untimed } from '../lib/types';
  import { reducedMotion } from '../lib/ui.svelte';
  import Fields from './Fields.svelte';
  import HabitFields from './HabitFields.svelte';
  import KindChips from './KindChips.svelte';
  import SwitchRow from './SwitchRow.svelte';

  // The name, type, length and colour are always shown; repeating is behind a switch that opens
  // its choices in place. A task's length starts as Settings says (No time by default): with no
  // time, it's a check, ticked off on the checklist instead of timed.
  // Added from the week grid at a time: a fixed time at that time.
  // Added from the Habits screen: a habit to start with.
  let { at, kind: startKind }: { at?: number; kind?: Kind } = $props();
  let title = $state('');
  let kind = $state<Kind>(untrack(() => startKind ?? (at != null ? 'fixed' : 'task')));
  let hue = $state<Hue | null>(null);
  // Buffers and fixed times always take time, so they start at 30 minutes when No time was
  // picked; going back to Task brings No time back, so trying a type costs nothing.
  const startMin = untrack(() => P.settings.defLength);
  const startsTimed = untrack(() => kind === 'buffer' || kind === 'fixed');
  let wasNone = startsTimed && startMin === 0;
  let min = $state(wasNone ? 30 : startMin);
  const timed = $derived(kind === 'buffer' || kind === 'fixed' || (kind === 'task' && min > 0));
  function pickKind(k: Kind) {
    if ((k === 'buffer' || k === 'fixed') && min === 0) ((min = 30), (wasNone = true));
    else if (k === 'task' && wasNone && min === 30) ((min = 0), (wasNone = false));
    kind = k;
  }
  function pickMin(m: number) {
    min = m;
    wasNone = false;
  }
  const lengthNote = $derived(
    kind === 'buffer'
      ? 'How much time it keeps free.'
      : kind === 'fixed'
        ? 'How long it takes, from its time.'
        : min === 0
          ? 'A check: a box to tick, with no timer. Pick a length to plan it on the timeline.'
          : 'On the timeline, with a timer to start, pause and finish.',
  );
  // A habit: what it asks for and on which days (it always repeats).
  let habit = $state<Habit>(habitDefaults('check'));
  let habitRepeat = $state('Every day');
  let repeats = $state(false);
  let repeat = $state('Every day');
  const repeatOpts = $derived(['Every day', 'Weekdays', 'Every ' + weekdayLong(keyDate(P.viewKey))]);
  // Fixed items default to the next quarter hour, half an hour from now (after midnight on a
  // late day, that's still this day).
  const defaultFixed = Math.ceil((P.nowToday() + 30) / 15) * 15;
  let fixedStr = $state(hhmm(untrack(() => at) ?? defaultFixed));
  const late = $derived(Math.max(P.day.wrap, P.isToday ? P.n : 0));

  const ok = $derived(!!title.trim());
  // A timed task or buffer goes on the end of the day: show the day's strip with it added, and
  // when the day would then end.
  const preview = $derived.by(() => {
    if (P.locked || !timed || kind === 'fixed' || kind === 'habit') return null;
    const rows = P.sch.rows.filter(
      (r) => !untimed(r.it.kind) && r.it.status !== 'skipped' && !(r.it.status === 'postponed' && !isPartial(r.it)),
    );
    if (!rows.length) return null;
    const segs = stripSegs(P.sch.rows, P.planDay.dayStarted != null);
    return { segs, end: Math.max(P.sch.finish, ...rows.map((r) => r.end)) + min };
  });
  const sel = $derived(hue ?? (kind === 'fixed' ? 'indigo' : kind === 'habit' ? 'lime' : 'cyan'));
  const placeholder = $derived(P.isToday ? 'What else today?' : `What else on ${shortDate(keyDate(P.viewKey))}?`);
  // A habit's fields change a lot with its kind and how often, so its sheet keeps one height.
  const sheet = getContext<{ tall: boolean } | undefined>('sheet');
  $effect(() => {
    if (sheet) sheet.tall = kind === 'habit';
  });
  const unfold = () => ({ duration: reducedMotion.current ? 0 : 220, easing: cubicOut });

  const fixedAtPicked = $derived(fixedStr ? clockToDay(hm(fixedStr), late) : defaultFixed);

  function add() {
    if (!ok) return;
    if (kind === 'habit') {
      P.addTask({ title: title.trim(), min: 0, kind, hue: sel, fixedAt: null, repeat: habitRepeat, habit });
      return;
    }
    const k = timed ? kind : 'check';
    const fixedAt = k === 'fixed' ? fixedAtPicked : null;
    P.addTask({
      title: title.trim(),
      min: timed ? Math.max(1, min) : 0,
      kind: k,
      hue: sel,
      fixedAt,
      repeat: repeats ? repeat : 'Once',
    });
  }
  const enter = (e: KeyboardEvent) => e.key === 'Enter' && !e.isComposing && add();
</script>

<div class="head">
  <span class="h">{kind === 'habit' ? 'New habit' : 'New task'}</span>
  <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
</div>
<div class="body">
  <input
    class="name large-text"
    data-autofocus
    bind:value={title}
    onkeydown={enter}
    {placeholder}
    aria-label="Task name"
  />

  <div class="group">
    <KindChips {kind} {hue} habit onpick={pickKind} />
    {#if kind === 'fixed'}
      <label class="at" transition:slide={unfold()}>
        <span>At</span>
        <input class="time" type="time" aria-label="Time" bind:value={fixedStr} />
      </label>
    {/if}
  </div>

  {#if kind !== 'habit'}
    <div class="group" transition:slide={unfold()}>
      <Fields field="duration" label="Length" none={kind === 'task'} {min} onMin={pickMin} />
      <p class="lnote">{lengthNote}</p>
    </div>
  {/if}

  {#if kind !== 'buffer'}
    <div transition:slide={unfold()}>
      <Fields field="colour" hue={sel} onHue={(h) => (hue = h)} ringBg="var(--bg)" />
    </div>
  {/if}

  {#if kind === 'habit'}
    <div transition:slide={unfold()}>
      <HabitFields
        {habit}
        repeat={habitRepeat}
        onchange={(h, r) => {
          habit = h;
          habitRepeat = r;
        }}
      />
    </div>
  {:else}
    <div class="props">
      <SwitchRow
        label="Repeats"
        note={repeats ? 'Also added to the matching days after this one' : 'Just this once'}
        on={repeats}
        ontoggle={() => (repeats = !repeats)}
      >
        <div class="row">
          {#each repeatOpts as r (r)}
            <button class="chip" aria-pressed={repeat === r} onclick={() => (repeat = r)}>{r}</button>
          {/each}
        </div>
      </SwitchRow>
    </div>
    {#if preview}
      <div class="preview" transition:slide={unfold()}>
        <div class="pbar" aria-hidden="true">
          {#each preview.segs as g (g.key)}
            <span class:gap={g.gap} class:faded={g.faded} style:flex-grow={g.min} style:--c={g.c}></span>
          {/each}
          <span class="new" style:flex-grow={min} style:--c={kind === 'buffer' ? 'var(--line)' : hueColor(sel)}></span>
        </div>
        <span>Your day would end at <b>{fT(preview.end, P.settings.clock24)}</b>.</span>
      </div>
    {/if}
  {/if}
</div>
<div class="foot">
  <span class="note">
    {kind === 'habit'
      ? P.settings.habitsPlace === 'separate'
        ? 'Goes in your Habits, on each day it is due.'
        : 'Goes on your checklist, on each day it is due.'
      : !timed
        ? 'Goes on your checklist, above the timeline.'
        : kind === 'fixed'
          ? `Goes in the plan at ${fT(fixedAtPicked, P.settings.clock24)}.`
          : 'Goes to the end of the day. Drag it to reorder.'}
  </span>
  <button class="cancel" onclick={() => P.closeSheet()}>Cancel</button>
  <button class="add" class:ok disabled={!ok} onclick={add}>{kind === 'habit' ? 'Add habit' : 'Add task'}</button>
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px 6px;
  }
  .h {
    flex: 1;
    font: 600 20px/1.2 var(--font);
    letter-spacing: -0.01em;
  }
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  /* When the keyboard leaves little room, scroll the form rather than squash its fields. */
  .body > :global(*) {
    flex-shrink: 0;
  }
  .name {
    height: 54px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--line);
    background: var(--raised);
    padding: 0 18px;
    font: 400 17px/1 var(--font);
    color: var(--text);
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }
  .name:focus,
  .name:focus-visible {
    border: 1.5px solid var(--text);
  }
  /* Where the new task lands: the day's strip, with it on the end. */
  .preview {
    padding: 12px;
    border-radius: var(--r-ctl);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font: 400 13px/1.3 var(--font);
    color: var(--muted);
  }
  .pbar {
    display: flex;
    gap: 2px;
    height: 14px;
  }
  .pbar span {
    flex: 1 1 0;
    min-width: 2px;
    border-radius: var(--r-bar);
    background: var(--c);
  }
  .pbar .faded {
    opacity: 0.4;
  }
  .pbar .gap {
    background: var(--border);
  }
  .pbar .new {
    outline: 2px solid var(--text);
    outline-offset: 1px;
  }
  .preview b {
    font-weight: 600;
    color: var(--text);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lnote {
    margin: 0;
    font: 400 13px/1.4 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .at {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 400 14px/1 var(--font);
    color: var(--muted);
  }
  /* Optional properties: one card, a row per switch (SwitchRow). */
  .props {
    border: 1px solid var(--border);
    border-radius: var(--r-card);
    background: var(--raised);
    overflow: hidden;
  }
  .time {
    height: 40px;
    padding: 0 8px;
    border-radius: var(--r-ctl);
    border: none;
    background: var(--sunk);
    color: var(--text);
    font: 400 14px/1 var(--font);
  }
  .foot {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 20px calc(26px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
  }
  /* Keyboard up: every pixel counts, and the home indicator is hidden behind it anyway. */
  :global(.keyboard-open) .foot {
    padding-bottom: 12px;
    justify-content: flex-end;
  }
  :global(.keyboard-open) .note {
    display: none;
  }
  .note {
    flex: 1;
    min-width: 0;
    font: 400 12px/1.4 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .cancel {
    height: 48px;
    padding: 0 14px;
    border-radius: var(--r-ctl);
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .add {
    height: 48px;
    padding: 0 22px;
    border-radius: var(--r-ctl);
    border: none;
    background: var(--sunk);
    color: var(--faint);
    font: 400 15px/1 var(--font);
    cursor: default;
    white-space: nowrap;
    transition:
      background 240ms,
      color 240ms;
  }
  .add.ok {
    background: var(--text);
    color: var(--bg);
    cursor: pointer;
  }
</style>
