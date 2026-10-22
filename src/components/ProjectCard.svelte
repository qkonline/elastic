<script lang="ts">
  import { deadlineLabel } from '../lib/boardo.svelte';
  import { planner as P } from '../lib/planner.svelte';
  import { hueColor, isHue } from '../lib/types';

  // A project card from Boardo, read-only (R8.11): what it is and when it's due, with a way to
  // start it and to open it in Boardo, where it can be changed.
  let { id }: { id: string } = $props();
  const c = $derived(P.boardo.cards.find((x) => x.id === id));
  const colour = (h: string) => (h === 'rose' ? '#f43f5e' : isHue(h) ? hueColor(h) : '#22d3ee');
  const fmt = (v: string) =>
    v.includes('T')
      ? new Date(v).toLocaleString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
      : new Date(v + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
</script>

<div class="body">
  <div class="top">
    <span class="label">Project card</span>
    <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
  </div>
  {#if c}
    <p class="proj"><span class="dot" style:background={colour(c.board.hue)}></span>{c.board.name}</p>
    <h2>{c.title}</h2>
    <dl>
      {#if c.status.label}<dt>Status</dt>
        <dd>{c.status.label}</dd>{/if}
      {#if c.start}<dt>Start</dt>
        <dd>{fmt(c.start)}</dd>{/if}
      {#if c.end}<dt>Due</dt>
        <dd>
          {fmt(c.end)}{#if !c.completed && !c.myDone}, {deadlineLabel(
              c.end,
              P.today,
              P.settings.clock24,
            ).toLowerCase()}{/if}
        </dd>{/if}
      {#if c.myDone}<dt>Your part</dt>
        <dd>Done</dd>{/if}
    </dl>
    <div class="acts">
      {#if !c.myDone && !c.completed && P.isToday}
        <button class="ctl primary" onclick={() => (P.closeSheet(), P.startCard(c))}>Start</button>
      {/if}
      <a class="ctl" href={c.url} target="_blank" rel="noopener">Open in Boardo</a>
    </div>
    <p class="note">Comments, files and other fields are in Boardo.</p>
  {:else}
    <p class="note">This card isn't assigned to you any more.</p>
  {/if}
</div>

<style>
  .body {
    padding: 8px 20px max(20px, env(safe-area-inset-bottom));
    display: grid;
    gap: 12px;
    overflow: auto;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .proj {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 14px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  h2 {
    margin: 0;
    font: 600 20px/1.3 var(--font);
    overflow-wrap: anywhere;
  }
  dl {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 8px 12px;
    margin: 0;
    font-size: 14px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .acts {
    display: flex;
    gap: 8px;
  }
  .acts a {
    text-decoration: none;
  }
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
</style>
