<script lang="ts" module>
  import type { Kind } from '../lib/types';

  export const KINDS: [Kind, string][] = [
    ['task', 'Task'],
    ['buffer', 'Buffer'],
    ['fixed', 'Fixed time'],
  ];
  const HABIT: [Kind, string] = ['habit', 'Habit'];

  // What the chosen type means. Task is chosen by default, so its line also says what the other
  // two are for.
  const HINTS: Record<string, string> = {
    task: 'Something to get done. A buffer keeps time free between tasks, and a fixed time starts at a set time, like a call.',
    buffer:
      'Time kept free between tasks: room for overruns, travel or a breather. It holds its place, and you never start it.',
    fixed:
      'Happens at a set time, like a meeting or a call. If the tasks you put before it run past that time, it moves later.',
    habit:
      'Something you do regularly, like drinking water, reading or not smoking. Tick it, count it or time it, and keep a streak going.',
  };
</script>

<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Hue } from '../lib/types';
  import { reducedMotion } from '../lib/ui.svelte';
  import KindMark from './KindMark.svelte';

  // The Type choice in the New task and task sheets: each type with its mark, and a line on
  // what the chosen one means. `hue` is null while no colour has been picked. Habit is offered
  // in New task only (`habit`): a task and a habit don't turn into each other.
  let {
    kind,
    hue,
    onpick,
    habit = false,
  }: { kind: Kind; hue: Hue | null; onpick: (k: Kind) => void; habit?: boolean } = $props();
  const markHue = (k: Kind): Hue => hue ?? (k === 'fixed' ? 'indigo' : k === 'habit' ? 'lime' : 'cyan');
  const kinds = $derived(habit ? [...KINDS, HABIT] : KINDS);
</script>

<span class="label">Type</span>
<div class="kinds">
  {#each kinds as [k, l] (k)}
    <button class="chip kind" aria-pressed={kind === k} onclick={() => onpick(k)}>
      <KindMark kind={k} hue={markHue(k)} />{l}
    </button>
  {/each}
</div>
<div class="hint" aria-live="polite">
  {#key kind}
    <p in:fade={{ duration: reducedMotion.current ? 0 : 160 }}>{HINTS[kind] ?? HINTS.task}</p>
  {/key}
</div>

<style>
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .kind {
    gap: 8px;
    padding-left: 12px;
  }
  .hint p {
    margin: 0;
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
    max-width: 46ch;
  }
</style>
