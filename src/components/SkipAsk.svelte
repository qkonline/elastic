<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { nextDay, prevDay, timesUpTo } from '../lib/repeat';
  import { keyDate, shortDate } from '../lib/time';
  import type { Series } from '../lib/types';

  // Skipping one of a repeat that ends (after a number of times, or on a date): add a day at
  // the end so it still comes up as many times, or keep the end date and have one fewer.
  let { id }: { id: string } = $props();
  const it = $derived(P.item(id));
  const s = $derived(it ? P.limitedSeries(it) : undefined);
  const key = $derived(P.viewKey);
  const date = (k: string) => shortDate(keyDate(k));
  const lastOf = (x: Series) => (x.until && !(x.until in (x.skips ?? {})) ? x.until : prevDay(x, x.until!));
  const times = (n: number) => (n === 1 ? 'once' : `${n} times`);
  const now = $derived(s ? { total: timesUpTo(s, s.until!), last: lastOf(s) } : null);
  const extend = $derived.by(() => {
    if (!s) return null;
    const skips = { ...s.skips, [key]: 'extend' as const };
    const x = { ...s, skips, until: nextDay({ ...s, skips }, s.until!) ?? s.until };
    return { total: timesUpTo(x, x.until!), last: lastOf(x) };
  });
  const keep = $derived.by(() => {
    if (!s) return null;
    const x = { ...s, skips: { ...s.skips, [key]: 'keep' as const } };
    return { total: timesUpTo(x, x.until!), last: lastOf(x) };
  });
  const when = $derived(P.isToday ? 'today' : `on ${date(key)}`);
</script>

{#if it && s && now && extend && keep}
  <div class="head">
    <span class="h">Skip {it.title} {when}?</span>
    <span class="note">
      It repeats {times(now.total)}{now.last ? `, the last one on ${date(now.last)}` : ''}.
    </span>
  </div>
  <div class="choices">
    <button class="pri" data-autofocus onclick={() => P.skipLimited(id, 'extend')}>
      <span class="t">Skip and add a day at the end</span>
      <span class="d">Still {times(extend.total)}{extend.last ? `, the last one on ${date(extend.last)}` : ''}</span>
    </button>
    <button class="sec" onclick={() => P.skipLimited(id, 'keep')}>
      <span class="t">Skip and keep the end date</span>
      <span class="d"
        >{keep.total ? times(keep.total) : 'No more times'}{keep.last
          ? `, the last one on ${date(keep.last)}`
          : ''}</span
      >
    </button>
    <button class="cancel" onclick={() => P.closeSheet()}>Cancel</button>
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
    overflow-wrap: anywhere;
  }
  .note {
    font: 400 15px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 20px calc(16px + env(safe-area-inset-bottom));
  }
  .pri,
  .sec {
    min-height: 60px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 3px;
    padding: 10px 16px;
    border-radius: var(--r-ctl);
    text-align: left;
    cursor: pointer;
  }
  .pri {
    border: none;
    background: var(--text);
    color: var(--bg);
  }
  .sec {
    border: 1px solid var(--line);
    background: var(--raised);
    color: var(--text);
  }
  .t {
    font: 500 16px/1.25 var(--font);
  }
  .d {
    font: 400 13px/1.35 var(--font);
  }
  .pri .d {
    opacity: 0.75;
  }
  .sec .d {
    color: var(--muted);
  }
  .cancel {
    height: 44px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
</style>
