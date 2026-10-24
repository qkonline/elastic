<script lang="ts">
  import { planner as P, type Screen } from '../lib/planner.svelte';

  // Today, Habits, Goals and Review are screens of their own; Add task sits raised in the middle.
  // The screen you're on is an open tab joined to the page above. A dot on Review says a review
  // is waiting. Tapping Today while on another day of the plan comes back to today.
  type Tab = 'today' | 'habits' | 'goals' | 'review';
  const LEFT: [Tab, string][] = [
    ['today', 'Today'],
    ['habits', 'Habits'],
  ];
  const RIGHT: [Tab, string][] = [
    ['goals', 'Goals'],
    ['review', 'Review'],
  ];
  const on = (t: Tab) => P.screen.type === t;

  function go(t: Tab) {
    if (t === 'today' && P.screen.type === 'today') {
      if (!P.isToday || P.view !== 'day') {
        if (P.view !== 'day') P.setView('day');
        P.backToToday();
      }
      return;
    }
    P.openScreen({ type: t } as Screen);
  }
  // From a screen without the plan in sight, a new task goes on Today, not a day last looked at.
  const add = async () => {
    if (P.screen.type !== 'today' && !P.isToday) await P.switchDay(P.today);
    if (P.locked) P.sayLocked();
    else P.openSheet({ type: 'add' });
  };
</script>

{#snippet tab(t: Tab, label: string)}
  <button class="tab" class:on={on(t)} aria-current={on(t) ? 'page' : undefined} onclick={() => go(t)}>
    <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
      {#if t === 'today'}
        <rect x="3" y="4" width="16" height="15" rx="2" class="a" />
        <path d="M3 9h16M8 2v4M14 2v4" class="a" />
        <rect x="7" y="12" width="4" height="4" rx="1" class="fill" />
      {:else if t === 'habits'}
        <circle cx="11" cy="11" r="8" class="a soft" />
        <circle cx="11" cy="11" r="8" class="b arc" />
      {:else if t === 'goals'}
        <circle cx="11" cy="11" r="8" class="a" />
        <circle cx="11" cy="11" r="4" class="a" />
        <circle cx="11" cy="11" r="1.8" class="fill" />
      {:else}
        <path d="M5 18V11M17 18v-9" class="a thick" />
        <path d="M11 18V5" class="b thick" />
      {/if}
    </svg>
    <span>{label}</span>
    {#if t === 'review' && P.dueReview}<i class="due" aria-label="A review is waiting"></i>{/if}
  </button>
{/snippet}

<nav class="bar" aria-label="Main">
  {#each LEFT as [t, l] (t)}{@render tab(t, l)}{/each}
  <button class="add" aria-label="Add task" onclick={add}>
    <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><path d="M11 4v14M4 11h14" /></svg>
  </button>
  {#each RIGHT as [t, l] (t)}{@render tab(t, l)}{/each}
</nav>

<style>
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: start;
    height: calc(var(--bar-h) + 20px + env(safe-area-inset-bottom));
    padding: 6px 8px calc(14px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    background: var(--raised);
    border-top: 1px solid var(--border);
  }
  .tab {
    position: relative;
    justify-self: center;
    width: 66px;
    height: 52px;
    padding: 0;
    border: none;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font: 400 11px/1 var(--font);
    cursor: pointer;
  }
  /* The screen you're on: an open tab, joined to the page above it. */
  .tab.on {
    margin-top: -7px;
    height: 59px;
    padding-top: 7px;
    box-sizing: border-box;
    border-radius: 0 0 10px 10px;
    background: var(--bg);
    box-shadow:
      inset 1px 0 0 var(--tab-in),
      inset -1px 0 0 var(--tab-in),
      inset 0 -1px 0 var(--tab-in);
    color: var(--text);
    font-weight: 600;
  }
  .tab:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: -2px;
  }
  svg {
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .a {
    stroke: var(--accent);
  }
  .b {
    stroke: var(--now);
  }
  .fill {
    fill: var(--now);
    stroke: none;
  }
  .soft {
    stroke-opacity: 0.35;
  }
  .arc {
    stroke-width: 2.4;
    stroke-dasharray: 34 50.3;
    transform: rotate(-90deg);
    transform-origin: 11px 11px;
  }
  .thick {
    stroke-width: 2;
  }
  .due {
    position: absolute;
    top: 6px;
    left: calc(50% + 9px);
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--now);
    box-shadow: 0 0 0 2px var(--raised);
  }
  .tab.on .due {
    top: 13px;
    box-shadow: 0 0 0 2px var(--bg);
  }
  /* Add task: raised over the bar's edge, with the soft stripe as its border. */
  .add {
    justify-self: center;
    width: 54px;
    height: 54px;
    margin-top: -15px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 12px;
    background:
      linear-gradient(var(--text), var(--text)) padding-box,
      linear-gradient(135deg, var(--rainbow-stops)) border-box;
    color: var(--bg);
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: 0 8px 16px -6px rgba(0, 0, 0, 0.4);
  }
  .add svg {
    stroke: currentColor;
    stroke-width: 2;
  }
  @media (min-width: 768px) {
    .bar {
      left: 50%;
      right: auto;
      width: min(780px, 100%);
      translate: -50% 0;
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
      border-radius: 14px 14px 0 0;
    }
  }
</style>
