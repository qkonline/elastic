<script lang="ts">
  import { untrack } from 'svelte';
  import { habitMet, habitValue, isHabit, progressText } from '../lib/habits';
  import { planner as P } from '../lib/planner.svelte';
  import { worked } from '../lib/schedule';
  import { dL } from '../lib/time';
  import DisarmBar from './DisarmBar.svelte';
  import Fields from './Fields.svelte';
  import HabitFields, { oftenText } from './HabitFields.svelte';
  import HabitHistory from './HabitHistory.svelte';
  import HabitRing from './HabitRing.svelte';
  import KindMark from './KindMark.svelte';
  import SwitchRow from './SwitchRow.svelte';

  // A habit's sheet: today's progress, its record, and its settings. Settings changes reach later
  // days like any repeating task's; deleting asks about later days too.
  let { id: idProp }: { id: string } = $props();
  const id = untrack(() => idProp);

  const it = $derived.by(() => {
    const x = P.item(id);
    return x && isHabit(x) ? x : null;
  });
  $effect(() => {
    if (!it) P.closeSheet();
  });
  const h = $derived(it?.habit);
  const series = $derived(it?.seriesId ? P.series.find((s) => s.id === it.seriesId) : undefined);
  const value = $derived(it ? habitValue(P.day, it, P.n) : 0);
  const met = $derived(it ? habitMet(P.day, it, P.n) : false);
  const slipped = $derived(h?.type === 'quit' && !!it?.progress);
  const sofar = $derived(it ? progressText(P.day, it, P.n) : '');
  // Timed tasks today that count towards a time habit.
  const linked = $derived(
    it?.seriesId && h?.type === 'time' ? P.day.items.filter((i) => i.habitId === it.seriesId) : [],
  );
  const fromTasks = $derived(linked.reduce((sum, i) => sum + worked(i, P.n), 0));
  const delArmed = $derived(P.armed('delete', id));
  const repeatsLater = $derived(!!series && (series.until == null || series.until > P.viewKey));
  const waits = $derived(P.waiting);
  const quarterGoals = $derived(
    P.goals.filter((g) => g.quarter === P.quarterOf(P.viewKey) && g.title.trim()).sort((a, b) => a.order - b.order),
  );
</script>

