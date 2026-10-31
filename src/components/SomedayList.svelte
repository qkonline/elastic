<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { dragSomeday, justDropped } from '../lib/somedayDrag';
  import { dL, fT } from '../lib/time';
  import type { Item } from '../lib/types';
  import KindMark from './KindMark.svelte';

  // Tasks with no day yet: each opens to be planned (or changed), and with `drag` (the column
  // beside the plan) can be dragged onto a day. Add to Someday at the end.
  let { drag = false }: { drag?: boolean } = $props();

  function sub(it: Item): string {
    const len =
      it.kind === 'check'
        ? 'No time'
        : it.kind === 'buffer'
          ? `${dL(it.min)} kept free`
          : it.kind === 'fixed' && it.fixedAt != null
            ? `${dL(it.min)} at ${fT(it.fixedAt, P.settings.clock24)}`
            : dL(it.min);
    const n = it.subtasks.length;
    return n ? `${len}, ${n} subtask${n === 1 ? '' : 's'}` : len;
  }
  function open(id: string) {
    if (!justDropped()) P.openSheet({ type: 'someday', id });
  }
</script>

<ul class="list">
  {#each P.someday as it (it.id)}
    <li>
      <button
        class="row"
        class:drag
        aria-label="{it.title}, {sub(it)}"
        onclick={() => open(it.id)}
        onpointerdown={(e) => drag && dragSomeday(P, e, it.id, it.title)}
      >
        {#if it.kind === 'check'}
          <span class="box" aria-hidden="true"></span>
        {:else}
          <KindMark kind={it.kind} hue={it.hue} size={12} />
        {/if}
        <span class="txt">
          <span class="t">{it.title}</span>
          <span class="s">{sub(it)}</span>
        </span>
        <svg class="chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
          ><path d="M6 3.5L10.5 8 6 12.5" /></svg
        >
      </button>
    </li>
  {/each}
</ul>
<button class="add" onclick={() => P.openSheet({ type: 'add', someday: true })}>
  <span class="plus" aria-hidden="true">+</span>Add to Someday
</button>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    width: 100%;
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .row.drag {
    cursor: grab;
    -webkit-touch-callout: none;
    user-select: none;
  }
  @media (hover: hover) {
    .row:hover {
      background: var(--sunk);
    }
  }
  .box {
    width: 12px;
    height: 12px;
    flex: none;
    box-sizing: border-box;
    border-radius: 3px;
    border: 1.8px solid var(--accent);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .t {
    font: 400 16px/1.25 var(--font);
    overflow-wrap: anywhere;
  }
  .s {
    font: 400 13px/1.3 var(--font);
    color: var(--muted);
  }
  .chev {
    flex: none;
    fill: none;
    stroke: var(--faint);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .add {
    width: 100%;
    height: 48px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .plus {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1.5px dashed var(--faint);
    border-radius: var(--r-sm);
    font-size: 14px;
  }
  @media (hover: hover) {
    .add:hover {
      color: var(--text);
    }
  }
</style>
