<script lang="ts">
  import { ICONS, type IconName } from '../lib/icons';
  import { hueColor, type Hue } from '../lib/types';

  // A check's or habit's icon (icons.ts) on a tile tinted with its colour, the icon in a deeper
  // shade of it (lighter in the dark). `faded` once it's done.
  let { name, hue, size = 36, faded = false }: { name: IconName; hue: Hue; size?: number; faded?: boolean } = $props();
</script>

<span class="ti" class:faded style:--c={hueColor(hue)} style:--s="{size}px" aria-hidden="true">
  <svg viewBox="0 0 24 24" width={Math.round(size * 0.5)} height={Math.round(size * 0.5)}>
    {#each ICONS[name] as [tag, attrs], i (i)}
      <svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attrs} />
    {/each}
  </svg>
</span>

<style>
  .ti {
    flex: none;
    width: var(--s);
    height: var(--s);
    border-radius: var(--r-ctl);
    display: grid;
    place-items: center;
    background: color-mix(in oklab, var(--c) 16%, transparent);
    color: color-mix(in oklab, var(--c) 62%, var(--text));
    transition:
      background 200ms,
      color 200ms;
  }
  .ti.faded {
    background: var(--sunk);
    color: var(--faint);
  }
  svg {
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
