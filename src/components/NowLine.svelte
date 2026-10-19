<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { fTs } from '../lib/time';

  // The now line: a see-through gradient with a dot on the colour bar, and the time, small, in
  // the times column (only while times are shown, so it never sits on top of a task).
</script>

<span class="gutter"
  >{#if P.timesShown}<span class="t">{fTs(P.n, P.settings.clock24)}</span>{/if}</span
>
<span class="line"><span class="dot"></span></span>

<style>
  .gutter {
    display: flex;
    justify-content: flex-end;
    padding-right: 6px;
    min-width: 0;
  }
  .t {
    padding: 2px 4px;
    border-radius: 4px;
    background: var(--bg);
    color: var(--nowT);
    font: 600 10.5px/1 var(--font);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .line {
    position: relative;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(
      90deg,
      color-mix(in oklab, var(--now) 75%, transparent),
      color-mix(in oklab, var(--now) 45%, transparent)
    );
  }
  .dot {
    position: absolute;
    left: calc(var(--sc) / 2 - 5px);
    top: -4px;
    width: 10px;
    height: 10px;
    border-radius: 99px;
    background: var(--now);
    box-shadow: 0 0 0 2px var(--bg);
  }
</style>
