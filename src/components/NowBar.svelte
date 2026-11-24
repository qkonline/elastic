<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { planner as P } from '../lib/planner.svelte';
  import { isOver, worked } from '../lib/schedule';
  import { cd, dL } from '../lib/time';
  import { hueColor, untimed } from '../lib/types';
  import { reducedMotion } from '../lib/ui.svelte';

  // Above the bottom bar on Today: the task under way while its row is scrolled out of sight, with
  // Pause and Done, and for a while after one is finished, what's up next, with Start.
  const here = $derived(
    P.screen.type === 'today' && P.view === 'day' && P.isToday && P.day.dayStarted != null && !P.locked && !P.sheet,
  );
  const act = $derived(here && !isOver(P.day, P.n) ? P.active : null);
  const left = $derived(act ? (act.card ? worked(act, P.n) * 60 : (act.min - worked(act, P.n)) * 60) : 0);

  // Whether the running row can be seen (under the header and above the bar).
  let seen = $state(true);
  $effect(() => {
    const id = act?.id;
    seen = true;
    if (!id) return;
    let io: IntersectionObserver | null = null;
    // The row is drawn (and redrawn) by the timeline: look once it's there.
    const t = setTimeout(() => {
      const row = document.querySelector('ol .row.active .ctls') ?? document.querySelector('ol .row.active');
      if (!row) return;
      io = new IntersectionObserver(([e]) => (seen = e.isIntersecting), { rootMargin: '-110px 0px -90px 0px' });
      io.observe(row);
    }, 100);
    return () => {
      clearTimeout(t);
      io?.disconnect();
    };
  });

  const next = $derived(
    here && !act && !P.confirm && P.upNext
      ? P.day.items.find((i) => i.id === P.upNext!.id && i.status === 'todo' && !untimed(i.kind))
      : null,
  );
  // The message sits above it.
  $effect(() => {
    document.documentElement.style.setProperty('--nowbar', (act && !seen) || next ? '62px' : '0px');
    return () => document.documentElement.style.removeProperty('--nowbar');
  });
  const go = () =>
    document
      .querySelector('ol .row.active')
      ?.scrollIntoView({ block: 'center', behavior: reducedMotion.current ? 'auto' : 'smooth' });
  const slide = { y: 20, duration: reducedMotion.current ? 0 : 200, easing: cubicOut };
</script>

{#if act && !seen}
  <div class="bar" role="group" aria-label="Under way" style:--c={hueColor(act.hue)} transition:fly={slide}>
    <button class="what" onclick={go}>
      <span class="t">{act.title}</span>
      <span class="s" class:over={left < 0}
        >{left >= 0 ? cd(left) : '+' + cd(-left)}
        {act.status === 'paused' ? 'paused' : act.card ? 'so far' : left >= 0 ? 'left' : 'over'}</span
      >
    </button>
    <button
      class="k"
      aria-label="{act.status === 'running' ? 'Pause' : 'Resume'} {act.title}"
      onclick={() => (act.status === 'running' ? P.pause(act.id) : P.resume(act.id))}
      >{act.status === 'running' ? 'Pause' : 'Resume'}</button
    >
    <button class="k pri" aria-label="Done {act.title}" onclick={() => P.done(act.id)}>Done</button>
  </div>
{:else if next}
  <div class="bar" role="group" aria-label="Up next" style:--c={hueColor(next.hue)} transition:fly={slide}>
    <button class="what" onclick={() => P.openSheet({ type: 'task', id: next.id })}>
      <span class="s">Up next</span>
      <span class="t">{next.title} <span class="s">{dL(next.min)}</span></span>
    </button>
    <button class="k x" aria-label="Not now" onclick={() => (P.upNext = null)}>×</button>
    <button class="k pri" data-focus aria-label="Start {next.title} next" onclick={() => P.startItem(next.id)}
      >Start</button
    >
  </div>
{/if}

<style>
  .bar {
    position: fixed;
    z-index: 5;
    left: 12px;
    right: 12px;
    bottom: calc(var(--bar-h) + 24px + env(safe-area-inset-bottom) - var(--stuck, 0px));
    max-width: 560px;
    margin: 0 auto;
    min-height: 60px;
    box-sizing: border-box;
    padding: 8px 8px 8px 16px;
    border-radius: var(--r-card);
    border: 1px solid var(--line);
    background:
      linear-gradient(var(--c), var(--c)) left / 6px 100% no-repeat,
      var(--raised);
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 10px 28px -10px rgba(15, 23, 42, 0.4);
  }
  @media (min-width: 768px) {
    .bar {
      left: calc(var(--side-w) + 16px);
      right: calc(var(--dock-w) + 16px);
      bottom: 24px;
    }
  }
  .what {
    all: unset;
    flex: 1;
    min-width: 0;
    min-height: 44px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    cursor: pointer;
  }
  .what:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: -2px;
    border-radius: var(--r-sm);
  }
  .t {
    font: 500 15px/1.25 var(--font);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .s {
    font: 400 13px/1.2 var(--font);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .s.over {
    color: var(--redT);
  }
  .k {
    flex: none;
    height: 44px;
    padding: 0 14px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .k.x {
    width: 44px;
    padding: 0;
    border: none;
    color: var(--muted);
    font-size: 20px;
  }
  .k.pri {
    border-color: var(--text);
    background: var(--text);
    color: var(--bg);
  }
</style>
