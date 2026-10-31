<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { addLabel, addTask, go, TABS, type Tab } from '../lib/nav';
  import { prefersDark } from '../lib/ui.svelte';
  import NavIcon from './NavIcon.svelte';

  // iPads and computers: the sidebar in place of the phone's bottom bar. From 1240px it's wide
  // (the mark beside the name, Add task as a full-width key, icon and word in a row); narrower
  // it's 88px (the mark over a small name, Add task as a square key with its word under it, icon
  // over word). Add task stays the only solid key, so it never competes with the mark. The
  // screen you're on is an open tab joined to the page, like the bottom bar's. The theme switch
  // and Settings sit at the bottom (the header shows them only on phones).
  const on = (t: Tab) => P.screen.type === t;
  const dark = $derived(P.settings.themePref === 'match' ? prefersDark.current : P.settings.themePref === 'dark');
</script>

<nav class="side" aria-label="Main">
  <div class="brand">
    <svg class="mark" viewBox="0 0 512 512" aria-hidden="true">
      <rect class="tile" width="512" height="512" rx="112" />
      <g fill="none" stroke-width="30" stroke-linecap="round">
        <path d="M86 346 A170 170 0 0 1 426 346" stroke="#818cf8" />
        <path d="M122 346 A134 134 0 0 1 390 346" stroke="#a78bfa" />
        <path d="M158 346 A98 98 0 0 1 354 346" stroke="#c084fc" />
        <path d="M194 346 A62 62 0 0 1 318 346" stroke="#f472b6" />
      </g>
      <path d="M226 346 A30 30 0 0 1 286 346 Z" fill="#f43f5e" />
    </svg>
    <span class="name">Elastic</span>
  </div>

  <button class="add" aria-label={addLabel()} onclick={addTask}>
    <span class="key" aria-hidden="true">
      <svg viewBox="0 0 22 22" width="20" height="20"><path d="M11 4v14M4 11h14" /></svg>
      <span class="in">{addLabel()}</span>
    </span>
    <span class="cap" aria-hidden="true">{addLabel()}</span>
  </button>

  <div class="tabs">
    {#each TABS as [t, label] (t)}
      <button class="tab" class:on={on(t)} aria-current={on(t) ? 'page' : undefined} onclick={() => go(t)}>
        <NavIcon {t} />
        <span class="l">{label}</span>
        {#if t === 'review' && P.dueReview}<i class="due" aria-label="A review is waiting"></i>{/if}
      </button>
    {/each}
  </div>

  <div class="foot">
    <button
      class="tab small"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onclick={() => P.setSettings({ themePref: dark ? 'light' : 'dark' })}
    >
      <svg class="line" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        {#if dark}
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
          />
        {:else}
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        {/if}
      </svg>
      <span class="l" aria-hidden="true"
        ><span class="long">{dark ? 'Light mode' : 'Dark mode'}</span><span class="short"
          >{dark ? 'Light' : 'Dark'}</span
        ></span
      >
    </button>
    <button
      class="tab small"
      class:on={P.screen.type === 'settings'}
      aria-current={P.screen.type === 'settings' ? 'page' : undefined}
      onclick={() => (P.screen.type === 'settings' ? P.leaveSettings() : P.openScreen({ type: 'settings' }))}
    >
      <svg class="hex" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
        ><path d="M12 2.6l8.1 4.7v9.4L12 21.4l-8.1-4.7V7.3z" /><circle cx="12" cy="12" r="3" /></svg
      >
      <span class="l">Settings</span>
    </button>
  </div>
</nav>

<style>
  .side {
    display: none;
  }
  @media (min-width: 768px) {
    /* Narrow (iPad): 88px, everything stacked and centred. */
    .side {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 5;
      width: var(--side-w);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      padding: calc(20px + env(safe-area-inset-top)) 0 calc(16px + env(safe-area-inset-bottom)) 8px;
      background: var(--raised);
      border-right: 1px solid var(--border);
      overflow-y: auto;
      scrollbar-width: none;
    }
    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding-right: 8px;
    }
    .mark {
      width: 40px;
      height: 40px;
      /* Narrow: the arcs on their own, so the mark doesn't read as a second key. */
      margin: -12px 0 -10px;
    }
    .tile {
      fill: transparent;
    }
    .name {
      font: 600 13px/1 var(--font);
      letter-spacing: -0.01em;
      color: var(--text);
    }

    .add {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin: 18px 8px 0 0;
      padding: 18px 0 0;
      border: none;
      border-top: 1px solid var(--border);
      background: transparent;
      color: var(--text);
      cursor: pointer;
    }
    .key {
      width: 48px;
      height: 48px;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      border: 1.5px solid transparent;
      border-radius: 11px;
      background:
        linear-gradient(var(--text), var(--text)) padding-box,
        linear-gradient(135deg, var(--rainbow-stops)) border-box;
      color: var(--bg);
      box-shadow: 0 6px 14px -6px rgba(0, 0, 0, 0.4);
    }
    .key svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
    }
    .in {
      display: none;
    }
    .cap {
      font: 500 12px/1 var(--font);
    }
    .add:focus-visible {
      outline: none;
    }
    .add:focus-visible .key {
      outline: 2px solid var(--text);
      outline-offset: 3px;
    }

    .tabs {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 22px;
    }
    .tab {
      position: relative;
      height: 62px;
      margin-right: 8px;
      padding: 0;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font: 400 12px/1 var(--font);
      cursor: pointer;
    }
    /* The screen you're on: an open tab, joined to the page beside it. */
    .tab.on {
      margin-right: -1px;
      border: 1px solid var(--tab-in);
      border-right: none;
      border-radius: 10px 0 0 10px;
      background: var(--bg);
      color: var(--text);
      font-weight: 600;
    }
    .tab:focus-visible {
      outline: 2px solid var(--text);
      outline-offset: -2px;
    }
    @media (hover: hover) {
      .tab:not(.on):hover {
        background: var(--sunk);
        color: var(--text);
      }
    }
    .due {
      position: absolute;
      top: 10px;
      left: calc(50% + 8px);
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--now);
      box-shadow: 0 0 0 2px var(--raised);
    }
    .tab.on .due {
      box-shadow: 0 0 0 2px var(--bg);
    }

    .foot {
      margin-top: auto;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      margin-right: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .foot .tab {
      margin-right: 0;
    }
    .foot .tab.on {
      margin-right: -9px;
    }
    .tab.small {
      height: 52px;
      gap: 5px;
      font-size: 11px;
    }
    .line {
      fill: none;
      stroke: var(--text);
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .hex path {
      fill: none;
      stroke: var(--accent);
      stroke-width: 1.8;
      stroke-linejoin: round;
    }
    .hex circle {
      fill: var(--now);
    }
    .long {
      display: none;
    }
  }

  /* Wide (computers from 1240px): the mark beside the name, rows of icon and word. */
  @media (min-width: 1240px) {
    .side {
      padding: calc(22px + env(safe-area-inset-top)) 0 calc(18px + env(safe-area-inset-bottom)) 16px;
    }
    .brand {
      flex-direction: row;
      gap: 10px;
      padding: 0 16px 0 4px;
      height: 36px;
    }
    .mark {
      width: 32px;
      height: 32px;
      margin: 0;
    }
    .tile {
      fill: #16181d;
      stroke: var(--border);
      stroke-width: 16;
    }
    .name {
      font-size: 21px;
      letter-spacing: -0.02em;
    }
    .add {
      margin: 26px 16px 0 0;
      padding: 0;
      border-top: none;
    }
    .key {
      width: 100%;
      height: 46px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border-radius: 9.5px;
    }
    .key svg {
      width: 18px;
      height: 18px;
    }
    .in {
      display: inline;
      font: 500 16px/1 var(--font);
    }
    .cap {
      display: none;
    }
    .tabs {
      gap: 2px;
      margin-top: 26px;
    }
    .tab {
      height: 46px;
      margin-right: 16px;
      padding: 0 12px;
      flex-direction: row;
      justify-content: flex-start;
      gap: 12px;
      border-radius: 8px;
      font-size: 16px;
    }
    .tab.on {
      margin-right: -1px;
      border-radius: 8px 0 0 8px;
    }
    .due {
      top: 50%;
      left: auto;
      right: 14px;
      margin-top: -3.5px;
    }
    .foot {
      margin-right: 16px;
      gap: 2px;
    }
    .foot .tab.on {
      margin-right: -17px;
    }
    .tab.small {
      height: 44px;
      gap: 12px;
      font-size: 15px;
    }
    .long {
      display: inline;
    }
    .short {
      display: none;
    }
  }
</style>
