<script lang="ts">
  import { untrack } from 'svelte';
  import { habitMet, habitValue, isHabit, progressText } from '../lib/habits';
  import { planner as P } from '../lib/planner.svelte';
  import { worked } from '../lib/schedule';
  import { dL, fT } from '../lib/time';
  import { hueColor, hueName } from '../lib/types';
  import DisarmBar from './DisarmBar.svelte';
  import HabitEdit from './HabitEdit.svelte';
  import { oftenText } from './HabitFields.svelte';
  import HabitHistory from './HabitHistory.svelte';
  import HabitRing from './HabitRing.svelte';
  import KindMark from './KindMark.svelte';

  // A habit's sheet: today's progress, its record, and what it's set to. Changing it happens
  // behind Edit habit (changes reach later days like any repeating task's); deleting asks about
  // later days too.
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
  const goal = $derived(it?.goalId ? P.goals.find((g) => g.id === it.goalId) : undefined);
  // How much it asks for each time, in words.
  const asks = $derived(
    !h
      ? ''
      : h.type === 'amount'
        ? `${h.target} ${h.unit}`.trim()
        : h.type === 'time'
          ? dL(h.target)
          : h.type === 'quit'
            ? 'Stay clear of it'
            : 'Done or not',
  );
  let editing = $state(false);
  $effect(() => {
    if (P.locked) editing = false;
  });
</script>

{#if it && h && editing}
  <HabitEdit item={{ ...it, habit: h }} ondone={() => (editing = false)} />
{:else if it && h}
  <div class="head">
    <span class="icon" aria-hidden="true"><KindMark kind="habit" hue={it.hue} size={16} /></span>
    <div class="ht">
      <span class="summary">Habit, {oftenText(h, it.repeat).toLowerCase()}</span>
      <h2 class="title">{it.title}</h2>
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
            <span class="sub">You can mark it done once your day starts.</span>
          {/if}
          <div class="ctls">
            {#if it.status === 'skipped'}
              <button class="pill" onclick={() => P.restore(id)}>Restore</button>
            {:else}
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
              <button class="pill quiet" onclick={() => P.skip(id)}>{P.isToday ? 'Skip today' : 'Skip this day'}</button
              >
            {/if}
          </div>
        </div>
      </div>

      {#if series}
        <div class="card">
          <HabitHistory {series} hue={it.hue} />
        </div>
      {/if}

      <dl class="card facts">
        <div>
          <dt>Colour</dt>
          <dd><i class="sw" style:background={hueColor(it.hue)}></i>{hueName(it.hue)}</dd>
        </div>
        <div>
          <dt>Asks for</dt>
          <dd>{asks}</dd>
        </div>
        <div>
          <dt>How often</dt>
          <dd>{oftenText(h, it.repeat)}</dd>
        </div>
        <div>
          <dt>Reminder</dt>
          <dd>{h.remindAt != null ? fT(h.remindAt, P.settings.clock24) : 'Off'}</dd>
        </div>
        {#if goal}
          <div>
            <dt>Goal</dt>
            <dd>{goal.title}</dd>
          </div>
        {/if}
      </dl>

      {#if it.note.trim()}
        <div class="card notes">
          <span class="label">Notes</span>
          <p class="note">{it.note}</p>
        </div>
      {/if}
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
      <button class="edit" onclick={() => (editing = true)}>
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"
          ><path
            d="M12.6 4.2l3.2 3.2M3.5 16.5l.8-3.9 9.4-9.4a1.6 1.6 0 0 1 2.3 0l.8.8a1.6 1.6 0 0 1 0 2.3l-9.4 9.4z"
          /></svg
        >
        Edit habit
      </button>
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
    border-radius: var(--r-card);
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
    margin: 0;
    padding: 2px 0;
    font: 600 21px/1.2 var(--font);
    letter-spacing: -0.01em;
    color: var(--text);
    overflow-wrap: anywhere;
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
    border-radius: var(--r-card);
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
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .pill.sq {
    width: 44px;
    padding: 0;
    font: 400 20px/1 var(--font);
  }
  .pill.pri {
    border-color: var(--text);
    background: var(--text);
    color: var(--bg);
  }
  .pill.quiet {
    margin-left: auto;
    border-color: transparent;
    background: transparent;
    color: var(--muted);
    padding: 0 8px;
  }
  .pill:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .card.notes {
    gap: 8px;
  }
  .note {
    margin: 0;
    font: 400 15px/1.5 var(--font);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* What it's set to: a quiet list, label on the left, value on the right. */
  .facts {
    margin: 0;
    padding: 4px 16px;
    gap: 0;
  }
  .facts > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 46px;
    border-top: 1px solid var(--border);
  }
  .facts > div:first-child {
    border-top: none;
  }
  dt {
    font: 400 14px/1.3 var(--font);
    color: var(--muted);
  }
  dd {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font: 500 14px/1.3 var(--font);
    text-align: right;
  }
  .sw {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
  /* Edit habit: the ink key, pressing down onto its edge. */
  .edit {
    flex: 1;
    height: 50px;
    border: none;
    border-radius: var(--r-ctl);
    background: var(--text);
    color: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font: 500 15px/1 var(--font);
    cursor: pointer;
    box-shadow: 0 3px 0 color-mix(in oklab, var(--text) 60%, #000);
    transition:
      translate 90ms ease,
      box-shadow 90ms ease;
  }
  .edit:active {
    translate: 0 3px !important;
    scale: none !important;
    filter: none !important;
    box-shadow: 0 0 0 color-mix(in oklab, var(--text) 60%, #000);
  }
  .edit svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .foot {
    flex: none;
    display: flex;
    gap: 10px;
    padding: 14px 16px calc(28px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    background: var(--bg);
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
    border-radius: var(--r-card);
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
    border-radius: var(--r-ctl);
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
