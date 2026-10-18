<script lang="ts">
  import { planner as P, type Sheet } from '../lib/planner.svelte';

  // Habits, Goals and Review: the longer view, each opening over the plan. A dot on Review says
  // a review is waiting.
  const ITEMS: { type: 'habits' | 'goals' | 'review'; label: string }[] = [
    { type: 'habits', label: 'Habits' },
    { type: 'goals', label: 'Goals' },
    { type: 'review', label: 'Review' },
  ];
  const open = (t: Sheet['type']) => P.sheet?.type === t;
</script>

<nav class="bar" aria-label="More">
  {#each ITEMS as item (item.type)}
    <button
      class="item"
      class:on={open(item.type)}
      aria-current={open(item.type) ? 'page' : undefined}
      onclick={() => P.openSheet({ type: item.type })}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        {#if item.type === 'habits'}
          <circle cx="12" cy="12" r="8" class="soft" />
          <path d="M12 4a8 8 0 0 1 7.6 10.5" />
        {:else if item.type === 'goals'}
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="0.8" class="dot" />
        {:else}
          <path d="M5 19V13M10 19V8M15 19v-4M20 19V5" />
        {/if}
      </svg>
      <span>{item.label}</span>
      {#if item.type === 'review' && P.dueReview}<i class="due" aria-label="A review is waiting"></i>{/if}
    </button>
  {/each}
</nav>

<style>
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    height: calc(var(--bar-h) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    box-sizing: border-box;
    background: color-mix(in oklab, var(--bg) 92%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-top: 1px solid var(--border);
  }
  .item {
    position: relative;
    border: none;
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
  .item.on,
  .item:hover {
    color: var(--text);
  }
  .item:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: -4px;
    border-radius: 12px;
  }
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .soft {
    opacity: 0.35;
  }
  .dot {
    fill: currentColor;
  }
  .due {
    position: absolute;
    top: 9px;
    left: calc(50% + 9px);
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--now);
    box-shadow: 0 0 0 2px var(--bg);
  }
  @media (min-width: 768px) {
    .bar {
      left: 50%;
      right: auto;
      width: min(780px, 100%);
      transform: translateX(-50%);
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
      border-radius: 16px 16px 0 0;
    }
  }
</style>
