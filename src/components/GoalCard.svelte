<script lang="ts">
  import { untrack } from 'svelte';
  import { uid } from '../lib/actions';
  import { planner as P } from '../lib/planner.svelte';
  import { dL } from '../lib/time';
  import type { Goal } from '../lib/types';
  import DisarmBar from './DisarmBar.svelte';

  // One goal: what it is and why, how far it has got (its number, its milestones, the time and
  // habit days that count towards it), and editing it in place.
  let { goal, startEditing = false }: { goal: Goal; startEditing?: boolean } = $props();

  let editing = $state(untrack(() => startEditing));
  const p = $derived(P.progressOf(goal));
  const STATUS = { open: '', hit: 'Hit', partly: 'Partly', missed: 'Missed' } as const;
  let newStep = $state('');
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

  function addStep() {
    const t = newStep.trim();
    if (!t) return;
    P.editGoal(goal.id, { milestones: [...goal.milestones, { id: uid(), t, done: false }] });
    newStep = '';
  }
  const setTarget = (patch: Partial<NonNullable<Goal['target']>>) =>
    P.editGoal(goal.id, { target: { now: 0, goal: 100, unit: '', ...(goal.target ?? {}), ...patch } });
  const num = (v: string) => (Number.isFinite(+v) ? +v : 0);
</script>

