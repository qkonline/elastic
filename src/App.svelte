<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import Account from './components/Account.svelte';
  import AddTask from './components/AddTask.svelte';
  import Celebration from './components/Celebration.svelte';
  import Checklist from './components/Checklist.svelte';
  import ComingUp from './components/ComingUp.svelte';
  import DayFooter from './components/DayFooter.svelte';
  import DayHours from './components/DayHours.svelte';
  import DayStrip from './components/DayStrip.svelte';
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
  import Projects from './components/Projects.svelte';
  import ProjectCard from './components/ProjectCard.svelte';
  import Timeline from './components/Timeline.svelte';
  import WeekStrip from './components/WeekStrip.svelte';
  import Welcome from './components/Welcome.svelte';
  import BottomBar from './components/BottomBar.svelte';
  import Goals from './components/Goals.svelte';
  import HabitsScreen from './components/HabitsScreen.svelte';
  import Review from './components/Review.svelte';
  import ReviewDue from './components/ReviewDue.svelte';
  import WeekView from './components/WeekView.svelte';
  import MonthView from './components/MonthView.svelte';
  import { mondayOf } from './lib/time';
  import WrapUp from './components/WrapUp.svelte';
  import { dayGestures, gestures } from './lib/gestures.svelte';
  import { planner as P, type Sheet as SheetState } from './lib/planner.svelte';
  import { untimed } from './lib/types';
  import { prefersDark, reducedMotion } from './lib/ui.svelte';

  // Changing day is a slideshow: the day on screen slides out one way while the next slides in
  // right behind it, edge to edge. A later day comes in from the right, an earlier one from the
  // left. After a swipe the motion starts from wherever the finger let go.
  const DAY_MS = 320;
  // The week and month views slide by week or month; switching view itself doesn't slide.
  let slide = { dir: 1, from: 0, instant: false };
  const anchor = $derived(
    P.view === 'week' ? mondayOf(P.viewKey) : P.view === 'month' ? P.viewKey.slice(0, 7) : P.viewKey,
  );
  const shownAt = $derived(`${P.view}:${anchor}`);
  let shownKey = untrack(() => anchor);
  let shownView = untrack(() => P.view);
  $effect.pre(() => {
    const key = anchor;
    const view = P.view;
    untrack(() => {
      if (key === shownKey && view === shownView) return;
      slide = { dir: key > shownKey ? 1 : -1, from: gestures.releaseDx, instant: view !== shownView };
      shownKey = key;
      shownView = view;
      gestures.releaseDx = 0;
    });
  });
  // Both run on the same linear clock with the easing applied here, so the two days stay joined.
  function dayIn(node: HTMLElement) {
    if (reducedMotion.current || slide.instant) return { duration: 0 };
    const start = slide.dir * node.offsetWidth + slide.from;
    return { duration: DAY_MS, css: (t: number) => `transform: translateX(${start * (1 - cubicOut(t))}px)` };
  }
  function dayOut(node: HTMLElement) {
    if (reducedMotion.current || slide.instant) return { duration: 0 };
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
      m.setAttribute('content', theme === 'dark' ? '#0f1115' : '#f4f5f7');
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
    task: 'Task',
    hours: 'Day hours',
    add: 'New task',
    install: 'Install',
    wrapup: 'End your day',
    account: 'Sync across devices',
    reorder: 'Later days',
    card: 'Project card',
  } as const;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && P.sheet && P.closeSheet()} />

