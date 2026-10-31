<script lang="ts">
  import type { Snippet } from 'svelte';
  import { planner as P } from '../lib/planner.svelte';
  import { prefersDark } from '../lib/ui.svelte';
  import ComingUp from './ComingUp.svelte';
  import RunningElsewhere from './RunningElsewhere.svelte';
  import SaveError from './SaveError.svelte';

  // The top of every screen: a small line (the date, or a count) with the theme switch and
  // Settings beside it (on phones; an iPad or computer has them in the sidebar), then the
  // screen's title with its own controls (Day / Week / Month on the plan, the quarter on Goals).
  // Settings shows a back arrow instead of the two buttons.
  let {
    small,
    title,
    back,
    aside,
    children,
  }: {
    small?: string;
    title: string;
    /** Settings: go back to where it was opened from. */
    back?: () => void;
    /** Beside the small line, before the buttons (Back to today). */
    aside?: Snippet;
    /** Beside the title. */
    children?: Snippet;
  } = $props();

  const dark = $derived(P.settings.themePref === 'match' ? prefersDark.current : P.settings.themePref === 'dark');
</script>

<header class="header" class:with-back={!!back}>
  {#if back}
    <div class="top">
      <button class="icon back" aria-label="Back" onclick={back}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M11 3L5 9l6 6" /></svg>
      </button>
      <h1 class="title">{title}</h1>
    </div>
  {:else}
    <div class="top">
      <span class="small">{small}</span>
      {@render aside?.()}
      <div class="icons">
        <button
          class="icon"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onclick={() => P.setSettings({ themePref: dark ? 'light' : 'dark' })}
        >
          {#if dark}
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
              ><circle cx="12" cy="12" r="4" /><path
                d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
              /></svg
            >
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
              ><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg
            >
          {/if}
        </button>
        <button class="icon" aria-label="Settings" onclick={() => P.openScreen({ type: 'settings' })}>
          <svg class="hex" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M12 2.6l8.1 4.7v9.4L12 21.4l-8.1-4.7V7.3z" /><circle cx="12" cy="12" r="3" /></svg
          >
        </button>
      </div>
    </div>
    <div class="row">
      <h1 class="title">{title}</h1>
      {@render children?.()}
    </div>
  {/if}
</header>
<!-- The plan shows these itself; the other screens keep them in view too. -->
{#if P.screen.type !== 'today'}
  <SaveError />
  <RunningElsewhere />
  <ComingUp />
{/if}

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 4;
    height: calc(var(--header-h) + env(safe-area-inset-top));
    padding: calc(10px + env(safe-area-inset-top)) var(--px) 0 calc(var(--px) + 4px);
    box-sizing: border-box;
    background: var(--bg);
    box-shadow: 0 1px 0 var(--border);
    display: flex;
    flex-direction: column;
  }
  .header.with-back {
    height: auto;
    padding-left: calc(var(--px) - 8px);
    padding-bottom: 8px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
  }
  .small {
    flex: 1;
    min-width: 0;
    font: 400 13px/16px var(--font);
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icons {
    display: flex;
    margin-right: -6px;
  }
  /* iPads and computers have the theme switch and Settings in the sidebar. */
  @media (min-width: 768px) {
    .icons {
      display: none;
    }
  }
  .icon {
    width: 34px;
    height: 40px;
    padding: 0;
    border: none;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--text);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .icon.back {
    width: 44px;
    height: 44px;
  }
  .icon svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .icon .hex path {
    stroke: var(--accent);
    stroke-width: 2;
  }
  .icon .hex circle {
    fill: var(--now);
    stroke: none;
  }
  @media (hover: hover) {
    .icon:hover {
      background: var(--sunk);
    }
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 2px;
    min-height: 44px;
  }
  .title {
    margin: 0;
    min-width: 0;
    font: 600 32px/1.05 var(--font);
    letter-spacing: -0.025em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .with-back .title {
    font-size: 26px;
    letter-spacing: -0.02em;
  }
</style>
