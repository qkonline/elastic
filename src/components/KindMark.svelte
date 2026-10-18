<script lang="ts">
  import { hueColor, inkOn, type Hue, type Kind } from '../lib/types';

  // How each type looks around the app: a task is a dot in its colour, a buffer an empty dashed
  // ring (time kept free), a fixed time a clock face in its colour, a habit a ring most of the
  // way round (like its progress ring).
  let { kind, hue, size = 12 }: { kind: Kind; hue: Hue; size?: number } = $props();
</script>

<svg class="mark" width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
  {#if kind === 'buffer'}
    <!-- Eight even dashes round the ring. -->
    <circle class="ring" cx="6" cy="6" r="5" stroke-dasharray="2.2 1.727" />
  {:else if kind === 'fixed'}
    <circle cx="6" cy="6" r="5.6" fill={hueColor(hue)} />
    <path class="hands" d="M6 2.8V6l2.2 1.4" stroke={inkOn(hue)} />
  {:else if kind === 'habit'}
    <circle class="track" cx="6" cy="6" r="4.6" stroke={hueColor(hue)} />
    <circle
      class="arc"
      cx="6"
      cy="6"
      r="4.6"
      stroke={hueColor(hue)}
      stroke-dasharray="21.7 28.9"
      transform="rotate(-90 6 6)"
    />
  {:else}
    <circle cx="6" cy="6" r="5" fill={hueColor(hue)} />
  {/if}
</svg>

<style>
  .mark {
    flex: none;
    display: block;
  }
  .ring {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    opacity: 0.7;
  }
  .track,
  .arc {
    fill: none;
    stroke-width: 1.8;
  }
  .track {
    opacity: 0.32;
  }
  .arc {
    stroke-linecap: round;
  }
  .hands {
    fill: none;
    stroke-width: 1.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
