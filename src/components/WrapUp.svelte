<script lang="ts">
  import { untrack } from 'svelte';
  import { leftAtEnd, planner as P } from '../lib/planner.svelte';
  import { dayStats, worked } from '../lib/schedule';
  import { dL, fNZ } from '../lib/time';

  // "End my day": what got done, and what to do with the rest. The running task can be marked
  // done or set aside with its time kept (picked for you: done once it has had its time). Each
  // one-off task or check not done yet has its own tick for moving it to tomorrow, all ticked
  // except a fixed time that has already passed (a meeting that's over shouldn't follow you).
  // Repeating ones come back by themselves. Nothing happens until one of the buttons.
  const items = $derived(P.day.items);
  const st = $derived(dayStats(P.day, P.n));
  const started = $derived(P.day.dayStarted);
  const clock = (m: number) => fNZ(m, P.settings.clock24);

  const act = $derived(P.active);
  const isCard = $derived(!!act?.card);
  const w = $derived(act ? Math.max(0, worked(act, P.n)) : 0);
  let finish = $state(untrack(() => !P.active || worked(P.active, P.n) >= P.active.min));

  const left = $derived(items.filter(leftAtEnd));
  const passed = (i: (typeof items)[number]) => i.kind === 'fixed' && i.fixedAt != null && i.fixedAt + i.min <= P.n;
  // The running task's rest can move too, once it's set aside (one-off tasks only).
  const restCanMove = $derived(!!act && !isCard && !finish && act.repeat === 'Once');
  const rows = $derived([...(restCanMove && act ? [act] : []), ...left]);
  let picked = $state<Record<string, boolean>>(
    untrack(() => {
      const out: Record<string, boolean> = {};
      for (const i of P.day.items) if (leftAtEnd(i)) out[i.id] = !passed(i);
      if (P.active) out[P.active.id] = true;
      return out;
    }),
  );
  const chosen = $derived(rows.filter((i) => picked[i.id]).map((i) => i.id));
  const allOn = $derived(rows.length > 0 && chosen.length === rows.length);
  const repeating = $derived(
    items.filter((i) => i.status === 'todo' && i.kind !== 'buffer' && i.repeat !== 'Once').length,
  );

  function meta(i: (typeof items)[number]): string {
    if (i.id === act?.id) return `the ${dL(Math.max(5, Math.round(i.min - w)))} left`;
    if (i.kind === 'check') return 'check';
    if (i.kind === 'fixed' && i.fixedAt != null)
      return `${dL(i.min)}, fixed at ${clock(i.fixedAt)}${passed(i) ? ', time passed' : ''}`;
    return dL(i.min);
  }
</script>

<div class="scroll">
  <div class="head">
    <span class="h">End your day?</span>
    {#if started != null}
      <span class="note">You started at {clock(started)}.</span>
    {/if}
  </div>

  <div class="stats">
    <div class="stat"><span class="num">{st.tasksDone}/{st.tasks}</span><span class="what">tasks done</span></div>
    <div class="stat"><span class="num">{dL(st.logged)}</span><span class="what">logged</span></div>
    {#if st.checks}
      <div class="stat"><span class="num">{st.checksDone}/{st.checks}</span><span class="what">checks</span></div>
    {/if}
  </div>

  {#if act && isCard}
    <p class="note pad">{act.title} is running. It will be set aside, with its time kept.</p>
  {:else if act}
    <div class="running">
      <span class="label">{act.title} is running, {dL(w)} worked.</span>
      <div class="seg" role="radiogroup" aria-label="What to do with {act.title}">
        <button role="radio" aria-checked={finish} class:on={finish} onclick={() => (finish = true)}
          >Mark it done</button
        >
        <button role="radio" aria-checked={!finish} class:on={!finish} onclick={() => (finish = false)}
          >Set it aside</button
        >
      </div>
    </div>
  {/if}

  {#if rows.length}
    <div class="left">
      <div class="lhead">
        <span class="label">Move to tomorrow</span>
        <button
          class="all"
          onclick={() => {
            const on = !allOn;
            for (const i of rows) picked[i.id] = on;
          }}>{allOn ? 'Select none' : 'Select all'}</button
        >
      </div>
      <ul>
        {#each rows as it (it.id)}
          <li>
            <label class="row">
              <input type="checkbox" class="sr-only" bind:checked={picked[it.id]} />
              <span class="tick" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <span class="what2">
                <span class="t">{it.title}</span>
                <span class="m">{meta(it)}</span>
              </span>
            </label>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
  {#if repeating}
    <p class="note pad">
      {repeating === 1
        ? 'A repeating task comes back by itself.'
        : `${repeating} repeating tasks come back by themselves.`}
    </p>
  {/if}
</div>

<div class="foot">
  <button class="pri" onclick={() => P.endDay(chosen, finish)}>
    {chosen.length ? `End and move ${chosen.length} to tomorrow` : 'End my day'}
  </button>
  <button class="cancel" onclick={() => P.closeSheet()}>Not yet</button>
</div>

<style>
  .scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 4px;
  }
  .head {
    padding: 22px 20px 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .h {
    font: 600 21px/1.2 var(--font);
    letter-spacing: -0.01em;
  }
  .note {
    margin: 0;
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
  }
  .pad {
    padding: 6px 20px 2px;
  }
  .stats {
    display: flex;
    gap: 10px;
    padding: 14px 20px 12px;
  }
  /* Each as wide as its number needs ("10h 25m" takes more room than "1/9"). */
  .stat {
    flex: 1 1 auto;
    min-width: 0;
    padding: 12px 14px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .num {
    font: 600 24px/1 var(--font);
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .what {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
  .label {
    font: 500 14px/1.35 var(--font);
    color: var(--text);
  }

  .running {
    padding: 6px 20px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .seg {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-ctl);
    background: var(--sunk);
  }
  .seg button {
    height: 40px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .seg button.on {
    background: var(--raised);
    color: var(--text);
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .left {
    padding: 8px 20px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .all {
    height: 36px;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: var(--accent);
    font: 400 13px/1 var(--font);
    cursor: pointer;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    cursor: pointer;
  }
  .tick {
    flex: none;
    width: 22px;
    height: 22px;
    box-sizing: border-box;
    border-radius: var(--r-sm);
    border: 1.5px solid var(--line);
    background: var(--raised);
    display: grid;
    place-items: center;
  }
  .tick svg {
    fill: none;
    stroke: var(--bg);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0;
  }
  input:checked + .tick {
    border-color: var(--text);
    background: var(--text);
  }
  input:checked + .tick svg {
    opacity: 1;
  }
  input:focus-visible + .tick {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .what2 {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .t {
    font: 400 15px/1.3 var(--font);
  }
  .m {
    font: 400 12px/1.3 var(--font);
    color: var(--muted);
  }
  input:not(:checked) ~ .what2 .t {
    color: var(--muted);
  }

  .foot {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 20px calc(20px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
  }
  .foot button {
    height: 48px;
    border-radius: var(--r-card);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .pri {
    border: none;
    background: var(--text);
    color: var(--bg);
  }
  .cancel {
    border: none;
    background: transparent;
    color: var(--muted);
  }
</style>
