<script lang="ts">
  import { untrack } from 'svelte';
  import { planner as P } from '../lib/planner.svelte';
  import type { Habit, Item } from '../lib/types';
  import Fields from './Fields.svelte';
  import HabitFields from './HabitFields.svelte';
  import SwitchRow from './SwitchRow.svelte';

  // A habit's Edit form: its name, colour, how much and how often, reminder, goal and notes.
  // Nothing changes until Update habit; Cancel goes back to the habit as it was.
  let { item, ondone }: { item: Item & { habit: Habit }; ondone: () => void } = $props();
  const it = untrack(() => item);
  const id = it.id;

  let title = $state(it.title);
  let hue = $state(it.hue);
  let habit = $state<Habit>({ ...it.habit });
  let repeat = $state(it.repeat);
  let goalId = $state(it.goalId ?? null);
  let note = $state(it.note);
  const quarterGoals = $derived(
    P.goals.filter((g) => g.quarter === P.quarterOf(P.viewKey) && g.title.trim()).sort((a, b) => a.order - b.order),
  );

  const patch = $derived.by(() => {
    const next = { title: title.trim(), hue, habit, repeat, goalId, note };
    const was = {
      title: it.title,
      hue: it.hue,
      habit: it.habit,
      repeat: it.repeat,
      goalId: it.goalId ?? null,
      note: it.note,
    };
    const out: Partial<Item> = {};
    for (const k of Object.keys(next) as (keyof typeof next)[])
      if (JSON.stringify(next[k]) !== JSON.stringify(was[k])) Object.assign(out, { [k]: next[k] });
    return out;
  });
  const ok = $derived(!!title.trim());
  const changed = $derived(Object.keys(patch).length > 0);

  function save() {
    if (!ok || !changed) return;
    P.edit(id, $state.snapshot(patch) as Partial<Item>);
    P.say(`Updated ${title.trim()}`);
    ondone();
  }
  const enter = (e: KeyboardEvent) => e.key === 'Enter' && !e.isComposing && save();
</script>

<div class="head">
  <span class="h">Edit habit</span>
  <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
</div>
<div class="body">
  <input
    class="name large-text"
    bind:value={title}
    onkeydown={enter}
    placeholder="Habit name"
    aria-label="Habit name"
  />
  <Fields field="colour" {hue} onHue={(h) => (hue = h)} ringBg="var(--bg)" />
  <HabitFields
    {habit}
    {repeat}
    typeLocked
    onchange={(h, r) => {
      habit = h;
      repeat = r;
    }}
  />
  {#if quarterGoals.length}
    <div class="props">
      <SwitchRow
        label="Counts towards a goal"
        note={goalId
          ? `Each day it's kept adds to ${quarterGoals.find((g) => g.id === goalId)?.title ?? 'a goal'}`
          : "Days it's kept add to one of this quarter's goals"}
        on={!!goalId}
        ontoggle={() => (goalId = goalId ? null : quarterGoals[0].id)}
      >
        <div class="row">
          {#each quarterGoals as g (g.id)}
            <button class="chip" aria-pressed={goalId === g.id} onclick={() => (goalId = g.id)}>{g.title}</button>
          {/each}
        </div>
      </SwitchRow>
    </div>
  {/if}
  <div class="card">
    <span class="label">Notes</span>
    <textarea rows="3" placeholder="Why it matters, or what helps" aria-label="Notes" bind:value={note}></textarea>
  </div>
</div>
<div class="foot">
  <button class="cancel" onclick={ondone}>Cancel</button>
  <button class="save" class:ok={ok && changed} disabled={!ok || !changed} onclick={save}>Update habit</button>
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
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
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
    gap: 8px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
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
