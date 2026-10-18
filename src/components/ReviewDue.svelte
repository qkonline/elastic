<script lang="ts">
  import { quarterLabel } from '../lib/goals';
  import { planner as P } from '../lib/planner.svelte';
  import { keyDate } from '../lib/time';

  // On Today, when a weekly or quarterly review is due: a card to start it, or skip it.
  const due = $derived(P.view === 'day' && P.isToday ? P.dueReview : null);
  const range = $derived(
    !due
      ? ''
      : due.kind === 'quarter'
        ? quarterLabel(due.id)
        : `Week of ${keyDate(due.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
  );
</script>

{#if due}
  <section class="due" aria-label="Review">
    <div class="t">
      <span class="h">{due.kind === 'week' ? 'Your week in review' : 'Your quarter in review'}</span>
      <span class="s"
        >{range}. A few minutes to look back{due.kind === 'quarter' ? ' and set the next goals' : ''}.</span
      >
    </div>
    <div class="acts">
      <button class="go" onclick={() => P.openSheet({ type: 'review' })}>Start</button>
      <button class="skip" onclick={() => P.skipReview(due)}>Skip</button>
    </div>
  </section>
{/if}

<style>
  .due {
    margin: 12px var(--px) 2px;
    padding: 14px 16px;
    border-radius: 16px;
    border: 1.5px solid transparent;
    background:
      linear-gradient(var(--raised), var(--raised)) padding-box,
      linear-gradient(120deg, #fb923c, #fde047, #a3e635, #22d3ee, #818cf8) border-box;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .t {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .h {
    font: 400 15px/1.3 var(--font);
  }
  .s {
    font: 400 13px/1.4 var(--font);
    color: var(--muted);
  }
  .acts {
    display: flex;
    gap: 8px;
  }
  .go,
  .skip {
    height: 44px;
    padding: 0 18px;
    border-radius: 12px;
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .go {
    border: none;
    background: var(--text);
    color: var(--bg);
  }
  .skip {
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
  }
</style>
