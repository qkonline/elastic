<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { dayStats } from '../lib/schedule';
  import { dL, keyDate, shortDate } from '../lib/time';
  import DisarmBar from './DisarmBar.svelte';

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
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"
            ><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" /></svg
          >
          <span class="word">End my day</span>
        </span>
      </button>
      <p class="cap">Move what's left to tomorrow, or let it go</p>
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
        <DisarmBar />
      </div>
    {:else}
      <button class="clear-link" onclick={() => P.arm('clear', 'day')}>Clear this day</button>
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
    margin-bottom: 8px;
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
  .cap {
    margin: 2px 0 0;
    font: 400 12px/1.3 var(--font);
    color: var(--muted);
    text-align: center;
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
    justify-content: center;
  }
  .clear-link {
    height: 44px;
    padding: 0 12px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 14px/1 var(--font);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
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
  .q {
    flex: 1 1 200px;
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
    background: #f87171;
    color: #16181d;
  }
  .no {
    padding: 0 16px;
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
  }
</style>
