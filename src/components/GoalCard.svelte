<script lang="ts">
  import { untrack } from 'svelte';
  import { uid } from '../lib/actions';
  import { planner as P } from '../lib/planner.svelte';
  import { dL } from '../lib/time';
  import type { Goal } from '../lib/types';
  import DisarmBar from './DisarmBar.svelte';
  import SaveRow from './SaveRow.svelte';

  // One goal: what it is and why, how far it has got (its number, its milestones, the time and
  // habit days that count towards it), and editing it in place. Edits are a draft until Add goal
  // or Update goal; a new goal (`onclose` given) isn't stored until then.
  let { goal, onclose }: { goal: Goal; onclose?: () => void } = $props();

  type Draft = Pick<Goal, 'title' | 'why' | 'target' | 'milestones'>;
  const copy = (g: Goal): Draft => ({
    title: g.title,
    why: g.why,
    target: g.target && { ...g.target },
    milestones: g.milestones.map((m) => ({ ...m })),
  });

  const isNew = $derived(!!onclose);
  let editing = $state(untrack(() => !!onclose));
  let draft = $state<Draft>(untrack(() => copy(goal)));
  let newStep = $state('');
  const p = $derived(P.progressOf(goal));
  const STATUS = { open: '', hit: 'Hit', partly: 'Partly', missed: 'Missed' } as const;
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const num = (v: unknown) => (v === '' || v == null || !Number.isFinite(+v) ? 0 : +v);

  /** The draft as it would be kept: a milestone still in the field counts, empty ones go. */
  const result = $derived<Draft>({
    title: draft.title.trim(),
    why: draft.why.trim(),
    target: draft.target && {
      now: num(draft.target.now),
      goal: num(draft.target.goal) || 1,
      unit: draft.target.unit.trim(),
    },
    milestones: [
      ...draft.milestones.map((m) => ({ ...m, t: m.t.trim() })).filter((m) => m.t),
      ...(newStep.trim() ? [{ id: '', t: newStep.trim(), done: false }] : []),
    ],
  });
  const changed = $derived(isNew || JSON.stringify(result) !== JSON.stringify(copy(goal)));
  const ok = $derived(!!result.title && changed);

  function edit() {
    draft = copy(goal);
    newStep = '';
    editing = true;
  }
  function addStep() {
    const t = newStep.trim();
    if (!t) return;
    draft.milestones.push({ id: uid(), t, done: false });
    newStep = '';
  }
  function cancel() {
    if (isNew) onclose?.();
    else editing = false;
  }
  function save() {
    if (!ok) return;
    const d: Draft = {
      ...result,
      milestones: result.milestones.map((m) => ({ ...m, id: m.id || uid() })),
    };
    if (isNew) {
      P.addGoal({ quarter: goal.quarter, ...d });
      onclose?.();
    } else {
      P.editGoal(goal.id, d);
      P.say(`Updated ${d.title}`);
      editing = false;
    }
  }

  // The number on the card, updated with its own Save.
  let nowText = $state<string | null>(null);
  const nowChanged = $derived(nowText != null && nowText !== '' && num(nowText) !== goal.target?.now);
  function saveNow() {
    if (nowChanged && goal.target) P.editGoal(goal.id, { target: { ...goal.target, now: num(nowText) } });
    nowText = null;
  }
</script>

<section class="goal" class:editing>
  {#if editing}
    <input
      class="title-in large-text"
      bind:value={draft.title}
      placeholder="What do you want to achieve?"
      aria-label="Goal"
      {@attach (el) => {
        if (!untrack(() => draft.title)) el.focus();
      }}
    />
    <textarea rows="2" placeholder="Why it matters" aria-label="Why it matters" bind:value={draft.why}></textarea>

    <div class="part">
      <label class="sw">
        <input
          type="checkbox"
          checked={!!draft.target}
          onchange={(e) =>
            (draft.target = e.currentTarget.checked ? (copy(goal).target ?? { now: 0, goal: 100, unit: '' }) : null)}
        />
        <span>A number to reach</span>
      </label>
      {#if draft.target}
        <div class="nums">
          <label>Now <input type="number" inputmode="decimal" bind:value={draft.target.now} /></label>
          <label>Goal <input type="number" inputmode="decimal" bind:value={draft.target.goal} /></label>
          <label>Unit <input class="unit" placeholder="$, users" bind:value={draft.target.unit} /></label>
        </div>
      {/if}
    </div>

    <div class="part">
      <span class="lbl">Milestones</span>
      {#each draft.milestones as m, i (m.id)}
        <div class="step">
          <input bind:value={m.t} aria-label="Milestone" />
          <button class="rm" aria-label="Remove {m.t}" onclick={() => draft.milestones.splice(i, 1)}>×</button>
        </div>
      {/each}
      <input
        class="newstep"
        bind:value={newStep}
        placeholder="Add a milestone"
        aria-label="Add a milestone"
        onkeydown={(e) => e.key === 'Enter' && !e.isComposing && addStep()}
      />
    </div>

    <div class="foot">
      {#if !isNew && P.armed('goal', goal.id)}
        <span class="confirm">
          Delete this goal?
          <button class="btn-yes" onclick={() => P.removeGoal(goal.id)} {@attach (el) => el.focus()}>Delete</button>
          <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
          <DisarmBar />
        </span>
      {:else}
        {#if !isNew}<button class="del" onclick={() => P.arm('goal', goal.id)}>Delete goal</button>{/if}
        <SaveRow label={isNew ? 'Add goal' : 'Update goal'} {ok} onsave={save} oncancel={cancel} />
      {/if}
    </div>
  {:else}
    <div class="top">
      <button class="title" onclick={edit}>{goal.title || 'Untitled goal'}</button>
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
              value={nowText ?? goal.target.now}
              oninput={(e) => (nowText = e.currentTarget.value)}
              onkeydown={(e) => e.key === 'Enter' && !e.isComposing && saveNow()}
            /></label
          >
        </div>
        {#if nowText != null}
          <SaveRow ok={nowChanged} onsave={saveNow} oncancel={() => (nowText = null)} />
        {/if}
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
    border-radius: var(--r-card);
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
    padding: 5px 8px;
    border-radius: var(--r-sm);
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
    background: linear-gradient(90deg, var(--rainbow-stops));
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
    border-radius: var(--r-ctl);
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
  /* Like New task's name field. `input.` outranks the field rule above, which otherwise made it
     small, and its 15px text made iOS zoom in (large-text is left out of the 16px rule). */
  input.title-in {
    height: 54px;
    padding: 0 16px;
    font-size: 17px;
  }
  input.title-in:focus {
    outline: none;
    border: 1.5px solid var(--text);
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
    border-radius: var(--r-sm);
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
  .foot > :global(.saverow) {
    margin-left: auto;
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
