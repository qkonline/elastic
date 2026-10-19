<script lang="ts">
  import { untrack } from 'svelte';
  import { planner as P } from '../lib/planner.svelte';
  import { itemVM, RUN, stripSegs } from '../lib/rows';
  import { dL, fT } from '../lib/time';
  import { hueColor, hueName } from '../lib/types';
  import DisarmBar from './DisarmBar.svelte';
  import FinishChooser from './FinishChooser.svelte';
  import KindMark from './KindMark.svelte';
  import PostponeChooser from './PostponeChooser.svelte';
  import RetimeTask from './RetimeTask.svelte';
  import StepBox from './StepBox.svelte';
  import TaskEdit from './TaskEdit.svelte';

  // Tapping a task opens it to look at: where it sits in the day, what it's set to, and what can
  // be done with it now (start, skip, postpone, tick off...). Changing what it is happens behind
  // Edit task, in a form that only saves on Update task.
  let { id: idProp }: { id: string } = $props();
  // The sheet is keyed by task, so the id never changes while it's open.
  const id = untrack(() => idProp);
  let editing = $state(false);

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
  const isCheck = $derived(it?.kind === 'check');
  // Deleting asks about later days only while the task's series still has days after this one.
  const series = $derived(it?.seriesId ? P.series.find((s) => s.id === it.seriesId) : undefined);
  const repeatsLater = $derived(!!series && (series.until == null || series.until > P.viewKey));
  const goal = $derived(it?.goalId ? P.goals.find((g) => g.id === it.goalId) : undefined);
  const habit = $derived(it?.habitId ? P.series.find((s) => s.id === it.habitId) : undefined);

  // The task can disappear underneath the sheet (cleared day, another tab): close it then.
  $effect(() => {
    if (!v) P.closeSheet();
  });
  // An ended day can't be edited: leave the form if it ends meanwhile.
  $effect(() => {
    if (P.locked) editing = false;
  });

  // Where it sits in the day: the day's strip with this task picked out.
  const segs = $derived(isCheck ? [] : stripSegs(P.sch.rows, P.planDay.dayStarted != null));
  const showTimes = $derived(P.settings.showTimes !== 'never');
  const clock = (m: number) => fT(m, P.settings.clock24) + (m >= 1440 ? ' +1' : '');
  const kindName = $derived(
    !it ? '' : isCheck ? 'Check' : it.kind === 'buffer' ? 'Buffer' : it.kind === 'fixed' ? 'Fixed time' : 'Task',
  );
  const standing = $derived.by(() => {
    if (!v || !it) return '';
    if (v.s === 'done') return isCheck ? 'Ticked off' : 'Done';
    if (v.s === 'skipped') return P.isToday ? 'Skipped today' : 'Skipped';
    if (v.s === 'postponed') return v.sub ?? 'Moved';
    if (isCheck) return 'On the checklist';
    if (it.kind === 'buffer') return 'Time kept free';
    if (P.day.dayStarted == null && P.isToday) return 'Planned, once your day starts';
    return P.viewKey > P.today ? 'Planned' : 'Still to do';
  });

  const ring = $derived(
    !v ? '' : v.s === 'paused' ? '2px solid var(--muted)' : v.isOver ? '2px solid #f87171' : `2px solid ${RUN}`,
  );
  const barBg = $derived(!v ? '' : v.s === 'paused' ? 'var(--muted)' : v.isOver ? '#f87171' : RUN);
</script>