{#if P.failed}
  <div class="failed">
    <h1>Elastic can't start here</h1>
    <p>
      This browser won't let the planner store anything (private browsing or blocked site data can do this), so there is
      nowhere to keep your plan. Try a normal window, or allow site data for this page.
    </p>
    <p class="detail">{P.failed}</p>
  </div>
{:else if P.ready}
  <!-- inert: while a sheet or the welcome is open, keyboard and screen readers stay inside it. -->
  <div class="page" inert={covered} {@attach dayGestures(P)}>
    {#if P.screen.type === 'habits'}
      <HabitsScreen />
    {:else if P.screen.type === 'goals'}
      {#key P.screen.quarter}<Goals start={P.screen.quarter} />{/key}
    {:else if P.screen.type === 'review'}
      {#key P.screen.id}<Review id={P.screen.id} />{/key}
    {:else if P.screen.type === 'settings'}
      <Settings />
    {:else}
      <Header />
      {#if P.view === 'day'}
        <WeekStrip />
        <StartDay />
      {/if}
      <RunningElsewhere />
      <ComingUp />
      <NotifyPrompt />
      <ReviewDue />
      <main
        class:settling={!gestures.dragging}
        style:transform={gestures.pull ? `translateY(${gestures.pull * 0.6}px)` : undefined}
      >
        {#key shownAt}
          <div
            class="day"
            class:settling={!gestures.dragging}
            style:transform={gestures.dx ? `translateX(${gestures.dx}px)` : undefined}
            in:dayIn
            out:dayOut
          >
            {#if P.view === 'week'}
              <WeekView />
            {:else if P.view === 'month'}
              <MonthView />
            {:else if P.day.items.length === 0}
              <Projects />
              <EmptyState />
            {:else}
              <!-- Before Start my day the plan is dimmed, but stays editable. -->
              <div class="plan" class:waiting={P.startPending}>
                <DayStrip />
                {#if P.settings.habitsPlace === 'separate'}
                  <Checklist mode="habits" />
                  <Checklist mode="checks" />
                {:else}
                  <Checklist mode="both" />
                {/if}
                <Projects />
                {#if timed}<Timeline />{/if}
              </div>
            {/if}
            {#if P.view === 'day'}<DayFooter />{/if}
          </div>
        {/key}
      </main>
    {/if}
  </div>
  <PullIndicator />
  <StartFirst />

  <div inert={covered}><BottomBar /></div>

  {#if P.sheet && shownSheet}
    {#key shownSheet.type === 'task' ? 'task-' + shownSheet.id : shownSheet.type}
      <Sheet
        variant={shownSheet.type === 'add' || shownSheet.type === 'card'
          ? 'form'
          : shownSheet.type === 'hours' ||
              shownSheet.type === 'install' ||
              shownSheet.type === 'wrapup' ||
              shownSheet.type === 'reorder'
            ? 'small'
            : 'full'}
        label={LABELS[shownSheet.type]}
      >
        {#if shownSheet.type === 'card'}
          <ProjectCard id={shownSheet.id} />
        {:else if shownSheet.type === 'task' && P.item(shownSheet.id)?.kind === 'habit'}
          <HabitSheet id={shownSheet.id} />
        {:else if shownSheet.type === 'task'}
          <TaskSheet id={shownSheet.id} />
        {:else if shownSheet.type === 'add'}
          <AddTask at={shownSheet.at} kind={shownSheet.kind} />
        {:else if shownSheet.type === 'hours'}
          <DayHours />
        {:else if shownSheet.type === 'install'}
          <InstallGuide />
        {:else if shownSheet.type === 'wrapup'}
          <WrapUp />
        {:else if shownSheet.type === 'reorder'}
          <ReorderAsk id={shownSheet.id} anchor={shownSheet.anchor} dir={shownSheet.dir} />
        {:else}
          <Account />
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
    padding: 0 0 calc(56px + var(--bar-h) + env(safe-area-inset-bottom));
    box-sizing: border-box;
  }
  @media (min-width: 768px) {
    .page {
      max-width: 780px;
    }
  }
  .plan.waiting {
    opacity: 0.6;
    filter: saturate(0.35);
    transition:
      opacity 400ms ease,
      filter 400ms ease;
  }
  .plan {
    transition:
      opacity 400ms ease,
      filter 400ms ease;
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
