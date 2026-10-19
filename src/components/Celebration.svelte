<script lang="ts" module>
  /** The day's colours (Start my day) and the evening's (End my day). */
  export const DAY = ['#818cf8', '#a78bfa', '#c084fc', '#f472b6', '#f43f5e'];
  export const DUSK = ['#a78bfa', '#c084fc', '#e879f9', '#fb7185', '#818cf8'];
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { launch } from '../lib/confetti';
  import { planner as P, type Celebration } from '../lib/planner.svelte';
  import { dL, fNZ } from '../lib/time';
  import { reducedMotion } from '../lib/ui.svelte';

  // A short full-screen moment after Start my day (the day taking off) or End my day (a day
  // done). It goes by itself, or with a tap.
  let { c: cProp }: { c: Celebration } = $props();
  const c = untrack(() => cProp);
  const still = reducedMotion.current;
  let canvas: HTMLCanvasElement | null = $state(null);

  const close = () => {
    if (P.celebrate === cProp) P.celebrate = null;
  };

  const summary = $derived.by(() => {
    if (c.kind !== 'end') return '';
    const s = c.stats;
    const parts = [
      s.tasks ? `${s.tasksDone} of ${s.tasks} tasks done` : null,
      s.logged >= 1 ? `${dL(s.logged)} logged` : null,
    ];
    const line = parts.filter(Boolean).join(', ');
    return (line ? line + '.' : 'Rest well.') + (c.moved ? ` ${c.moved} moved to tomorrow.` : '');
  });

  onMount(() => {
    const stop =
      still || !canvas
        ? () => {}
        : launch(
            canvas,
            c.kind === 'start'
              ? { colours: DAY, mode: 'rise' }
              : { colours: DUSK, mode: 'fall', origin: { x: 0.5, y: 0.38 } },
          );
    const t = setTimeout(close, still ? 1500 : c.kind === 'start' ? 2000 : 3000);
    return () => {
      stop();
      clearTimeout(t);
    };
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<!-- Decorative; the same news is announced to screen readers as it happens. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="cel {c.kind}"
  class:still
  aria-hidden="true"
  onclick={close}
  out:fade|global={{ duration: still ? 0 : 280 }}
>
  <div class="glow"></div>
  <canvas bind:this={canvas}></canvas>
  <div class="msg">
    {#if c.kind === 'start'}
      <span class="big">Let's go.</span>
      <span class="thread"></span>
      <span class="sub">
        Day started at {fNZ(c.at, P.settings.clock24)}.{#if c.first}<br />First up: {c.first}.{/if}
      </span>
    {:else}
      <svg class="ring" viewBox="0 0 96 96" width="96" height="96">
        <defs>
          <linearGradient id="dusk-ring" x1="0" y1="0" x2="1" y2="1">
            {#each DUSK as col, i (col)}<stop offset={i / (DUSK.length - 1)} stop-color={col} />{/each}
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r="42" pathLength="100" />
        <path d="M30 49.5 42.5 62 67 36" pathLength="100" />
      </svg>
      <span class="big">Day done.</span>
      <span class="sub">{summary}</span>
    {/if}
  </div>
</div>

<style>
  .cel {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: color-mix(in oklab, var(--bg) 80%, transparent);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    animation: veil 260ms ease-out both;
    cursor: pointer;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  /* Start: a sunrise swelling up from the bottom edge. */
  .glow {
    position: absolute;
    left: 50%;
    width: 150vmax;
    height: 150vmax;
    border-radius: 50%;
    pointer-events: none;
  }
  .start .glow {
    top: 100%;
    background: radial-gradient(
      closest-side,
      rgba(253, 224, 71, 0.55),
      rgba(244, 63, 94, 0.28) 38%,
      rgba(34, 211, 238, 0.12) 66%,
      transparent
    );
    animation: sunrise 1500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  /* End: the evening sky settling around the check. */
  .end .glow {
    top: 38%;
    background: radial-gradient(
      closest-side,
      rgba(232, 121, 249, 0.34),
      rgba(251, 113, 133, 0.2) 30%,
      rgba(96, 165, 250, 0.12) 55%,
      transparent
    );
    animation: dusk 1800ms ease-out both;
  }
  .msg {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 0 32px;
    text-align: center;
    animation: arrive 620ms cubic-bezier(0.2, 0.9, 0.25, 1.15) 120ms both;
  }
  .end .msg {
    margin-top: -6vh;
  }
  .big {
    font: 600 56px/1 var(--font);
    letter-spacing: -0.035em;
    color: var(--text);
  }
  .sub {
    max-width: 300px;
    font: 400 16px/1.45 var(--font);
    color: var(--muted);
    text-wrap: balance;
  }
  /* The day's thread from the status line, drawn under the words. */
  .thread {
    width: 168px;
    height: 5px;
    border-radius: 99px;
    background: linear-gradient(90deg, var(--rainbow-stops));
    transform-origin: left;
    animation: draw 760ms cubic-bezier(0.6, 0, 0.2, 1) 300ms both;
  }
  .ring {
    margin-bottom: 6px;
    overflow: visible;
  }
  .ring circle,
  .ring path {
    fill: none;
    stroke: url(#dusk-ring);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 100;
  }
  .ring circle {
    animation: stroke 700ms cubic-bezier(0.6, 0, 0.3, 1) 150ms both;
    transform: rotate(-90deg);
    transform-box: fill-box;
    transform-origin: center;
  }
  .ring path {
    stroke-width: 6;
    animation: stroke 420ms cubic-bezier(0.5, 0, 0.3, 1) 700ms both;
  }
  .still,
  .still * {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
  }
  @keyframes veil {
    from {
      opacity: 0;
    }
  }
  @keyframes sunrise {
    from {
      transform: translate(-50%, -8%) scale(0.35);
      opacity: 0;
    }
    to {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
  }
  @keyframes dusk {
    from {
      transform: translate(-50%, -50%) scale(0.2);
      opacity: 0;
    }
    to {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.92);
    }
  }
  @keyframes draw {
    from {
      transform: scaleX(0);
    }
  }
  @keyframes stroke {
    from {
      stroke-dashoffset: 100;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
