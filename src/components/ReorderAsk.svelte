<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';

  // After a repeating task is dragged past another one: this day only, or later days as well?
  let { id, anchor, dir }: { id: string; anchor: string; dir: 'up' | 'down' } = $props();
  const it = $derived(P.item(id));
  const other = $derived(P.series.find((s) => s.id === anchor)?.title ?? 'the other task');
  const when = $derived(!it ? '' : it.repeat === 'Weekdays' ? 'on weekdays' : it.repeat.replace(/^Every/, 'every'));
</script>

{#if it}
  <div class="head">
    <span class="h">Move it on later days too?</span>
    <span class="note">
      {it.title} repeats {when}. On later days it still comes {dir === 'up' ? 'after' : 'before'}
      {other}.
    </span>
  </div>
  <div class="foot">
    <button class="sec" onclick={() => P.closeSheet()}>{P.isToday ? 'Just today' : 'Just this day'}</button>
    <button class="pri" data-autofocus onclick={() => P.reorderLaterDays()}>Later days too</button>
  </div>
{/if}

<style>
  .head {
    padding: 22px 20px 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .h {
    font: 600 21px/1.2 var(--font);
    letter-spacing: -0.01em;
  }
  .note {
    font: 400 14px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .foot {
    display: flex;
    gap: 10px;
    padding: 18px 20px calc(20px + env(safe-area-inset-bottom));
  }
  .foot button {
    flex: 1;
    height: 50px;
    border-radius: var(--r-card);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .pri {
    border: none;
    background: var(--text);
    color: var(--bg);
  }
  .sec {
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
  }
</style>
