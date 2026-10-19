<script lang="ts">
  // Subtask checkbox. Colours cycle through the palette by position; checked = solid + ✓.
  const COLOURS = ['#f43f5e', '#22d3ee', '#84cc16', '#818cf8', '#facc15'];
  let { index, done }: { index: number; done: boolean } = $props();
  const c = $derived(COLOURS[index % COLOURS.length]);
</script>

<span
  class="box"
  aria-hidden="true"
  style:background={done ? c : `color-mix(in oklab, ${c} 14%, transparent)`}
  style:border={done ? 'none' : `1.5px solid ${c}`}>{done ? '✓' : ''}</span
>

<style>
  .box {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 400 12px/1 var(--font);
    color: #16181d;
    box-sizing: border-box;
  }
</style>
