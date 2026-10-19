<script lang="ts">
  import { untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { planner as P } from '../lib/planner.svelte';
  import { reducedMotion } from '../lib/ui.svelte';

  // Today's plan waits here until the day is started; the tasks' Start buttons and the
  // checklist stay off until then (so a day of only checks needs it too), and the plan below is
  // dimmed (still editable). Once pressed, the button folds away and the plan comes up to colour.
  const show = $derived(P.startPending);
  const fold = () => ({ duration: reducedMotion.current ? 0 : 280, easing: cubicOut });

  // Tapping a check or a Start button too early (P.nudge) calls this button out: it comes into
  // view if it was scrolled away, jumps and shakes, and keeps a ring and a glow while the
  // "start your day first" message is up. With reduced motion, just the ring and the glow.
  let btn = $state<HTMLButtonElement>();
  const called = $derived(!!P.nudge);
  const JUMP: Keyframe[] = [
    { transform: 'none', easing: 'cubic-bezier(.2,.7,.3,1)' },
    { transform: 'translateY(-14px) scale(1.04)', offset: 0.16, easing: 'cubic-bezier(.5,0,.8,.4)' },
    { transform: 'none', offset: 0.32, easing: 'cubic-bezier(.2,.7,.3,1)' },
    { transform: 'translateY(-6px)', offset: 0.42, easing: 'cubic-bezier(.5,0,.8,.4)' },
    { transform: 'none', offset: 0.52 },
    { transform: 'translateX(-7px) rotate(-2.5deg)', offset: 0.6 },
    { transform: 'translateX(7px) rotate(2.5deg)', offset: 0.68 },
    { transform: 'translateX(-5px) rotate(-1.5deg)', offset: 0.76 },
    { transform: 'translateX(5px) rotate(1.5deg)', offset: 0.84 },
    { transform: 'translateX(-2px)', offset: 0.92 },
    { transform: 'none' },
  ];
  $effect(() => {
    if (!P.nudge?.at || !btn) return;
    untrack(() => callOut(btn!));
  });
  function callOut(el: HTMLElement) {
    const still = reducedMotion.current;
    const r = el.getBoundingClientRect();
    const top = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const away = r.top < top || r.bottom > innerHeight;
    if (away) el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    if (still) return;
    // After a scroll, jump once it has arrived.
    setTimeout(() => el.animate(JUMP, { duration: 1000 }), away ? 450 : 0);
  }
</script>

{#if show}
  <div class="start-row" transition:slide={fold()}>
    <button class="start-day" class:called bind:this={btn} onclick={() => P.startDay()}>
      <span class="in">
        <svg width="20" height="20" viewBox="0 1.9 20 20" aria-hidden="true"
          ><path d="M5.8 14.5a4.2 4.2 0 0 1 8.4 0" /><path
            d="M2.5 14.5h15M6.5 17.3h7M10 5.4v2M4.6 8.2l1.3 1.3M15.4 8.2l-1.3 1.3"
          /></svg
        >
        <span class="word">Start my day</span>
      </span>
    </button>
  </div>
{/if}

<style>
  .start-row {
    /* Keeps the glow behind the button, not behind the page. */
    isolation: isolate;
    display: flex;
    justify-content: center;
    padding: 16px var(--px) 4px;
  }
  /* A raised key: a solid edge under it that it presses down onto. */
  .start-day {
    position: relative;
    width: 248px;
    height: 58px;
    padding: 0;
    border: none;
    border-radius: 10px;
    /* The soft stripe along the top, painted inside the key so its corners follow the key's. */
    background:
      linear-gradient(90deg, var(--rainbow-stops)) top / 100% 4px no-repeat,
      var(--text);
    color: var(--bg);
    display: flex;
    flex-direction: column;
    overflow: visible;
    cursor: pointer;
    box-shadow:
      0 4px 0 #000,
      0 10px 20px -8px rgba(22, 24, 29, 0.55);
    transition:
      translate 90ms ease,
      box-shadow 90ms ease,
      filter 200ms;
  }
  .start-day:active {
    translate: 0 4px !important;
    scale: none !important;
    filter: none !important;
    box-shadow:
      0 0 0 #000,
      0 2px 6px -2px rgba(22, 24, 29, 0.4);
  }
  .in {
    flex: 1;
    padding-top: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .in svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .word {
    font: 600 16px/1 var(--font-display);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  /* Called out: a ring in the ink colour, set off by a gap, and the stripe's colours glowing behind. */
  .start-day.called {
    box-shadow:
      0 4px 0 #000,
      0 0 0 3px var(--bg),
      0 0 0 5.5px var(--text);
  }
  .start-day::before {
    content: '';
    position: absolute;
    inset: -12px;
    z-index: -1;
    border-radius: 16px;
    background: linear-gradient(90deg, var(--rainbow-stops));
    filter: blur(16px);
    opacity: 0;
    transition: opacity 300ms ease;
    pointer-events: none;
  }
  .start-day.called::before {
    opacity: 0.7;
    animation: glow 1.4s ease-in-out infinite alternate;
  }
  @keyframes glow {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 0.8;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .start-day.called::before {
      animation: none;
    }
    .start-day:active {
      translate: none !important;
    }
  }
  @media (hover: hover) {
    .start-day:hover {
      filter: brightness(1.12);
    }
  }
</style>
