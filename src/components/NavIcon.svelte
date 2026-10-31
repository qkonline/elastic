<script lang="ts">
  import type { Tab } from '../lib/nav';

  // The two-tone glyphs of the bottom bar and the sidebar: an indigo outline with a rose accent.
  let { t }: { t: Tab } = $props();
</script>

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

<style>
  svg {
    flex: none;
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
</style>
