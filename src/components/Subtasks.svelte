<script lang="ts">
  import { onDestroy } from 'svelte';
  import { vibrate } from '../lib/alert';
  import { planner as P } from '../lib/planner.svelte';
  import { pastedSteps } from '../lib/steps';
  import type { Item, Subtask } from '../lib/types';
  import SaveRow from './SaveRow.svelte';
  import StepBox from './StepBox.svelte';

  // A task's subtasks in its sheet: tick them, add more, tap one to rename it (Save or Cancel), ×
  // to remove it (with Undo), and press and hold one to move it (with a mouse, just drag it).
  // Ticks, removing and moving save at once; typing waits for its button, like everything typed.
  let { it }: { it: Item } = $props();
  const id = $derived(it.id);
  const subs = $derived(it.subtasks);
  const can = $derived(!P.locked);

  let newStep = $state('');
  let queued = $state<string[]>([]);
  const toAdd = $derived([...queued, newStep].map((t) => t.trim()).filter(Boolean));
  function addStep() {
    if (toAdd.length) P.addSubs(id, toAdd);
    newStep = '';
    queued = [];
  }

  // Renaming one: its id and the text so far.
  let renaming = $state<{ sid: string; t: string } | null>(null);
  function rename(x: Subtask) {
    if (!can || Date.now() - droppedAt < 400) return;
    renaming = { sid: x.id, t: x.t };
  }
  function saveName() {
    const r = renaming;
    const t = r?.t.trim();
    renaming = null;
    if (!r || !t) return;
    const was = subs.find((x) => x.id === r.sid);
    if (!was || was.t === t) return;
    P.setSubs(
      id,
      subs.map((x) => (x.id === r.sid ? { ...x, t } : x)),
      `Renamed to ${t}`,
    );
  }
  const unchanged = $derived(
    !renaming || !renaming.t.trim() || subs.find((x) => x.id === renaming!.sid)?.t === renaming.t.trim(),
  );

  // The last one removed, to bring back.
  let removed = $state<{ x: Subtask; at: number } | null>(null);
  let removedTimer = 0;
  function remove(x: Subtask, at: number) {
    renaming = null;
    P.setSubs(
      id,
      subs.filter((y) => y.id !== x.id),
      `Removed ${x.t}`,
    );
    removed = { x, at };
    clearTimeout(removedTimer);
    removedTimer = window.setTimeout(() => (removed = null), 10_000);
  }
  function undoRemove() {
    const r = removed;
    removed = null;
    if (!r || subs.some((y) => y.id === r.x.id)) return;
    const next = [...subs];
    next.splice(Math.min(r.at, next.length), 0, r.x);
    P.setSubs(id, next, `${r.x.t} is back`);
  }
  onDestroy(() => clearTimeout(removedTimer));

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= subs.length) return;
    const next = [...subs];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    P.setSubs(id, next, `Moved ${x.t} to number ${to + 1}`);
  }

  // Press and hold (touch) or drag (mouse) to move one. The lifted row follows the pointer and
  // the others slide aside to show where it will land.
  let listEl = $state<HTMLElement | null>(null);
  let lift = $state<{ from: number; to: number; dy: number; h: number } | null>(null);
  let droppedAt = 0;
  function press(e: PointerEvent, i: number) {
    if (!can || renaming || (e.button && e.button !== 0) || subs.length < 2) return;
    const touch = e.pointerType !== 'mouse';
    const row = (e.currentTarget as HTMLElement).closest('.step') as HTMLElement;
    const x0 = e.clientX,
      y0 = e.clientY;
    let on = false;
    const begin = () => {
      on = true;
      lift = { from: i, to: i, dy: 0, h: row.offsetHeight };
      vibrate(15);
    };
    const hold = touch ? window.setTimeout(begin, 350) : 0;
    const follow = (ev: PointerEvent) => {
      const dx = ev.clientX - x0,
        dy = ev.clientY - y0;
      if (!on) {
        if (!touch && Math.abs(dy) > 6) begin();
        else {
          if (Math.hypot(dx, dy) > 8) done(false);
          return;
        }
      }
      ev.preventDefault();
      if (!lift) return;
      const to = Math.max(0, Math.min(subs.length - 1, lift.from + Math.round(dy / lift.h)));
      lift = { ...lift, dy, to };
    };
    const noScroll = (ev: TouchEvent) => {
      if (on && ev.cancelable) ev.preventDefault();
    };
    const done = (commit: boolean) => {
      clearTimeout(hold);
      removeEventListener('pointermove', follow);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeEventListener('touchmove', noScroll);
      if (!on) return;
      droppedAt = Date.now();
      const l = lift;
      lift = null;
      if (commit && l) move(l.from, l.to);
    };
    const up = () => done(true);
    const cancel = () => done(false);
    addEventListener('pointermove', follow, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    addEventListener('touchmove', noScroll, { passive: false });
  }
  // How far each row slides while one is lifted.
  function shift(i: number): number {
    if (!lift || i === lift.from) return lift && i === lift.from ? lift.dy : 0;
    if (lift.from < i && i <= lift.to) return -lift.h;
    if (lift.to <= i && i < lift.from) return lift.h;
    return 0;
  }
  function keys(e: KeyboardEvent, i: number) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
    requestAnimationFrame(() =>
      listEl?.querySelectorAll<HTMLElement>('.st')[i + (e.key === 'ArrowUp' ? -1 : 1)]?.focus(),
    );
  }
</script>

<span class="label"
  >{subs.length ? `Subtasks, ${subs.filter((x) => x.d).length} of ${subs.length} done` : 'Subtasks'}</span
