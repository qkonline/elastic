<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { addTask, go, TABS, type Tab } from '../lib/nav';
  import NavIcon from './NavIcon.svelte';

  // Phones: Today, Habits, Goals and Review are screens of their own; Add task sits raised in the
  // middle. The screen you're on is an open tab joined to the page above. A dot on Review says a
  // review is waiting. iPads and computers get the sidebar instead (SideNav).
  const LEFT = TABS.slice(0, 2);
  const RIGHT = TABS.slice(2);
  const on = (t: Tab) => P.screen.type === t;
</script>

{#snippet tab(t: Tab, label: string)}
  <button class="tab" class:on={on(t)} aria-current={on(t) ? 'page' : undefined} onclick={() => go(t)}>
    <NavIcon {t} />
    <span>{label}</span>
    {#if t === 'review' && P.dueReview}<i class="due" aria-label="A review is waiting"></i>{/if}
  </button>
{/snippet}

<nav class="bar" aria-label="Main">
  {#each LEFT as [t, l] (t)}{@render tab(t, l)}{/each}
  <button class="add" aria-label="Add task" onclick={addTask}>
    <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><path d="M11 4v14M4 11h14" /></svg>
  </button>
  {#each RIGHT as [t, l] (t)}{@render tab(t, l)}{/each}
</nav>

<style>
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    /* Below the bottom of a page stuck short of the screen (see viewport.ts). */
    bottom: calc(0px - var(--stuck, 0px));
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
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  @media (min-width: 768px) {
    .bar {
      display: none;
    }
  }
</style>