<section class="goal" class:editing>
  {#if editing}
    <input
      class="title-in large-text"
      value={goal.title}
      placeholder="What do you want to achieve?"
      aria-label="Goal"
      {@attach (el) => {
        if (!goal.title) el.focus();
      }}
      oninput={(e) => P.editGoal(goal.id, { title: e.currentTarget.value })}
    />
    <textarea
      rows="2"
      placeholder="Why it matters"
      aria-label="Why it matters"
      value={goal.why}
      oninput={(e) => P.editGoal(goal.id, { why: e.currentTarget.value })}></textarea>

    <div class="part">
      <label class="sw">
        <input
          type="checkbox"
          checked={!!goal.target}
          onchange={(e) =>
            P.editGoal(goal.id, { target: e.currentTarget.checked ? { now: 0, goal: 100, unit: '' } : null })}
        />
        <span>A number to reach</span>
      </label>
      {#if goal.target}
        <div class="nums">
          <label
            >Now <input
              type="number"
              inputmode="decimal"
              value={goal.target.now}
              onchange={(e) => setTarget({ now: num(e.currentTarget.value) })}
            /></label
          >
          <label
            >Goal <input
              type="number"
              inputmode="decimal"
              value={goal.target.goal}
              onchange={(e) => setTarget({ goal: num(e.currentTarget.value) || 1 })}
            /></label
          >
          <label
            >Unit <input
              class="unit"
              placeholder="$, users"
              value={goal.target.unit}
              onchange={(e) => setTarget({ unit: e.currentTarget.value.trim() })}
            /></label
          >
        </div>
      {/if}
    </div>

    <div class="part">
      <span class="lbl">Milestones</span>
      {#each goal.milestones as m (m.id)}
        <div class="step">
          <input
            value={m.t}
            aria-label="Milestone"
            onchange={(e) =>
              P.editGoal(goal.id, {
                milestones: goal.milestones.map((x) => (x.id === m.id ? { ...x, t: e.currentTarget.value } : x)),
              })}
          />
          <button
            class="rm"
            aria-label="Remove {m.t}"
            onclick={() => P.editGoal(goal.id, { milestones: goal.milestones.filter((x) => x.id !== m.id) })}>×</button
          >
        </div>
      {/each}
      <input
        class="newstep"
        bind:value={newStep}
        placeholder="Add a milestone"
        aria-label="Add a milestone"
        onkeydown={(e) => e.key === 'Enter' && !e.isComposing && addStep()}
        onblur={addStep}
      />
    </div>

    <div class="foot">
      {#if P.armed('goal', goal.id)}
        <span class="confirm">
          Delete this goal?
          <button class="btn-yes" onclick={() => P.removeGoal(goal.id)} {@attach (el) => el.focus()}>Delete</button>
          <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
          <DisarmBar />
        </span>
      {:else}
        <button class="del" onclick={() => P.arm('goal', goal.id)}>Delete goal</button>
        <button class="done" onclick={() => (editing = false)} disabled={!goal.title.trim()}>Done</button>
      {/if}
    </div>
  {:else}
    <div class="top">
      <button class="title" onclick={() => (editing = true)}>{goal.title || 'Untitled goal'}</button>
      {#if goal.status !== 'open'}<span class="status {goal.status}">{STATUS[goal.status]}</span>{/if}
    </div>
    {#if goal.why}<p class="why">{goal.why}</p>{/if}

    {#if goal.target}
      <div class="target">
        <div class="bar"><span style:width="{(p.share ?? 0) * 100}%"></span></div>
        <div class="tline">
          <span>{fmt(goal.target.now)} of {fmt(goal.target.goal)}{goal.target.unit ? ' ' + goal.target.unit : ''}</span>
          <label class="upd"
            >Update <input
              type="number"
              inputmode="decimal"
              aria-label="Where it is now"
              value={goal.target.now}
              onchange={(e) => setTarget({ now: num(e.currentTarget.value) })}
            /></label
          >
        </div>
      </div>
    {/if}

    {#if goal.milestones.length}
      <ul class="ms">
        {#each goal.milestones as m (m.id)}
          <li class:done={m.done}>
            <button
              class="box"
              role="checkbox"
              aria-checked={m.done}
              aria-label={m.t}
              onclick={() => P.toggleMilestone(goal.id, m.id)}>{m.done ? '✓' : ''}</button
            >
            <span>{m.t}</span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if p.minutes >= 1 || p.habitDays}
      <p class="linked">
        {#if p.minutes >= 1}<span>{dL(Math.round(p.minutes))} on its tasks</span>{/if}
        {#if p.habitDays}<span>{p.habitDays} habit {p.habitDays === 1 ? 'day' : 'days'}</span>{/if}
      </p>
    {:else if !goal.target && !goal.milestones.length}
      <p class="hint">Give it a number or milestones, or link tasks and habits to it from their sheets.</p>
    {/if}
  {/if}
</section>

<style>
  .goal {
    padding: 16px;
    border-radius: 16px;
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .top {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .title {
    all: unset;
    flex: 1;
    font: 400 17px/1.3 var(--font);
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .title:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .status {
    font: 400 12px/1 var(--font);
    padding: 5px 9px;
    border-radius: 99px;
    background: var(--sunk);
    color: var(--muted);
  }
  .status.hit {
    color: var(--grT);
    background: color-mix(in oklab, var(--grT) 14%, transparent);
  }
  .status.missed {
    color: var(--redT);
    background: color-mix(in oklab, var(--redT) 12%, transparent);
  }
  .why,
  .hint {
    margin: 0;
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
  }
  .target {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--sunk);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, #fb923c, #fde047, #a3e635, #22d3ee, #818cf8);
    transition: width 300ms ease-out;
  }
  .tline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font: 400 14px/1.3 var(--font);
  }
  .upd {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 400 12px/1 var(--font);
    color: var(--muted);
  }
  .upd input {
    width: 84px;
  }
  input:not([type='checkbox']),
  textarea {
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
    font: 400 15px/1.3 var(--font);
    box-sizing: border-box;
    min-width: 0;
  }
  textarea {
    height: auto;
    padding: 8px 10px;
    resize: vertical;
  }
  .title-in {
    height: 44px;
    font-size: 18px;
  }
  .ms {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .ms li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    font: 400 14px/1.3 var(--font);
  }
  .ms li.done span {
    color: var(--muted);
    text-decoration: line-through;
  }
  .box {
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 7px;
    border: 1.5px solid var(--line);
    background: transparent;
    color: var(--bg);
    font: 400 12px/1 var(--font);
    padding: 0;
    cursor: pointer;
  }
  .done .box,
  li.done .box {
    background: var(--text);
    border-color: var(--text);
  }
  .linked {
    margin: 0;
    display: flex;
    gap: 14px;
    font: 400 12px/1.4 var(--font);
    color: var(--muted);
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  .sw {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    font: 400 14px/1 var(--font);
  }
  .sw input {
    width: 18px;
    height: 18px;
  }
  .nums {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
  }
  .nums label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font: 400 12px/1 var(--font);
    color: var(--muted);
  }
  .lbl {
    font: 400 13px/1 var(--font);
    color: var(--muted);
  }
  .step {
    display: flex;
    gap: 6px;
  }
  .step input {
    flex: 1;
  }
  .rm {
    width: 38px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 18px/1 var(--font);
    cursor: pointer;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  .del {
    height: 40px;
    border: none;
    background: transparent;
    color: var(--redT);
    font: 400 13px/1 var(--font);
    cursor: pointer;
    padding: 0;
  }
  .foot .done {
    height: 40px;
    padding: 0 18px;
    border-radius: 10px;
    border: none;
    background: var(--text);
    color: var(--bg);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .foot .done:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .confirm {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font: 400 14px/1.3 var(--font);
    position: relative;
    overflow: hidden;
    padding-bottom: 8px;
  }
</style>
