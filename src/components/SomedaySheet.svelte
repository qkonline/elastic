<script lang="ts">
  import { untrack } from 'svelte';
  import { planner as P } from '../lib/planner.svelte';
  import { addDays, dL, fT, keyDate, shortDate } from '../lib/time';
  import { hueColor, hueName } from '../lib/types';
  import DisarmBar from './DisarmBar.svelte';
  import KindMark from './KindMark.svelte';
  import Subtasks from './Subtasks.svelte';
  import TaskEdit from './TaskEdit.svelte';

  // A task with no day yet: plan it (today, tomorrow or another day, with one button named after
  // where it goes), work on its subtasks, or change it behind Edit task.
  let { id: idProp }: { id: string } = $props();
  const id = untrack(() => idProp);
  let editing = $state(false);
  const it = $derived(P.someday.find((x) => x.id === id));
  // Planned, deleted, or gone on another device: nothing left to show.
  $effect(() => {
    if (!it) P.closeSheet();
  });

  const tomorrow = $derived(addDays(P.today, 1));
  // Today can't take one once it has ended.
  const todayOpen = $derived(P.days[P.today]?.dayEnded == null);
  let where = $state<'today' | 'tomorrow' | 'day'>(untrack(() => (todayOpen ? 'today' : 'tomorrow')));
  let date = $state(untrack(() => addDays(tomorrow, 1)));
  const WHERE = $derived(
    [
      ['today', 'Today'],
      ['tomorrow', 'Tomorrow'],
      ['day', 'Another day'],
    ].filter(([w]) => w !== 'today' || todayOpen) as [typeof where, string][],
  );
  const key = $derived(where === 'today' ? P.today : where === 'tomorrow' ? tomorrow : date);
  const ready = $derived(!!key && key >= P.today);
  const planLabel = $derived(
    where === 'today'
      ? 'Plan it for today'
      : where === 'tomorrow'
        ? 'Plan it for tomorrow'
        : ready
          ? `Plan it for ${shortDate(keyDate(key))}`
          : 'Plan it',
  );

  const kindName = $derived(
    !it
      ? ''
      : it.kind === 'check'
        ? 'Check'
        : it.kind === 'buffer'
          ? 'Buffer'
          : it.kind === 'fixed'
            ? 'Fixed time'
            : 'Task',
  );
  const delArmed = $derived(P.armed('delete', id));
</script>

{#if it}
  {#if editing}
    <TaskEdit item={it} ondone={() => (editing = false)} />
  {:else}
    <div class="head">
      <span class="icon" aria-hidden="true">
        {#if it.kind === 'check'}<span class="box"></span>{:else}<KindMark kind={it.kind} hue={it.hue} size={16} />{/if}
      </span>
      <div class="ht">
        <span class="kind">{kindName}, someday</span>
        <h2 class="title">{it.title}</h2>
      </div>
      <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
    </div>

    <div class="body">
      <section class="place" aria-label="Plan it">
        <span class="label" id="plan-for">No day yet. Plan it for</span>
        <div class="where" role="radiogroup" aria-labelledby="plan-for">
          {#each WHERE as [w, label] (w)}
            <button role="radio" aria-checked={where === w} class:on={where === w} onclick={() => (where = w)}
              >{label}</button
            >
          {/each}
        </div>
        {#if where === 'day'}
          <input type="date" aria-label="Date" min={P.today} bind:value={date} />
        {/if}
        <button class="ctl primary" disabled={!ready} onclick={() => P.planSomeday(id, key)}>{planLabel}</button>
      </section>

      <div class="card">
        <Subtasks {it} />
      </div>

      {#if it.note.trim()}
        <div class="card">
          <span class="label">Notes</span>
          <p class="note">{it.note}</p>
        </div>
      {/if}

      <dl class="card facts">
        <div>
          <dt>Length</dt>
          <dd>{it.kind === 'check' ? 'No time, a check' : dL(it.min)}</dd>
        </div>
        {#if it.kind === 'fixed' && it.fixedAt != null}
          <div>
            <dt>Fixed at</dt>
            <dd>{fT(it.fixedAt, P.settings.clock24)}</dd>
          </div>
        {/if}
        {#if it.kind !== 'buffer'}
          <div>
            <dt>Colour</dt>
            <dd><i class="sw" style:background={hueColor(it.hue)}></i>{hueName(it.hue)}</dd>
          </div>
        {/if}
      </dl>
    </div>

    <div class="foot">
      {#if delArmed}
        <div class="confirm" role="group" aria-label="Confirm delete">
          <span class="q">Delete this task?</span>
          <button class="btn-yes" onclick={() => P.remove(id)} {@attach (el) => el.focus()}>Delete</button>
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
  .box {
    width: 16px;
    height: 16px;
    box-sizing: border-box;
    border-radius: 4px;
    border: 2px solid var(--accent);
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
  .place {
    padding: 16px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* Where it goes: three choices side by side, the picked one raised (as in Reschedule). */
  .where {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-ctl);
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .where button {
    flex: 1 1 auto;
    min-height: 40px;
    padding: 0 6px;
    white-space: nowrap;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    font: 400 14px/1.2 var(--font);
    cursor: pointer;
  }
  .where button.on {
    background: var(--raised);
    color: var(--text);
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  input {
    width: 100%;
    min-width: 0;
    height: 44px;
    padding: 0 10px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 15px/1 var(--font);
    box-sizing: border-box;
  }
  .place .ctl {
    flex: none;
    height: 46px;
    margin-top: 4px;
  }
  .ctl:disabled {
    opacity: 0.5;
    cursor: default;
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
  .note {
    margin: 0;
    font: 400 15px/1.5 var(--font);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
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
  .foot {
    flex: none;
    display: flex;
    gap: 10px;
    padding: 14px 16px calc(28px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
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
  .edit svg,
  .trash svg {
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
</style>
