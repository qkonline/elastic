<script lang="ts">
  import { untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { uid } from '../lib/actions';
  import { planner as P } from '../lib/planner.svelte';
  import { isActive } from '../lib/schedule';
  import { pastedSteps } from '../lib/steps';
  import { clockToDay, hhmm, hm, keyDate, weekdayLong } from '../lib/time';
  import type { Item, Kind } from '../lib/types';
  import { reducedMotion } from '../lib/ui.svelte';
  import Fields from './Fields.svelte';
  import IconPicker from './IconPicker.svelte';
  import KindChips from './KindChips.svelte';
  import SwitchRow from './SwitchRow.svelte';

  // The task sheet's Edit form: the New task form filled in with the task, plus its steps and
  // notes. Nothing changes until Update task; Cancel goes back to the task as it was.
  let { item, ondone }: { item: Item; ondone: () => void } = $props();
  const it = untrack(() => item);
  const id = it.id;

  let title = $state(it.title);
  let kind = $state<Kind>(it.kind === 'check' ? 'task' : it.kind);
  // No time (0) makes a check. Buffers and fixed times always take time: picking one with No time
  // gives it 30 minutes, and going back to Task brings No time back.
  let min = $state(it.kind === 'check' ? 0 : it.min > 0 ? it.min : 30);
  let wasNone = false;
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
  let hue = $state(it.hue);
  const late = Math.max(P.day.wrap, P.isToday ? P.n : 0);
  let fixedStr = $state(hhmm(it.fixedAt ?? Math.ceil((P.nowToday() + 30) / 15) * 15));
  let repeats = $state(it.repeat !== 'Once');
  let repeat = $state(it.repeat !== 'Once' ? it.repeat : 'Every day');
  let goalId = $state(it.goalId ?? null);
  let habitId = $state(it.habitId ?? null);
  let icon = $state(it.icon ?? null);
  let steps = $state(it.subtasks.map((x) => ({ ...x })));
  let newStep = $state('');
  let note = $state(it.note);

  // A running timer keeps its task timed.
  const running = isActive(it);
  const repeatOpts = $derived.by(() => {
    const list = ['Every day', 'Weekdays', 'Every ' + weekdayLong(keyDate(P.viewKey))];
    if (it.repeat !== 'Once' && !list.includes(it.repeat)) list.push(it.repeat);
    return list;
  });
  const quarterGoals = $derived(
    P.goals.filter((g) => g.quarter === P.quarterOf(P.viewKey) && g.title.trim()).sort((a, b) => a.order - b.order),
  );
  const timeHabits = $derived(
    P.series.filter((s) => s.kind === 'habit' && s.habit?.type === 'time' && (s.until == null || s.until >= P.viewKey)),
  );
  const unfold = () => ({ duration: reducedMotion.current ? 0 : 220, easing: cubicOut });
  const lengthNote = $derived(
    kind === 'buffer'
      ? 'How much time it keeps free.'
      : kind === 'fixed'
        ? 'How long it takes, from its time.'
        : min === 0
          ? 'A check: a box to tick, with no timer. Pick a length to plan it on the timeline.'
          : running
            ? 'On the timeline. Stop the timer to make it a check.'
            : 'On the timeline, with a timer to start, pause and finish.',
  );
  function addStep() {
    if (!newStep.trim()) return;
    steps.push({ id: uid(), t: newStep.trim(), d: false });
    newStep = '';
  }
  // Several pasted lines become several steps: in a step's own field the first line stays in it
  // and the rest follow it.
  function pasteInto(e: ClipboardEvent, i: number | null) {
    const lines = pastedSteps(e);
    if (!lines) return;
    const made = (t: string) => ({ id: uid(), t, d: false });
    if (i == null) {
      steps.push(...lines.map(made));
      newStep = '';
    } else {
      steps[i].t = lines[0] ?? '';
      steps.splice(i + 1, 0, ...lines.slice(1).map(made));
    }
  }

  // A fixed time that wasn't touched stays exactly as it was (a time past midnight keeps its day).
  function fixedAt(): number {
    if (it.fixedAt != null && (!fixedStr || fixedStr === hhmm(it.fixedAt))) return it.fixedAt;
    return fixedStr ? clockToDay(hm(fixedStr), late) : P.day.dayStart;
  }
  const form = $derived.by(() => {
    const k: Kind = timed ? kind : 'check';
    const pending = newStep.trim() ? [{ id: '', t: newStep.trim(), d: false }] : [];
    return {
      title: title.trim(),
      kind: k,
      min: timed ? Math.max(1, min) : 0,
      hue,
      fixedAt: k === 'fixed' ? fixedAt() : null,
      repeat: repeats ? repeat : 'Once',
      note,
      subtasks: [...steps, ...pending].filter((x) => x.t.trim()),
      goalId: k === 'buffer' ? null : goalId,
      habitId: k === 'check' || k === 'buffer' ? null : habitId,
      // Only checks show an icon (in the Checklist); a task keeps the one it had.
      icon: k === 'check' ? icon : (it.icon ?? null),
    };
  });
  const ok = $derived(!!form.title);
  // Only something changed is worth saving.
  const changed = $derived.by(() => {
    const f = form;
    const was = {
      title: it.title,
      kind: it.kind,
      min: it.min,
      hue: it.hue,
      fixedAt: it.kind === 'fixed' ? it.fixedAt : null,
      repeat: it.repeat,
      note: it.note,
      subtasks: it.subtasks,
      goalId: it.goalId ?? null,
      habitId: it.habitId ?? null,
      icon: it.icon ?? null,
    };
    return (
      JSON.stringify({ ...f, subtasks: f.subtasks.map((x) => x.t) }) !==
      JSON.stringify({ ...was, subtasks: was.subtasks.map((x) => x.t) })
    );
  });

  async function save() {
    if (!ok) return;
    const f = form;
    await P.saveTask(id, { ...f, subtasks: f.subtasks.map((x) => (x.id ? x : { ...x, id: uid() })) });
    ondone();
  }
  const enter = (e: KeyboardEvent) => e.key === 'Enter' && !e.isComposing && save();
</script>

<div class="head">
  <span class="h">Edit task</span>
  <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
</div>
<div class="body">
  <input class="name large-text" bind:value={title} onkeydown={enter} placeholder="Task name" aria-label="Task name" />

  <div class="group">
    <KindChips {kind} {hue} onpick={pickKind} />
    {#if kind === 'fixed'}
      <label class="at" transition:slide={unfold()}>
        <span>At</span>
        <input class="time" type="time" aria-label="Fixed time" bind:value={fixedStr} />
      </label>
    {/if}
  </div>

  <div class="group">
    <Fields field="duration" label="Length" none={kind === 'task' && !running} {min} onMin={pickMin} />
    <p class="lnote">{lengthNote}</p>
  </div>

  {#if kind !== 'buffer'}
    <div transition:slide={unfold()}>
      <Fields field="colour" {hue} onHue={(h) => (hue = h)} ringBg="var(--bg)" />
    </div>
  {/if}

  {#if !timed}
    <div transition:slide={unfold()}>
      <IconPicker {title} {icon} {hue} onpick={(n) => (icon = n)} />
    </div>
  {/if}

  <div class="props">
    <SwitchRow
      label="Repeats"
      note={repeats ? "Also changes the other days you haven't started yet" : 'Just this once'}
      on={repeats}
      ontoggle={() => (repeats = !repeats)}
    >
      <div class="row">
        {#each repeatOpts as r (r)}
          <button class="chip" aria-pressed={repeat === r} onclick={() => (repeat = r)}>{r}</button>
        {/each}
      </div>
    </SwitchRow>
    {#if quarterGoals.length && kind !== 'buffer'}
      <SwitchRow
        label="Counts towards a goal"
        note={goalId
          ? `Adds to ${quarterGoals.find((g) => g.id === goalId)?.title ?? 'a goal'}`
          : "Its time adds to one of this quarter's goals"}
        on={!!goalId}
        ontoggle={() => (goalId = goalId ? null : quarterGoals[0].id)}
      >
        <div class="row">
          {#each quarterGoals as g (g.id)}
            <button class="chip" aria-pressed={goalId === g.id} onclick={() => (goalId = g.id)}>{g.title}</button>
          {/each}
        </div>
      </SwitchRow>
    {/if}
    {#if timeHabits.length && timed && kind !== 'buffer'}
      <SwitchRow
        label="Counts towards a habit"
        note={habitId
          ? `Its time adds to ${timeHabits.find((s) => s.id === habitId)?.title ?? 'a habit'}`
          : 'Time spent on it can count towards a time habit'}
        on={!!habitId}
        ontoggle={() => (habitId = habitId ? null : timeHabits[0].id)}
      >
        <div class="row">
          {#each timeHabits as s (s.id)}
            <button class="chip" aria-pressed={habitId === s.id} onclick={() => (habitId = s.id)}>{s.title}</button>
          {/each}
        </div>
      </SwitchRow>
    {/if}
  </div>

  <div class="card">
    <span class="label">Subtasks</span>
    {#each steps as x, i (x.id)}
      <div class="step">
        <span class="n" aria-hidden="true">{i + 1}</span>
        <input class="st" bind:value={x.t} onpaste={(e) => pasteInto(e, i)} aria-label="Subtask {i + 1}" />
        <button class="rm hit" aria-label="Remove subtask: {x.t}" onclick={() => steps.splice(i, 1)}>×</button>
      </div>
    {/each}
    <div class="step">
      <span class="n add" aria-hidden="true">+</span>
      <input
        class="st"
        bind:value={newStep}
        onkeydown={(e) => e.key === 'Enter' && !e.isComposing && addStep()}
        onpaste={(e) => pasteInto(e, null)}
        placeholder="Add a subtask"
        aria-label="Add a subtask"
      />
    </div>
  </div>

  <div class="card">
    <span class="label">Notes</span>
    <textarea rows="3" placeholder="Anything to remember" aria-label="Notes" bind:value={note}></textarea>
  </div>
</div>
<div class="foot">
  <button class="cancel" onclick={ondone}>Cancel</button>
  <button class="save" class:ok={ok && changed} disabled={!ok || !changed} onclick={save}>Update task</button>
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
  .time {
    height: 40px;
    padding: 0 8px;
    border-radius: var(--r-ctl);
    border: none;
    background: var(--sunk);
    color: var(--text);
    font: 400 14px/1 var(--font);
  }
  .props,
  .card {
    border: 1px solid var(--border);
    border-radius: var(--r-card);
    background: var(--raised);
  }
  .props {
    overflow: hidden;
  }
  .card {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .card .label {
    padding-bottom: 4px;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    border-top: 1px solid var(--border);
  }
  .step:first-of-type {
    border-top: none;
  }
  .n {
    width: 20px;
    height: 20px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    background: var(--sunk);
    color: var(--muted);
    font: 500 11px/1 var(--font);
    font-variant-numeric: tabular-nums;
  }
  .n.add {
    background: transparent;
    border: 1px dashed var(--line);
    box-sizing: border-box;
  }
  .st {
    flex: 1;
    min-width: 0;
    height: 40px;
    border: none;
    outline: none;
    background: transparent;
    padding: 0;
    font: 400 15px/1 var(--font);
    color: var(--text);
  }
  .rm {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--faint);
    font: 400 18px/1 var(--font);
    cursor: pointer;
  }
  textarea {
    border: none;
    outline: none;
    resize: vertical;
    background: transparent;
    font: 400 15px/1.45 var(--font);
    color: var(--text);
    padding: 0;
  }
  .foot {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 20px calc(26px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
  }
  :global(.keyboard-open) .foot {
    padding-bottom: 12px;
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
  .save {
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
  .save.ok {
    background: var(--text);
    color: var(--bg);
    font-weight: 500;
    cursor: pointer;
  }
</style>
