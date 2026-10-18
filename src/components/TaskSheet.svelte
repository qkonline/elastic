<script lang="ts">
  import { untrack } from 'svelte';
  import { planner as P } from '../lib/planner.svelte';
  import { itemVM, RUN } from '../lib/rows';
  import { clockToDay, dL, hhmm, hm, keyDate, weekdayLong } from '../lib/time';
  import DisarmBar from './DisarmBar.svelte';
  import type { Kind } from '../lib/types';
  import Fields from './Fields.svelte';
  import KindChips from './KindChips.svelte';
  import KindMark from './KindMark.svelte';
  import FinishChooser from './FinishChooser.svelte';
  import PostponeChooser from './PostponeChooser.svelte';
  import RetimeTask from './RetimeTask.svelte';
  import StepBox from './StepBox.svelte';
  import SwitchRow from './SwitchRow.svelte';
  let { id: idProp }: { id: string } = $props();
  // The sheet is keyed by task, so the id never changes while it's open. Keep a copy: blur
  // handlers still run while the sheet is being removed, after the sheet state is cleared.
  const id = untrack(() => idProp);

  const row = $derived(P.sch.rows.find((r) => r.it.id === id));
  const v = $derived(
    row
      ? itemVM(row, {
          day: P.day,
          rows: P.sch.rows,
          n: P.n,
          isToday: P.isToday,
          showTimes: true,
          clock24: P.settings.clock24,
        })
      : null,
  );
  const it = $derived(v?.it);
  const postponeArmed = $derived(P.armed('postpone', id));
  const finishArmed = $derived(P.armed('finish', id));
  // Done, or set aside part-way: its times are on the record and can be corrected.
  const logged = $derived(
    !!it && it.startedAt != null && (it.status === 'done' || (it.status === 'postponed' && !v?.active)),
  );
  const delArmed = $derived(P.armed('delete', id));

  const repeatOpts = $derived.by(() => {
    const list = ['Every day', 'Weekdays', 'Every ' + weekdayLong(keyDate(P.viewKey))];
    if (it && it.repeat !== 'Once' && !list.includes(it.repeat)) list.push(it.repeat);
    return list;
  });
  const repeating = $derived(!!it && it.repeat !== 'Once');
  // This quarter's goals a task can count towards.
  const quarterGoals = $derived(
    P.goals.filter((g) => g.quarter === P.quarterOf(P.viewKey) && g.title.trim()).sort((a, b) => a.order - b.order),
  );
  // Time habits a timed task can count towards.
  const timeHabits = $derived(
    P.series.filter((s) => s.kind === 'habit' && s.habit?.type === 'time' && (s.until == null || s.until >= P.viewKey)),
  );
  // Deleting asks about later days only while the task's series still has days after this one.
  const series = $derived(it?.seriesId ? P.series.find((s) => s.id === it.seriesId) : undefined);
  const repeatsLater = $derived(!!series && (series.until == null || series.until > P.viewKey));

  // The task can disappear underneath the sheet (cleared day, another tab): close it then.
  $effect(() => {
    if (!v) P.closeSheet();
  });

  // A check has no duration: picking one makes it a timed task, and "No time" makes a task a check.
  const isCheck = $derived(it?.kind === 'check');
  const late = $derived(Math.max(P.day.wrap, P.isToday ? P.n : 0));
  function setDuration(m: number) {
    if (!it || m === it.min) return;
    if (m === 0) P.edit(id, { min: 0, kind: 'check', fixedAt: null, status: it.status === 'done' ? 'done' : 'todo' });
    else if (isCheck) P.edit(id, { min: m, kind: 'task', status: 'todo', endedAt: null });
    else P.edit(id, { min: m });
  }

  // Switching Timed or Repeats back on brings back what it was set to.
  let lastMin = $state(30);
  let lastRepeat = $state('Every day');
  $effect(() => {
    if (it && it.min > 0) lastMin = it.min;
    if (it && it.repeat !== 'Once') lastRepeat = it.repeat;
  });
  // A check is a plain task without a timer; picking Buffer or Fixed time gives it one again.
  function pickKind(k: Kind) {
    if (isCheck) {
      if (k === 'task') return;
      setDuration(lastMin);
    }
    P.setKind(id, k);
  }

  let newSub = $state('');
  const ring = $derived(
    !v ? '' : v.s === 'paused' ? '2px solid var(--muted)' : v.isOver ? '2px solid #f87171' : `2px solid ${RUN}`,
  );
  const barBg = $derived(!v ? '' : v.s === 'paused' ? 'var(--muted)' : v.isOver ? '#f87171' : RUN);

  function addStep() {
    if (!newSub.trim()) return;
    P.addSub(id, newSub);
    newSub = '';
  }
