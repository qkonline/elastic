<script lang="ts">
  import { quarterLabel } from '../lib/goals';
  import { planner as P } from '../lib/planner.svelte';
  import { weekSpan } from '../lib/review';

  // On Today, when a weekly or quarterly review is due: a card to view it, or dismiss it (it's
  // then saved as skipped and doesn't come back). It says which week or quarter it covers.
  const due = $derived(P.view === 'day' && P.isToday ? P.dueReview : null);
  const range = $derived(
    !due
      ? ''
      : due.kind === 'quarter'
        ? quarterLabel(due.id)
        : `${due.to >= P.today ? 'This week' : 'Last week'}, ${weekSpan(due.from, due.to)}`,
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
      <button class="go" onclick={() => P.openScreen({ type: 'review' })}>View</button>
      <button class="skip" onclick={() => P.skipReview(due)}>Dismiss</button>
    </div>
  </section>
{/if}

<style>
  .due {
    margin: 12px var(--px) 2px;
    padding: 14px 16px;
    border-radius: var(--r-card);
    border: 1.5px solid transparent;
    background:
      linear-gradient(var(--raised), var(--raised)) padding-box,
      linear-gradient(120deg, var(--rainbow-stops)) border-box;
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
    border-radius: var(--r-ctl);
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