{#if v && it}
  {#if editing}
    <TaskEdit item={it} ondone={() => (editing = false)} />
  {:else}
    <div class="head">
      <span class="icon" aria-hidden="true"><KindMark kind={it.kind} hue={it.hue} size={16} /></span>
      <div class="ht">
        <span class="kind">{kindName}{it.repeat !== 'Once' ? `, ${it.repeat.toLowerCase()}` : ''}</span>
        <h2 class="title" class:done={v.s === 'done'}>{it.title}</h2>
      </div>
      <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
    </div>

    <div class="body">
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
          {#if P.locked}
            <!-- An ended day's timer was stopped; nothing to press. -->
          {:else if postponeArmed}
            <PostponeChooser {id} title={it.title} worked={v.w} large />
          {:else if finishArmed}
            <FinishChooser {id} title={it.title} worked={v.w} min={it.min} large />
          {:else}
            <div class="ctls">
              <!-- One button that flips, so keyboard focus stays on it. -->
              <button
                class="ctl"
                class:primary={v.s !== 'running'}
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
          {#if !P.locked}<div class="retime"><RetimeTask {id} /></div>{/if}
        </div>
      {:else}
        <!-- Where it sits in the day, how it stands, and what can be done with it now. -->
        <section class="place" aria-label="In your day">
          <div class="span">
            {#if isCheck}
              <span class="big">No timer</span>
            {:else if showTimes}
              <span class="big">{clock(v.start)} <span class="to">to</span> {clock(v.end)}</span>
              <span class="len">{dL(it.min)}</span>
            {:else}
              <span class="big">{dL(it.min)}</span>
            {/if}
          </div>
          {#if segs.length}
            <div class="strip" aria-hidden="true">
              {#each segs as g (g.key)}
                <span
                  class:gap={g.gap}
                  class:faded={g.faded && g.id !== id}
                  class:other={g.id !== id && !g.gap}
                  class:me={g.id === id}
                  style:flex-grow={g.min}
                  style:--c={g.c}
                ></span>
              {/each}
            </div>
          {/if}
          <div class="state">
            <span>{standing}</span>
            {#if v.sub && v.s !== 'postponed'}<span class="sub">{v.sub}</span>{/if}
            {#each v.flags as f (f.t)}<span class="flag {f.tone}">{f.t}</span>{/each}
          </div>
          {#if v.fixedNow}
            <p class="moved">The tasks before it run past {v.fixedAt}, so it starts at {v.fixedNow}.</p>
          {/if}

          {#if postponeArmed}
            <PostponeChooser {id} title={it.title} large />
          {:else if !P.locked}
            <div class="acts">
              {#if isCheck && v.s === 'todo' && P.waiting}
                <button class="ctl" disabled>Tick off once your day starts</button>
              {:else if isCheck}
                <button class="ctl" class:done={v.s !== 'done'} onclick={() => P.toggleCheck(id)}
                  ><span class="g">✓</span>{v.s === 'done' ? 'Untick' : 'Tick off'}</button
                >
              {:else if v.s === 'todo'}
                {#if v.missed}
                  <button class="ctl mark" onclick={() => P.markDone(id, v.start, v.end)}
                    ><span class="g">✓</span>Mark done</button
                  >
                {:else if v.aStart && P.day.dayStarted != null}
                  <button class="ctl primary" aria-label="Start {it.title}" onclick={() => P.startItem(id)}
                    ><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"
                      ><path d="M3 1.6v8.8L10.4 6z" /></svg
                    >Start</button
                  >
                {/if}
                <button class="ctl" onclick={() => P.skip(id)}>{P.isToday ? 'Skip today' : 'Skip this day'}</button>
                {#if P.isToday}
                  <button class="ctl" onclick={() => P.arm('postpone', id)}><span class="g">↷</span>Postpone</button>
                {/if}
              {:else if v.s === 'skipped'}
                <button class="ctl" onclick={() => P.restore(id)}>Restore</button>
              {:else if v.s === 'done'}
                <button class="ctl" onclick={() => P.reopen(id)}>Reopen</button>
              {:else if v.s === 'postponed' && it.movedKey}
                <button class="ctl" onclick={() => P.restore(id)}>Undo move</button>
              {/if}
            </div>
          {/if}
        </section>
      {/if}

      {#if logged}
        <div class="card when">
          <span class="label">When</span>
          {#if P.locked}
            <span class="val"
              >{clock(it.startedAt!)}{it.endedAt != null ? ` to ${clock(it.endedAt)}` : ''}, worked {dL(v.w)}</span
            >
          {:else}
            <RetimeTask {id} />
          {/if}
        </div>
      {/if}

      {#if it.subtasks.length}
        <div class="card">
          <span class="label">Steps, {it.subtasks.filter((x) => x.d).length} of {it.subtasks.length} done</span>
          {#each it.subtasks as x, xi (x.id)}
            <div class="step">
              <button
                class="tog hit"
                style:--hit-x="4px"
                style:--hit-y="4px"
                role="checkbox"
                aria-checked={x.d}
                aria-label="Toggle step: {x.t}"
                disabled={P.locked}
                onclick={() => P.toggleSub(id, x.id)}
              >
                <StepBox index={xi} done={x.d} />
              </button>
              <span class="st" class:done={x.d}>{x.t}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if it.note.trim()}
        <div class="card">
          <span class="label">Notes</span>
          <p class="note">{it.note}</p>
        </div>
      {/if}

      <dl class="card facts">
        {#if it.kind !== 'buffer'}
          <div>
            <dt>Colour</dt>
            <dd><i class="sw" style:background={hueColor(it.hue)}></i>{hueName(it.hue)}</dd>
          </div>
        {/if}
        {#if it.kind === 'fixed' && v.fixedAt}
          <div>
            <dt>Fixed at</dt>
            <dd>{v.fixedAt}</dd>
          </div>
        {/if}
        <div>
          <dt>Repeats</dt>
          <dd>{it.repeat === 'Once' ? 'No, just this once' : it.repeat}</dd>
        </div>
        {#if goal}
          <div>
            <dt>Goal</dt>
            <dd>{goal.title}</dd>
          </div>
        {/if}
        {#if habit}
          <div>
            <dt>Habit</dt>
            <dd>{habit.title}</dd>
          </div>
        {/if}
        {#if !isCheck}
          <div class="pos">
            <dt>In the plan</dt>
            <dd>
              {v.idx + 1} of {P.day.items.length}
              {#if !P.locked}
                <button class="pb" onclick={() => P.move(id, -1)}>↑ Earlier</button>
                <button class="pb" onclick={() => P.move(id, 1)}>↓ Later</button>
              {/if}
            </dd>
          </div>
        {/if}
      </dl>
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
        <!-- Deleting sits apart, as an icon; changing the task is the way forward. -->
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
          Edit task
        </button>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px 12px;
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
    gap: 4px;
  }
  .kind {
    font: 400 12px/1 var(--font);
    color: var(--muted);
  }
  .title {
    margin: 0;
    font: 600 21px/1.2 var(--font);
    letter-spacing: -0.01em;
    color: var(--text);
    overflow-wrap: anywhere;
  }
  .title.done {
    text-decoration: line-through;
    text-decoration-color: var(--faint);
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
  .body > :global(*) {
    flex-shrink: 0;
  }

  /* In your day: the span in big numbers, the day's strip with this task raised out of it. */
  .place {
    padding: 16px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .span {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .big {
    flex: 1;
    font: 600 22px/1.15 var(--font);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .to {
    margin: 0 3px;
    font-weight: 400;
    font-size: 15px;
    letter-spacing: 0;
    color: var(--muted);
  }
  .len {
    font: 500 14px/1 var(--font);
    color: var(--muted);
    white-space: nowrap;
  }
  .strip {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 22px;
  }
  .strip span {
    flex: 1 1 0;
    min-width: 2px;
    height: 10px;
    border-radius: var(--r-bar);
    background: var(--c);
  }
  .strip .other {
    opacity: 0.32;
  }
  .strip .faded {
    opacity: 0.16;
  }
  .strip .gap {
    background: repeating-linear-gradient(135deg, var(--border) 0 3px, transparent 3px 6px);
  }
  /* This task: full height and full colour, set off from the rest by an ink outline. */
  .strip .me {
    min-width: 6px;
    height: 22px;
    box-shadow:
      0 0 0 1.5px var(--raised),
      0 0 0 3px var(--text);
  }
  .state {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    font: 500 14px/1.3 var(--font);
    color: var(--text);
  }
  .state .sub {
    font-weight: 400;
    color: var(--muted);
  }
  .flag {
    font: 500 12px/1 var(--font);
    padding: 5px 8px;
    border-radius: var(--r-sm);
  }
  .flag.y {
    background: color-mix(in oklab, #facc15 18%, transparent);
    color: var(--yelT);
  }
  .flag.r {
    background: rgba(248, 113, 113, 0.14);
    color: var(--redT);
  }
  .moved {
    margin: 0;
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .acts .ctl {
    height: 46px;
  }
  .acts .ctl svg {
    fill: currentColor;
  }
  .ctl:disabled {
    color: var(--muted);
    cursor: not-allowed;
  }

  .timer {
    padding: 16px;
    border-radius: var(--r-card);
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
    font: 500 56px/1 var(--font);
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
    border-radius: var(--r-sm);
    background: var(--sunk);
    white-space: nowrap;
  }
  .bar {
    height: 6px;
    border-radius: var(--r-sm);
    background: var(--sunk);
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    border-radius: var(--r-sm);
    transition: background 240ms;
  }
  .ctls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .retime {
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .card {
    margin: 0;
    padding: 14px 16px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .card.when {
    gap: 10px;
  }
  .val {
    font: 400 15px/1.4 var(--font);
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
  .tog:disabled {
    cursor: default;
  }
  .st {
    flex: 1;
    overflow-wrap: anywhere;
  }
  .st.done {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: var(--faint);
  }
  .note {
    margin: 0;
    font: 400 15px/1.5 var(--font);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* What it's set to: a quiet list, label on the left, value on the right. */
  .facts {
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
    color: var(--text);
    text-align: right;
  }
  .sw {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
  .pb {
    height: 36px;
    padding: 0 10px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 13px/1 var(--font);
    cursor: pointer;
  }
  .pos .pb:first-of-type {
    margin-left: 4px;
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
    text-wrap: pretty;
  }
  /* Edit task: the ink key, like Add task, pressing down onto its edge. */
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