>
<div class="steps" bind:this={listEl} class:lifting={!!lift}>
  {#each subs as x, xi (x.id)}
    {#if renaming?.sid === x.id}
      <div class="step renaming">
        <StepBox index={xi} done={x.d} />
        <input
          class="new edit"
          bind:value={renaming.t}
          aria-label="Subtask name"
          {@attach (el) => {
            el.focus();
            el.select();
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' && !e.isComposing) saveName();
            else if (e.key === 'Escape') {
              e.stopPropagation();
              renaming = null;
            }
          }}
        />
      </div>
      <SaveRow label="Save" ok={!unchanged} onsave={saveName} oncancel={() => (renaming = null)} />
    {:else}
      <div class="step" class:up={lift?.from === xi} style:translate={lift ? `0 ${shift(xi)}px` : undefined}>
        <button
          class="tog hit"
          style:--hit-x="4px"
          style:--hit-y="4px"
          role="checkbox"
          aria-checked={x.d}
          aria-label="Toggle subtask: {x.t}"
          disabled={!can}
          onclick={() => P.toggleSub(id, x.id)}
        >
          <StepBox index={xi} done={x.d} />
        </button>
        {#if can}
          <button
            class="st"
            class:done={x.d}
            aria-label="Rename subtask: {x.t}"
            aria-describedby={subs.length > 1 ? 'subs-how' : undefined}
            onpointerdown={(e) => press(e, xi)}
            oncontextmenu={(e) => e.preventDefault()}
            onclick={() => rename(x)}
            onkeydown={(e) => keys(e, xi)}>{x.t}</button
          >
          <button class="rm hit" style:--hit-y="4px" aria-label="Remove subtask: {x.t}" onclick={() => remove(x, xi)}
            >×</button
          >
        {:else}
          <span class="st plain" class:done={x.d}>{x.t}</span>
        {/if}
      </div>
    {/if}
  {/each}
</div>
{#if can}
  {#if removed}
    <div class="removed" role="status">
      <span>Removed {removed.x.t}</span>
      <button class="undo" onclick={undoRemove}>Undo</button>
    </div>
  {/if}
  {#each queued as q, qi (qi)}
    <div class="step queued">
      <span class="plus" aria-hidden="true">+</span>
      <span class="st plain">{q}</span>
    </div>
  {/each}
  <div class="step add">
    <span class="plus" aria-hidden="true">+</span>
    <input
      class="new"
      bind:value={newStep}
      onkeydown={(e) => e.key === 'Enter' && !e.isComposing && addStep()}
      onpaste={(e) => {
        const lines = pastedSteps(e);
        if (lines) {
          queued = [...queued, ...lines];
          newStep = '';
        }
      }}
      placeholder="Add a subtask"
      aria-label="Add a subtask"
    />
  </div>
  {#if newStep.trim() || queued.length}
    <SaveRow
      label={toAdd.length === 1 ? 'Add subtask' : `Add ${toAdd.length} subtasks`}
      onsave={addStep}
      oncancel={() => {
        newStep = '';
        queued = [];
      }}
    />
  {/if}
  {#if subs.length && !renaming}
    <span class="how" id="subs-how"
      >{subs.length > 1 ? 'Tap one to rename it. Press and hold to move it.' : 'Tap it to rename it.'}</span
    >
  {/if}
{/if}

<style>
  .steps {
    display: flex;
    flex-direction: column;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    font: 400 15px/1.3 var(--font);
    background: var(--raised);
    border-radius: var(--r-ctl);
  }
  .lifting .step {
    transition: translate 160ms ease;
  }
  .lifting .step.up {
    position: relative;
    z-index: 1;
    transition: none;
    margin: 0 -8px;
    padding: 0 8px;
    box-shadow:
      0 10px 24px -8px rgba(0, 0, 0, 0.3),
      0 0 0 1px var(--border);
    scale: 1.02;
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
    flex: none;
  }
  .tog:disabled {
    cursor: default;
  }
  .st {
    flex: 1;
    min-width: 0;
    min-height: 40px;
    padding: 8px 0;
    border: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .st.plain {
    display: flex;
    align-items: center;
    cursor: default;
    user-select: text;
    -webkit-user-select: text;
  }
  .st.done {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: var(--faint);
  }
  .rm {
    width: 32px;
    height: 32px;
    flex: none;
    border: none;
    background: transparent;
    color: var(--faint);
    font: 400 18px/1 var(--font);
    cursor: pointer;
  }
  .rm:hover {
    color: var(--text);
  }
  .step.renaming {
    padding-top: 4px;
  }
  .new.edit {
    height: 40px;
    padding: 0 10px;
    border: 1.5px solid var(--text);
    border-radius: var(--r-ctl);
    background: var(--raised);
  }
  .step.add {
    min-height: 44px;
  }
  .step.queued {
    min-height: 32px;
    color: var(--muted);
  }
  .plus {
    width: 20px;
    height: 20px;
    flex: none;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    border: 1px dashed var(--line);
    border-radius: 6px;
    color: var(--muted);
    font: 500 13px/1 var(--font);
  }
  .new {
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
  .new::placeholder {
    color: var(--faint);
  }
  .removed {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    font: 400 14px/1.3 var(--font);
    color: var(--muted);
  }
  .removed span {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .undo {
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--r-ctl);
    background: var(--bg);
    color: var(--text);
    font: 500 14px/1 var(--font);
    cursor: pointer;
  }
  .how {
    padding-top: 4px;
    font: 400 13px/1.4 var(--font);
    color: var(--muted);
  }
</style>
