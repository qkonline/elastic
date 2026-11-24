<script lang="ts">
  import { CONFIRM_MS, planner } from '../lib/planner.svelte';

  // Shrinks over the 10 s an armed confirm stays open.
  // Waits while the mouse is over the confirm, or the keyboard is in it.
  function hold(el: HTMLElement) {
    const box = el.parentElement!;
    let over = false;
    const set = () =>
      (planner.holdConfirm =
        over || (box.contains(document.activeElement) && box.querySelector(':focus-visible') !== null));
    const enter = (e: PointerEvent) => e.pointerType === 'mouse' && ((over = true), set());
    const leave = () => ((over = false), set());
    box.addEventListener('pointerenter', enter);
    box.addEventListener('pointerleave', leave);
    box.addEventListener('focusin', set);
    box.addEventListener('focusout', set);
    set();
    return () => {
      planner.holdConfirm = false;
      box.removeEventListener('pointerenter', enter);
      box.removeEventListener('pointerleave', leave);
      box.removeEventListener('focusin', set);
      box.removeEventListener('focusout', set);
    };
  }
  const pct = $derived(
    planner.confirm ? Math.max(0, 100 - ((planner.clock - planner.confirm.at) / CONFIRM_MS) * 100) : 0,
  );
</script>

<span class="bar" {@attach hold} style:width="{pct}%" aria-hidden="true"></span>

<style>
  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    background: var(--muted);
    transition: width 250ms linear;
  }
</style>