</script>

{#if v && it}
  <div class="head">
    <span class="icon" aria-hidden="true">
      <KindMark kind={it.kind} hue={it.hue} size={16} />
    </span>
    <div class="ht">
      <span class="summary">
        {[
          isCheck ? 'No time' : dL(it.min),
          it.repeat !== 'Once' ? it.repeat : null,
          v.fixedAt ? 'fixed ' + v.fixedAt + (v.fixedNow ? ', now ' + v.fixedNow : '') : null,
          it.kind === 'buffer' ? 'Buffer' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
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
    <!-- On an ended day every control in here is off: the task can be looked at, not changed. -->
    <fieldset class="fields" disabled={P.locked}>
      {#if postponeArmed && !v.active}
        <PostponeChooser {id} title={it.title} large />
      {/if}

      {#if v.active}
        <div class="timer" style:border={ring}>
          <div class="trow">
            <div class="tcol">
              <span class="count" style:color={v.countColor}>{v.count}</span>
              <span class="tsub">
                {v.s === 'paused'
                  ? `${v.countSub} · worked ${dL(v.w)} of ${dL(it.min)}`
                  : `worked ${dL(v.w)} of ${dL(it.min)}` + (v.pausedTot >= 0.5 ? ` · paused ${dL(v.pausedTot)}` : '')}
              </span>
            </div>
            <span class="badge">{v.s === 'paused' ? '‖ Paused' : v.isOver ? 'Over time' : 'Running'}</span>
          </div>
          <div class="bar"><div style:width="{v.isOver ? 100 : v.p}%" style:background={barBg}></div></div>
          {#if postponeArmed}
            <PostponeChooser {id} title={it.title} worked={v.w} large />
          {:else if finishArmed}
            <FinishChooser {id} title={it.title} worked={v.w} min={it.min} large />
          {:else}
            <div class="ctls">
              <!-- One button that flips, so keyboard focus stays on it. -->
              <button
                class="ctl primary"
                aria-label="{v.s === 'running' ? 'Pause' : 'Resume'} {it.title}"
                onclick={() => (v.s === 'running' ? P.pause(id) : P.resume(id))}
                ><span class="g">{v.s === 'running' ? '‖' : '▶'}</span>{v.s === 'running' ? 'Pause' : 'Resume'}</button
              >
              <button class="ctl done" aria-label="Done {it.title}" onclick={() => P.done(id)}
                ><span class="g">✓</span>Done</button
              >
              <button class="ctl ghost" aria-label="Postpone {it.title}" onclick={() => P.arm('postpone', id)}
                ><span class="g">↷</span>Postpone</button
              >
            </div>
          {/if}
          <div class="retime"><RetimeTask {id} /></div>
        </div>
      {/if}

      {#if logged}
        <div class="card tight when">
          <span class="label">When</span>
          <RetimeTask {id} />
        </div>
      {/if}

      <div class="card">
        <div class="group">
          <KindChips kind={isCheck ? 'task' : it.kind} hue={it.hue} onpick={pickKind} />
          {#if it.kind === 'fixed'}
            <label class="at">
              <span>At</span>
              <input
                class="time"
                type="time"
                aria-label="Fixed time"
                value={it.fixedAt != null ? hhmm(it.fixedAt) : ''}
                onchange={(e) =>
                  e.currentTarget.value && P.edit(id, { fixedAt: clockToDay(hm(e.currentTarget.value), late) })}
              />
            </label>
            {#if v.fixedNow}
              <span class="moved-note">
                The tasks before it run past {v.fixedAt}, so it starts at {v.fixedNow}.
              </span>
            {/if}
          {/if}
        </div>
        {#if it.kind !== 'buffer'}
          <Fields field="colour" hue={it.hue} onHue={(h) => P.edit(id, { hue: h })} />
        {/if}
        {#if !isCheck}
          <div class="pos">
            <span class="label">Position: {v.idx + 1} of {P.day.items.length}</span>
            <button class="pb" onclick={() => P.move(id, -1)}>↑ Earlier</button>
            <button class="pb" onclick={() => P.move(id, 1)}>↓ Later</button>
          </div>
        {/if}
      </div>

      <div class="props">
        <SwitchRow
          label="Timed"
          note={v.active
            ? 'Stop the timer to change this'
            : isCheck
              ? 'No timer, just a box to tick'
              : it.kind === 'buffer'
                ? 'How much time it keeps free'
                : 'Start, pause and finish it with a timer'}
          on={!isCheck}
          disabled={v.active}
          ontoggle={() => setDuration(isCheck ? lastMin : 0)}
        >
          <Fields field="duration" min={it.min} showLabel={false} onMin={setDuration} />
        </SwitchRow>
        <SwitchRow
          label="Repeats"
          note={repeating ? "Changes also update later days you haven't started yet" : 'Just this once'}
          on={repeating}
          ontoggle={() => P.setRepeat(id, repeating ? 'Once' : lastRepeat)}
        >
          <div class="row">
            {#each repeatOpts as r (r)}
              <button class="chip" aria-pressed={it.repeat === r} onclick={() => P.setRepeat(id, r)}>{r}</button>
            {/each}
          </div>
        </SwitchRow>
        {#if quarterGoals.length && it.kind !== 'buffer'}
          <SwitchRow
            label="Counts towards a goal"
            note={it.goalId
              ? `Adds to ${quarterGoals.find((g) => g.id === it.goalId)?.title ?? 'a goal'}`
              : "Its time adds to one of this quarter's goals"}
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
        {/if}
        {#if timeHabits.length && !isCheck && it.kind !== 'buffer'}
          <SwitchRow
            label="Counts towards a habit"
            note={it.habitId
              ? `Its time adds to ${timeHabits.find((s) => s.id === it.habitId)?.title ?? 'a habit'}`
              : 'Time spent on it can count towards a time habit'}
            on={!!it.habitId}
            ontoggle={() => P.edit(id, { habitId: it.habitId ? null : timeHabits[0].id })}
          >
            <div class="row">
              {#each timeHabits as s (s.id)}
                <button class="chip" aria-pressed={it.habitId === s.id} onclick={() => P.edit(id, { habitId: s.id })}
                  >{s.title}</button
                >
              {/each}
            </div>
          </SwitchRow>
        {/if}
      </div>

      <div class="card tight">
        <span class="label sublabel">
          Subtasks {it.subtasks.length ? `· ${it.subtasks.filter((x) => x.d).length}/${it.subtasks.length}` : ''}
        </span>
        {#each it.subtasks as x, xi (x.id)}
          <div class="step">
            <button
              class="tog hit"
              style:--hit-x="4px"
              style:--hit-y="4px"
              role="checkbox"
              aria-checked={x.d}
              aria-label="Toggle step: {x.t}"
              onclick={() => P.toggleSub(id, x.id)}
            >
              <StepBox index={xi} done={x.d} />
            </button>
            <span class="st" class:done={x.d}>{x.t}</span>
            {#if !P.locked}
              <button class="rm hit" aria-label="Remove step: {x.t}" onclick={() => P.removeSub(id, x.id)}>×</button>
            {/if}
          </div>
        {/each}
        {#if !P.locked}
          <input
            class="newsub"
            bind:value={newSub}
            onkeydown={(e) => e.key === 'Enter' && !e.isComposing && addStep()}
            onblur={addStep}
            placeholder="Add a step…"
            aria-label="Add a step"
          />
        {/if}
      </div>

      <div class="card tight notes">
        <span class="label">Notes</span>
        <textarea
          rows="3"
          placeholder={P.locked ? '' : 'Anything to remember'}
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
          <span class="q">Delete it just for {P.isToday ? 'today' : 'this day'}, or for later days too?</span>
          <button class="btn-yes" onclick={() => P.remove(id)} {@attach (el) => el.focus()}
            >{P.isToday ? 'Just today' : 'Just this day'}</button
          >
          <button class="btn-yes" onclick={() => P.removeWithLater(id)}>Later days too</button>
        {:else}
          <span class="q">Delete this task?</span>
          <button class="btn-yes" onclick={() => P.remove(id)} {@attach (el) => el.focus()}>Delete</button>
        {/if}
        <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
        <DisarmBar />
      </div>
    {:else}
      <!-- Deleting sits apart from the task's own actions, as an icon. -->
      <button class="trash" aria-label="Delete {it.title}" onclick={() => P.arm('delete', id)}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
          ><path
            d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12.2A1.5 1.5 0 0 0 8.5 20.5h7a1.5 1.5 0 0 0 1.5-1.3L18 7M10 11v5.5M14 11v5.5"
          /></svg
        >
      </button>
      {#if isCheck && v.s === 'todo' && P.waiting}
        <button class="ctl" disabled>Tick off once your day starts</button>
      {:else if isCheck}
        <button class="ctl" class:done={v.s !== 'done'} onclick={() => P.toggleCheck(id)}
          ><span class="g">✓</span>{v.s === 'done' ? 'Untick' : 'Tick off'}</button
        >
      {:else if v.s === 'todo'}
        <button class="ctl" onclick={() => P.skip(id)}>{P.isToday ? 'Skip today' : 'Skip this day'}</button>
        {#if P.isToday && !postponeArmed}
          <button class="ctl post" onclick={() => P.arm('postpone', id)}><span class="g">↷</span>Postpone</button>
        {/if}
      {:else if v.s === 'skipped'}
        <button class="ctl" onclick={() => P.restore(id)}>Restore</button>
      {:else if v.s === 'done'}
        <button class="ctl" onclick={() => P.reopen(id)}>Reopen</button>
      {:else if v.s === 'postponed' && it.movedKey}
        <button class="ctl" onclick={() => P.restore(id)}>Undo move</button>
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
    color: var(--muted);
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
  /* Ended day: what was chosen stands out, the rest steps back, and nothing looks tappable. */
  .fields:disabled :global(button) {
    cursor: default;
  }
  .fields:disabled :global(.chip:not([aria-pressed='true'])),
  .fields:disabled .pb {
    opacity: 0.45;
  }
  .fields:disabled textarea {
    color: var(--text);
    -webkit-text-fill-color: var(--text);
    opacity: 1;
  }
  .ended {
    flex: 1;
    margin: 0;
    padding: 6px 2px;
    font: 400 14px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .timer {
    padding: 16px;
    border-radius: 16px;
    background: var(--raised);
    display: flex;
    flex-direction: column;
    gap: 14px;
    transition: border-color 240ms;
  }
  .trow {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .tcol {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .count {
    font: 300 56px/1 var(--font);
    letter-spacing: -0.03em;
    transition: color 240ms;
  }
  .tsub {
    font: 400 13px/1.3 var(--font);
    color: var(--muted);
  }
  .badge {
    font: 400 12px/1 var(--font);
    padding: 6px 10px;
    border-radius: 99px;
    background: var(--sunk);
    white-space: nowrap;
  }
  .bar {
    height: 6px;
    border-radius: 9px;
    background: var(--sunk);
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    border-radius: 9px;
    transition: background 240ms;
  }
  .ctls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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
  .card.tight {
    padding: 14px 16px;
    gap: 6px;
  }
  .card.when {
    gap: 10px;
  }
  /* Under the timer's controls: when it started, to correct it. */
  .retime {
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .card.notes {
    gap: 8px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* Timed and Repeats: one card, a row per switch (SwitchRow). */
  .props {
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--raised);
    overflow: hidden;
  }
  .at {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 400 14px/1 var(--font);
    color: var(--muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .moved-note {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .time {
    height: 40px;
    padding: 0 8px;
    border-radius: 10px;
    border: none;
    background: var(--sunk);
    color: var(--text);
    font: 400 14px/1 var(--font);
  }
  .pos {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pos .label {
    margin-right: auto;
  }
  .pb {
    height: 44px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 13px/1 var(--font);
    cursor: pointer;
  }
  .sublabel {
    padding-bottom: 4px;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 400 15px/1.3 var(--font);
  }
  .tog {
    width: 36px;
    height: 36px;
    margin: 0 -8px;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .st {
    flex: 1;
    overflow-wrap: anywhere;
  }
  .st.done {
    color: var(--muted);
  }
  .rm {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--faint);
    font: 400 16px/1 var(--font);
    cursor: pointer;
  }
  .newsub {
    height: 40px;
    border: none;
    outline: none;
    background: transparent;
    padding: 0 0 0 30px;
    font: 400 14px/1 var(--font);
    color: var(--text);
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
  /* Delete, then the task's own actions (at most two), side by side with room to breathe. */
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
  .ctl:disabled {
    color: var(--muted);
    cursor: not-allowed;
  }
  .ctl.post {
    background: transparent;
    border: 1.5px solid #fb923c;
    color: var(--orT);
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
  /* Just today / Later days too: the question on its own line, the choices in a row. */
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
