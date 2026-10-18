<script lang="ts">
  import { planner as P, type View } from '../lib/planner.svelte';
  import { addDays, dayDiff, keyDate, mondayOf, monthShort, shortDate, weekdayLong } from '../lib/time';

  // The title says what's on screen: the day, the week or the month. Day, Week and Month switch
  // between them, beside the title on a computer and on a row of their own on a phone.
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

<header class="header">
  <div class="left">
    <div class="small">{heading.small}</div>
    <h1 class="title">{heading.title}</h1>
  </div>
  {#if away}
    <!-- The dot is the timeline's "now" marker: this takes you back to now. -->
    <button class="today" onclick={() => P.backToToday()}><span class="now"></span>Back to today</button>
  {/if}
  <div class="views" role="tablist" aria-label="Show">
    {#each VIEWS as [v, l] (v)}
      <button role="tab" class="seg" aria-selected={P.view === v} onclick={() => P.setView(v)}>{l}</button>
    {/each}
  </div>
  <button class="settings" aria-label="Settings" onclick={() => P.openSheet({ type: 'settings' })}>
    <span class="hex"><span class="hex-in"><span class="ring"></span></span></span>
  </button>
</header>

<style>
  .header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      'left today settings'
      'views views views';
    align-items: center;
    column-gap: 10px;
    height: calc(var(--header-h) + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) var(--px) 0;
    box-sizing: border-box;
    position: sticky;
    top: 0;
    z-index: 4;
    background: var(--bg);
    box-shadow: 0 1px 0 var(--border);
  }
  .left {
    grid-area: left;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .small {
    font: 400 13px/16px var(--font);
    height: 16px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .today {
    grid-area: today;
    height: 40px;
    padding: 0 16px 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 15px/1 var(--font);
    display: flex;
    align-items: center;
    gap: 9px;
    cursor: pointer;
    flex: none;
    transition:
      border-color 240ms,
      background 240ms;
  }
  .now {
    width: 8px;
    height: 8px;
    border-radius: 99px;
    background: var(--now);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--now) 22%, transparent);
  }
  @media (hover: hover) {
    .today:hover {
      border-color: var(--line);
      background: var(--sunk);
    }
  }
  .title {
    margin: 0;
    font: 400 26px/1.05 var(--font);
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Day, Week, Month: one track, the chosen one raised on it. */
  .views {
    grid-area: views;
    justify-self: stretch;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 3px;
    margin-bottom: 8px;
    border-radius: 12px;
    background: var(--sunk);
  }
  .seg {
    height: 30px;
    border: none;
    border-radius: 9px;
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
    box-shadow:
      0 0 0 1px var(--border),
      0 1px 2px rgba(0, 0, 0, 0.06);
  }
  .settings {
    grid-area: settings;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: none;
  }
  .hex,
  .hex-in {
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%);
  }
  .hex {
    width: 22px;
    height: 22px;
    background: #818cf8;
  }
  .hex-in {
    width: 17px;
    height: 17px;
    background: var(--bg);
  }
  @media (hover: hover) {
    .settings:hover {
      background: var(--sunk);
    }
    .settings:hover .hex-in {
      background: var(--sunk);
    }
  }
  /* A computer: everything on one row. */
  @media (min-width: 768px) {
    .header {
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      grid-template-areas: 'left today views settings';
    }
    .views {
      width: 240px;
      margin: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .seg {
      transition: none;
    }
  }
</style>