{#if it && h}
  <div class="head">
    <span class="icon" aria-hidden="true"><KindMark kind="habit" hue={it.hue} size={16} /></span>
    <div class="ht">
      <span class="summary">Habit, {oftenText(h, it.repeat).toLowerCase()}</span>
      <input
        class="title large-text"
        value={it.title}
        readonly={P.locked}
        aria-label="Title"
        oninput={(e) => P.edit(id, { title: e.currentTarget.value })}
        onblur={(e) => !e.currentTarget.value.trim() && P.edit(id, { title: 'Untitled' })}
      />
    </div>
    <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
  </div>

  <div class="body">
    <fieldset class="fields" disabled={P.locked}>
      <div class="card today">
        <HabitRing
          hue={it.hue}
          {value}
          target={h.type === 'check' || h.type === 'quit' ? 1 : h.target}
          segments={h.type === 'amount' && h.target <= 12}
          met={h.type === 'quit' ? !slipped : met}
          {slipped}
          size={56}
        />
        <div class="tt">
          <span class="state">
            {#if it.status === 'skipped'}
              Skipped {P.isToday ? 'today' : 'this day'}
            {:else if h.type === 'quit'}
              {slipped ? 'Slipped' : 'Clean so far'}
            {:else if h.type === 'check'}
              {met ? 'Done' : 'Not done yet'}
            {:else}
              {sofar}
            {/if}
          </span>
          {#if h.type === 'time' && fromTasks >= 1}
            <span class="sub">{dL(Math.floor(fromTasks))} from timed tasks, {it.progress ?? 0} min added by hand</span>
          {:else if waits && it.status !== 'skipped'}
            <span class="sub">You can tick it off once your day starts.</span>
          {/if}
          {#if it.status !== 'skipped'}
            <div class="ctls">
              {#if h.type === 'check'}
                <button class="pill" class:pri={!met} disabled={waits && !met} onclick={() => P.tapHabit(id)}
                  >{met ? 'Undo' : 'Mark done'}</button
                >
              {:else if h.type === 'quit'}
                <button class="pill" disabled={waits && !slipped} onclick={() => P.tapHabit(id)}
                  >{slipped ? 'Take back the slip' : 'Mark a slip'}</button
                >
              {:else}
                {@const step = h.type === 'time' ? 5 : 1}
                <button
                  class="pill sq"
                  aria-label="Take {step} away"
                  disabled={waits || !(it.progress ?? 0)}
                  onclick={() => P.setHabitProgress(id, (it.progress ?? 0) - step)}>−</button
                >
                <button class="pill pri" disabled={waits} onclick={() => P.tapHabit(id, step)}
                  >+ {step}{h.type === 'time' ? ' min' : ''}</button
                >
              {/if}
            </div>
          {/if}
        </div>
      </div>

      {#if series}
        <div class="card">
          <HabitHistory {series} hue={it.hue} />
        </div>
      {/if}

      <div class="card">
        <Fields field="colour" hue={it.hue} onHue={(c) => P.edit(id, { hue: c })} />
        <HabitFields habit={h} repeat={it.repeat} typeLocked onchange={(nh, r) => P.editHabit(id, nh, r)} />
        {#if quarterGoals.length}
          <div class="props">
            <SwitchRow
              label="Counts towards a goal"
              note={it.goalId
                ? `Each day it's kept adds to ${quarterGoals.find((g) => g.id === it.goalId)?.title ?? 'a goal'}`
                : "Days it's kept add to one of this quarter's goals"}
              on={!!it.goalId}
              ontoggle={() => P.edit(id, { goalId: it.goalId ? null : quarterGoals[0].id })}
            >
              <div class="row">
                {#each quarterGoals as g (g.id)}
                  <button class="chip" aria-pressed={it.goalId === g.id} onclick={() => P.edit(id, { goalId: g.id })}
                    >{g.title}</button
                  >
                {/each}
              </div>
            </SwitchRow>
          </div>
        {/if}
      </div>

      <div class="card notes">
        <span class="label">Notes</span>
        <textarea
          rows="3"
          placeholder={P.locked ? '' : 'Why it matters, or what helps'}
          aria-label="Notes"
          value={it.note}
          oninput={(e) => P.edit(id, { note: e.currentTarget.value })}></textarea>
      </div>
    </fieldset>
  </div>

  <div class="foot">
    {#if P.locked}
      <p class="ended">{P.lockedText}</p>
    {:else if delArmed}
      <div class="confirm" class:choice={repeatsLater} role="group" aria-label="Confirm delete">
        {#if repeatsLater}
          <span class="q"
            >Delete it just for {P.isToday ? 'today' : 'this day'}, or stop the habit for later days too?</span
          >
          <button class="btn-yes" onclick={() => P.remove(id)} {@attach (el) => el.focus()}
            >{P.isToday ? 'Just today' : 'Just this day'}</button
          >
          <button class="btn-yes" onclick={() => P.removeWithLater(id)}>Later days too</button>
        {:else}
          <span class="q">Delete this habit?</span>
          <button class="btn-yes" onclick={() => P.remove(id)} {@attach (el) => el.focus()}>Delete</button>
        {/if}
        <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
        <DisarmBar />
      </div>
    {:else}
      <button class="trash" aria-label="Delete {it.title}" onclick={() => P.arm('delete', id)}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
          ><path
            d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12.2A1.5 1.5 0 0 0 8.5 20.5h7a1.5 1.5 0 0 0 1.5-1.3L18 7M10 11v5.5M14 11v5.5"
          /></svg
        >
      </button>
      {#if it.status === 'skipped'}
        <button class="ctl" onclick={() => P.restore(id)}>Restore</button>
      {:else}
        <button class="ctl" onclick={() => P.skip(id)}>{P.isToday ? 'Skip today' : 'Skip this day'}</button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
  }
  .icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--raised);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    box-sizing: border-box;
  }
  .ht {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .summary {
    font: 400 12px/1 var(--font);
    color: var(--muted);
  }
  .title {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    padding: 4px 0;
    font: 400 21px/1.2 var(--font);
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .body > :global(*),
  .fields > :global(*) {
    flex-shrink: 0;
  }
  .fields {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .fields:disabled :global(button) {
    cursor: default;
  }
  .card {
    padding: 16px;
    border-radius: 16px;
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .card.today {
    flex-direction: row;
    align-items: center;
    gap: 16px;
  }
  .tt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .state {
    font: 400 17px/1.3 var(--font);
  }
  .sub {
    font: 400 13px/1.4 var(--font);
    color: var(--muted);
  }
  .ctls {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
  .pill {
    height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .pill.sq {
    width: 44px;
    padding: 0;
    font: 300 20px/1 var(--font);
  }
  .pill.pri {
    border-color: var(--text);
    background: var(--text);
    color: var(--bg);
  }
  .pill:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .card.notes {
    gap: 8px;
  }
  .props {
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
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
    gap: 10px;
    padding: 14px 16px calc(28px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  .foot .ctl {
    height: 50px;
    font-size: 15px;
  }
  .ended {
    flex: 1;
    margin: 0;
    padding: 6px 2px;
    font: 400 14px/1.45 var(--font);
    color: var(--muted);
  }
  .confirm {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.4);
    position: relative;
    overflow: hidden;
  }
  .q {
    flex: 1 1 160px;
    font: 400 14px/1.4 var(--font);
  }
  .choice .q {
    flex-basis: 100%;
  }
  .trash {
    width: 50px;
    height: 50px;
    flex: none;
    border-radius: 12px;
    border: none;
    background: rgba(248, 113, 113, 0.12);
    color: var(--redT);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .trash svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
