<script lang="ts">
  import { planner as P, type View } from '../lib/planner.svelte';
  import { addDays, dayDiff, keyDate, mondayOf, monthShort, shortDate, weekdayLong } from '../lib/time';
  import ScreenHeader from './ScreenHeader.svelte';

  // The title says what's on screen: the day, the week or the month. Day, Week and Month switch
  // between them, beside the title.
  const vDate = $derived(keyDate(P.viewKey));
  const diff = $derived(dayDiff(P.today, P.viewKey));
  const monthName = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long' });

  const heading = $derived.by((): { small: string; title: string } => {
    if (P.view === 'week') {
      const mon = mondayOf(P.viewKey);
      const sun = addDays(mon, 6);
      const weeks = Math.round(dayDiff(mondayOf(P.today), mon) / 7);
      const a = keyDate(mon),
        b = keyDate(sun);
      const range =
        a.getMonth() === b.getMonth()
          ? `${a.getDate()}–${b.getDate()} ${monthShort(b)}`
          : `${a.getDate()} ${monthShort(a)} – ${b.getDate()} ${monthShort(b)}`;
      const name = weeks === 0 ? 'This week' : weeks === 1 ? 'Next week' : weeks === -1 ? 'Last week' : range;
      return { small: name === range ? String(b.getFullYear()) : range, title: name };
    }
    if (P.view === 'month') {
      const now = keyDate(P.today);
      const same = vDate.getFullYear() === now.getFullYear() && vDate.getMonth() === now.getMonth();
      return { small: same ? 'This month' : String(vDate.getFullYear()), title: monthName(vDate) };
    }
    const title =
      diff === 0
        ? 'Today'
        : diff === 1
          ? 'Tomorrow'
          : diff === -1
            ? 'Yesterday'
            : `${vDate.getDate()} ${monthShort(vDate)}`;
    // Today, tomorrow and yesterday show the date; further away, say how far you are from today.
    const small =
      Math.abs(diff) <= 1
        ? shortDate(vDate)
        : diff > 0
          ? `${weekdayLong(vDate)}, in ${diff} days`
          : `${weekdayLong(vDate)}, ${-diff} days ago`;
    return { small, title };
  });
  // Away from today's day, week or month: a way back.
  const away = $derived(
    P.view === 'week'
      ? mondayOf(P.viewKey) !== mondayOf(P.today)
      : P.view === 'month'
        ? P.viewKey.slice(0, 7) !== P.today.slice(0, 7)
        : !P.isToday,
  );
  const VIEWS: [View, string][] = [
    ['day', 'Day'],
    ['week', 'Week'],
    ['month', 'Month'],
  ];
</script>

<ScreenHeader small={heading.small} title={heading.title}>
  {#snippet aside()}
    {#if away}
      <!-- The dot is the timeline's "now" marker: this takes you back to now. -->
      <button class="today" onclick={() => P.backToToday()}><span class="now"></span>Back to today</button>
    {/if}
  {/snippet}
  <div class="views" role="tablist" aria-label="Show">
    {#each VIEWS as [v, l] (v)}
      <button role="tab" class="seg" aria-selected={P.view === v} onclick={() => P.setView(v)}>{l}</button>
    {/each}
  </div>
</ScreenHeader>

<style>
  .today {
    flex: none;
    height: 32px;
    padding: 0 12px 0 10px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 500 13px/1 var(--font);
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .now {
    width: 7px;
    height: 7px;
    border-radius: 99px;
    background: var(--now);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--now) 22%, transparent);
  }
  @media (hover: hover) {
    .today:hover {
      background: var(--sunk);
    }
  }
  /* Day, Week, Month: one track, the chosen one raised on it. */
  .views {
    flex: none;
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-ctl);
    background: var(--sunk);
  }
  .seg {
    height: 34px;
    padding: 0 11px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    font: 400 14px/1 var(--font);
    cursor: pointer;
    transition:
      background 180ms,
      color 180ms;
  }
  .seg[aria-selected='true'] {
    background: var(--raised);
    color: var(--text);
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
  @media (prefers-reduced-motion: reduce) {
    .seg {
      transition: none;
    }
  }
</style>
