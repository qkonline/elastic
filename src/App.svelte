<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { MediaQuery } from 'svelte/reactivity';
  import Account from './components/Account.svelte';
  import AddTask from './components/AddTask.svelte';
  import Celebration from './components/Celebration.svelte';
  import Checklist from './components/Checklist.svelte';
  import ComingUp from './components/ComingUp.svelte';
  import DayFooter from './components/DayFooter.svelte';
  import DayHours from './components/DayHours.svelte';
  import DayStatus from './components/DayStatus.svelte';
  import EmptyState from './components/EmptyState.svelte';
  import HabitSheet from './components/HabitSheet.svelte';
  import Header from './components/Header.svelte';
  import InstallGuide from './components/InstallGuide.svelte';
  import NotifyPrompt from './components/NotifyPrompt.svelte';
  import PullIndicator from './components/PullIndicator.svelte';
  import ReorderAsk from './components/ReorderAsk.svelte';
  import RunningElsewhere from './components/RunningElsewhere.svelte';
  import StartDay from './components/StartDay.svelte';
  import StartFirst from './components/StartFirst.svelte';
  import Settings from './components/Settings.svelte';
  import Sheet from './components/Sheet.svelte';
  import TaskSheet from './components/TaskSheet.svelte';
  import Timeline from './components/Timeline.svelte';
  import WeekStrip from './components/WeekStrip.svelte';
  import Welcome from './components/Welcome.svelte';
  import WrapUp from './components/WrapUp.svelte';
  import { dayGestures, gestures } from './lib/gestures.svelte';
  import { planner as P, type Sheet as SheetState } from './lib/planner.svelte';
  import { untimed } from './lib/types';
  import { reducedMotion } from './lib/ui.svelte';

  const prefersDark = new MediaQuery('(prefers-color-scheme: dark)', false);

  // Changing day is a slideshow: the day on screen slides out one way while the next slides in
  // right behind it, edge to edge. A later day comes in from the right, an earlier one from the
  // left. After a swipe the motion starts from wherever the finger let go.
  const DAY_MS = 320;
  let slide = { dir: 1, from: 0 };
  let shownKey = untrack(() => P.viewKey);
  $effect.pre(() => {
    const key = P.viewKey;
    untrack(() => {
      if (key === shownKey) return;
      slide = { dir: key > shownKey ? 1 : -1, from: gestures.releaseDx };
      shownKey = key;
      gestures.releaseDx = 0;
    });
  });
  // Both run on the same linear clock with the easing applied here, so the two days stay joined.
  function dayIn(node: HTMLElement) {
    if (reducedMotion.current) return { duration: 0 };
    const start = slide.dir * node.offsetWidth + slide.from;
    return { duration: DAY_MS, css: (t: number) => `transform: translateX(${start * (1 - cubicOut(t))}px)` };
  }
  function dayOut(node: HTMLElement) {
    if (reducedMotion.current) return { duration: 0 };
    const { from } = slide;
    const end = -slide.dir * node.offsetWidth;
    return {
      duration: DAY_MS,
      css: (_t: number, u: number) => `transform: translateX(${from + (end - from) * cubicOut(u)}px)`,
    };
  }

  // A sheet keeps its contents while it animates away, after P.sheet has already been cleared.
  let lastSheet: SheetState | null = null;
  const shownSheet = $derived.by(() => (P.sheet ? (lastSheet = P.sheet) : lastSheet));
  const theme = $derived(
    P.settings.themePref === 'match' ? (prefersDark.current ? 'dark' : 'light') : P.settings.themePref,
  );

  onMount(() => {
    void P.init().then(() => {
      // The installed app's "Add task" shortcut opens with ?add.
      const url = new URL(location.href);
      if (P.ready && url.searchParams.has('add')) {
        P.openSheet({ type: 'add' });
        url.searchParams.delete('add');
        history.replaceState(null, '', url);
      }
    });
    return () => P.destroy();
  });

  $effect(() => {
    const root = document.documentElement;
    if (P.settings.themePref === 'match') delete root.dataset.theme;
    else root.dataset.theme = P.settings.themePref;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
      m.setAttribute('content', theme === 'dark' ? '#0e1014' : '#f6f7f9');
      m.removeAttribute('media');
    }
  });

  // Anything covering the page keeps keyboard and screen readers out of it.
  const covered = $derived(!!P.sheet || P.showWelcome || !!P.celebrate);
  $effect(() => {
    document.body.classList.toggle('locked', covered);
  });
  const timed = $derived(P.day.items.some((i) => !untimed(i.kind)));

  const LABELS = {
    task: 'Edit task',
    hours: 'Day hours',
    add: 'New task',
    settings: 'Settings',
    install: 'Install',
    wrapup: 'End your day',
    account: 'Sync across devices',
    reorder: 'Later days',
  } as const;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && P.sheet && P.closeSheet()} />

