<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { dayStats } from '../lib/schedule';
  import { dL, keyDate, shortDate } from '../lib/time';

  const count = $derived(P.day.items.length);
  const tasks = $derived(`${count} task${count === 1 ? '' : 's'}`);
  const dateLabel = $derived(shortDate(keyDate(P.viewKey)));
  const armed = $derived(P.armed('clear', 'day'));
  const started = $derived(P.isToday && P.day.dayStarted != null);
  const st = $derived(dayStats(P.day, P.n));
</script>

{#if started}
  <div class="end">
    <div class="tiles">
      <div class="tile"><span class="big">{st.logged >= 1 ? dL(st.logged) : '0m'}</span><span>logged</span></div>
      <div class="tile"><span class="big">{st.tasksDone} of {st.tasks}</span><span>tasks done</span></div>
      {#if st.checks}
        <div class="tile"><span class="big">{st.checksDone} of {st.checks}</span><span>checks</span></div>
      {/if}
    </div>
    {#if P.day.dayEnded == null}
      <!-- The evening's colours, where Start my day has the day's. -->
      <button class="end-day" onclick={() => P.openSheet({ type: 'wrapup' })}>
        <span class="stripe" aria-hidden="true"></span>
        <span class="in">
          <svg width="18" height="18" viewBox="0 1.5 20 20" aria-hidden="true"
            ><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" /></svg
          >
          <span class="word">End my day</span>
        </span>
      </button>
    {:else}
      <button class="reopen" onclick={() => P.reopenDay()}>Reopen day</button>
    {/if}
  </div>
{/if}

<!-- An ended day is a record: nothing to clear. -->
{#if count && !P.locked}
  <div class="clear">
    {#if armed}
      <div class="armed" role="group" aria-label="Confirm clear">
        <span class="q"
          >Remove all {tasks} from {P.isToday ? 'today' : dateLabel}? <span>This can't be undone.</span></span
        >
        <button class="yes" onclick={() => P.clearDay()} {@attach (el) => el.focus()}>Clear</button>
        <button class="no" onclick={() => P.disarm()}>Cancel</button>
      </div>
    {:else}
      <button class="clear-btn" onclick={() => P.arm('clear', 'day')}>
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
          ><path
            d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12.2A1.5 1.5 0 0 0 8.5 20.5h7a1.5 1.5 0 0 0 1.5-1.3L18 7M10 11v5.5M14 11v5.5"
          /></svg
        >
        Clear this day
      </button>
      <span class="hint"
        >Removes all {tasks} from {dateLabel} and resets its timers. Other days and your settings stay.</span
      >
    {/if}
  </div>
{/if}

<style>
  .end {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 24px var(--px) 4px;
  }
  .tiles {
    align-self: stretch;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 6px;
    /* As much room above End my day as below it, before the clearing section. */
    margin-bottom: 34px;
  }
  .tile {
    padding: 10px 12px;
    border-radius: var(--r-ctl);
    background: var(--raised);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
  .big {
    font: 600 20px/1.1 var(--font);
    letter-spacing: -0.02em;
    color: var(--text);
  }
  /* A raised key in the evening's colours, pressing down onto its edge. */
  .end-day {
    width: 248px;
    height: 58px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: #1e1b3a;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    cursor: pointer;
    box-shadow:
      0 4px 0 #0b0920,
      0 10px 20px -8px rgba(30, 27, 58, 0.6);
    transition:
      translate 90ms ease,
      box-shadow 90ms ease,
      filter 200ms;
  }
  .end-day:active {
    translate: 0 4px !important;
    scale: none !important;
    filter: none !important;
    box-shadow:
      0 0 0 #0b0920,
      0 2px 6px -2px rgba(30, 27, 58, 0.4);
  }
  .stripe {
    height: 4px;
    flex: none;
    background: linear-gradient(90deg, var(--evening-stops));
  }
  .in {
    flex: 1;
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
  @media (hover: hover) {
    .end-day:hover {
      filter: brightness(1.15);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .end-day:active {
      translate: none !important;
    }
  }
  .reopen {
    height: 44px;
    padding: 0 18px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .clear {
    margin: 8px var(--px) 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  /* Below End my day, clearing is a section of its own: well apart, behind a rule. */
  .end + .clear {
    margin-top: 44px;
    padding-top: 32px;
    border-top: 1px solid var(--border);
  }
  .hint {
    max-width: 34ch;
    font: 400 12px/1.4 var(--font);
    color: var(--muted);
    text-align: center;
    text-wrap: pretty;
  }
  /* Clearing a day can't be undone: a red button, set apart from the day's own actions. */
  .clear-btn {
    height: 44px;
    margin-bottom: 8px;
    padding: 0 18px 0 14px;
    border: 1px solid color-mix(in oklab, #ef4444 45%, transparent);
    border-radius: var(--r-ctl);
    background: color-mix(in oklab, #ef4444 12%, var(--raised));
    color: var(--redT);
    display: flex;
    align-items: center;
    gap: 8px;
    font: 500 14px/1 var(--font);
    cursor: pointer;
  }
  .clear-btn svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  @media (hover: hover) {
    .clear-btn:hover {
      background: color-mix(in oklab, #ef4444 18%, var(--raised));
    }
  }
  .armed {
    flex: 1 1 100%;
    padding: 14px;
    border-radius: var(--r-card);
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.4);
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    position: relative;
    overflow: hidden;
  }
  /* The question on its own line, then Clear and Cancel side by side. */
  .q {
    flex: 1 1 100%;
    font: 400 14px/1.4 var(--font);
  }
  .q span {
    color: var(--muted);
  }
  .yes,
  .no {
    height: 44px;
    border-radius: var(--r-ctl);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .yes {
    padding: 0 18px;
    border: none;
    background: #dc2626;
    color: #ffffff;
    font-weight: 500;
  }
  .no {
    padding: 0 16px;
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
  }
</style>
