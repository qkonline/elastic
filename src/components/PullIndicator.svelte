<script lang="ts">
  import { gestures, PULL } from '../lib/gestures.svelte';

  // The circle that slides down under the header while pulling to refresh.
  const progress = $derived(Math.min(1, gestures.pull / PULL));
</script>

{#if gestures.pull > 0 || gestures.refreshing}
  <div
    class="pull"
    class:settling={!gestures.dragging}
    style:transform="translate(-50%, {gestures.pull - 44}px)"
    style:opacity={gestures.refreshing ? 1 : progress}
    aria-hidden="true"
  >
    <span class="icon" class:spin={gestures.refreshing} class:ready={progress >= 1} style:rotate="{progress * 270}deg"
      >↻</span
    >
  </div>
{/if}

<style>
  .pull {
    position: fixed;
    left: 50%;
    top: calc(var(--header-h) + env(safe-area-inset-top));
    z-index: 3;
    width: 36px;
    height: 36px;
    border-radius: 99px;
    background: var(--raised);
    border: 1px solid var(--border);
    box-shadow: 0 4px 14px -4px rgba(0, 0, 0, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .pull.settling {
    transition:
      transform 200ms ease,
      opacity 200ms ease;
  }
  .icon {
    font: 400 18px/1 var(--font);
    color: var(--muted);
    transition: color 150ms;
  }
  .icon.ready {
    color: var(--orT);
  }
  .icon.spin {
    color: var(--orT);
    animation: spin 700ms linear infinite;
  }
  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
  @media (min-width: 768px) {
    .pull {
      left: calc((100vw + var(--side-w) - var(--dock-w)) / 2);
    }
  }
</style>