{#if P.failed}
  <div class="failed">
    <h1>Elastic Day can't start here</h1>
    <p>
      This browser won't let the planner store anything (private browsing or blocked site data can do this), so there is
      nowhere to keep your plan. Try a normal window, or allow site data for this page.
    </p>
    <p class="detail">{P.failed}</p>
  </div>
{:else if P.ready}
  <!-- inert: while a sheet or the welcome is open, keyboard and screen readers stay inside it. -->
  <div class="page" inert={covered} {@attach dayGestures(P)}>
    <Header />
    <WeekStrip />
    <StartDay />
    <RunningElsewhere />
    <ComingUp />
    <NotifyPrompt />
    <main
      class:settling={!gestures.dragging}
      style:transform={gestures.pull ? `translateY(${gestures.pull * 0.6}px)` : undefined}
    >
      {#key P.viewKey}
        <div
          class="day"
          class:settling={!gestures.dragging}
          style:transform={gestures.dx ? `translateX(${gestures.dx}px)` : undefined}
          in:dayIn
          out:dayOut
        >
          {#if P.day.items.length === 0}
            <EmptyState />
          {:else}
            <DayStatus />
            {#if P.settings.habitsPlace === 'separate'}
              <Checklist mode="habits" />
              <Checklist mode="checks" />
            {:else}
              <Checklist mode="both" />
            {/if}
            {#if timed}<Timeline />{/if}
          {/if}
          <DayFooter />
        </div>
      {/key}
    </main>
  </div>
  <PullIndicator />
  <StartFirst />

  <button
    class="fab"
    aria-label="Add task"
    inert={covered}
    onclick={() => (P.locked ? P.sayLocked() : P.openSheet({ type: 'add' }))}
  >
    <span class="plus">+</span><span>Add task</span>
  </button>

  {#if P.sheet && shownSheet}
    {#key shownSheet.type === 'task' ? 'task-' + shownSheet.id : shownSheet.type}
      <Sheet
        variant={shownSheet.type === 'add'
          ? 'form'
          : shownSheet.type === 'hours' ||
              shownSheet.type === 'install' ||
              shownSheet.type === 'wrapup' ||
              shownSheet.type === 'reorder'
            ? 'small'
            : 'full'}
        label={LABELS[shownSheet.type]}
      >
        {#if shownSheet.type === 'task' && P.item(shownSheet.id)?.kind === 'habit'}
          <HabitSheet id={shownSheet.id} />
        {:else if shownSheet.type === 'task'}
          <TaskSheet id={shownSheet.id} />
        {:else if shownSheet.type === 'add'}
          <AddTask />
        {:else if shownSheet.type === 'hours'}
          <DayHours />
        {:else if shownSheet.type === 'install'}
          <InstallGuide />
        {:else if shownSheet.type === 'wrapup'}
          <WrapUp />
        {:else if shownSheet.type === 'reorder'}
          <ReorderAsk id={shownSheet.id} anchor={shownSheet.anchor} dir={shownSheet.dir} />
        {:else if shownSheet.type === 'account'}
          <Account />
        {:else}
          <Settings />
        {/if}
      </Sheet>
    {/key}
  {/if}

  {#if P.showWelcome}
    <Welcome />
  {/if}

  {#if P.celebrate}
    {#key P.celebrate}
      <Celebration c={P.celebrate} />
    {/key}
  {/if}
{/if}

<div class="sr-only" aria-live="polite">{P.announce}</div>

<style>
  /* Days overlap in one grid cell while one slides out and the next slides in. */
  main {
    display: grid;
    overflow-x: clip;
  }
  .day {
    grid-area: 1 / 1;
    min-width: 0;
  }
  main.settling,
  .day.settling {
    transition: transform 220ms ease;
  }
  .page {
    display: block;
    max-width: none;
    /* Fill the screen even when the day is short, so a swipe anywhere changes day. */
    min-height: 100dvh;
    margin: 0 auto;
    padding: 0 0 calc(96px + env(safe-area-inset-bottom));
    box-sizing: border-box;
  }
  @media (min-width: 768px) {
    .page {
      max-width: 780px;
    }
  }
  .fab {
    position: fixed;
    right: 20px;
    bottom: calc(40px + env(safe-area-inset-bottom));
    z-index: 5;
    height: 52px;
    padding: 0 22px 0 18px;
    border-radius: 999px;
    border: 2.5px solid transparent;
    background:
      linear-gradient(#334155, #334155) padding-box,
      conic-gradient(from 200deg, #fb923c, #fde047, #a3e635, #22d3ee, #818cf8, #fb923c) border-box;
    color: #f8fafc;
    display: flex;
    align-items: center;
    gap: 8px;
    font: 400 15px/1 var(--font);
    box-shadow:
      0 10px 28px -8px rgba(15, 23, 42, 0.45),
      0 2px 6px rgba(15, 23, 42, 0.18);
    cursor: pointer;
  }
  @media (min-width: 768px) {
    .fab {
      right: max(28px, calc((100% - 780px) / 2));
      bottom: 28px;
    }
  }
  .plus {
    font: 300 26px/1 var(--font);
    margin-top: -3px;
  }
  .failed {
    max-width: 480px;
    margin: 15vh auto 0;
    padding: 0 24px;
  }
  .failed h1 {
    font: 400 22px/1.3 var(--font);
    letter-spacing: -0.01em;
  }
  .failed p {
    font: 400 15px/1.5 var(--font);
    color: var(--muted);
  }
  .failed .detail {
    font-size: 13px;
    color: var(--faint);
  }
</style>
