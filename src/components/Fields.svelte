<script lang="ts" module>
  export const PICKS = [15, 30, 45, 60, 90, 120];

  const range = (from: number, to: number, step = 1) =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  const withValue = (list: number[], v: number) => [...new Set([...list, v])].sort((a, b) => a - b);
</script>

<script lang="ts">
  // Duration presets with a custom hours/minutes picker, and the colour swatches. Shared by the
  // New task modal and the task sheet.
  import { untrack } from 'svelte';
  import { dL } from '../lib/time';
  import { HUES, hueName, isHex, type Hue } from '../lib/types';

  let {
    field,
    min = 0,
    showLabel = true,
    onMin,
    hue,
    onHue,
    ringBg = 'var(--raised)',
  }: {
    field: 'duration' | 'colour';
    min?: number;
    /** The New task sheet labels its duration itself (the Timed switch). */
    showLabel?: boolean;
    onMin?: (m: number) => void;
    hue?: Hue;
    onHue?: (h: Hue) => void;
    ringBg?: string;
  } = $props();

  const isPreset = $derived(PICKS.includes(min) || min === 0);
  // A duration that isn't a preset (e.g. the rest of a postponed task) opens the picker.
  let customOpen = $state(untrack(() => min !== 0 && !PICKS.includes(min)));
  const hours = $derived(Math.floor(min / 60));
  const mins = $derived(min % 60);
  // Five-minute steps, plus whatever the current value is so it can always be shown.
  const hourOpts = $derived(withValue(range(0, 12), hours));
  const minOpts = $derived(withValue(range(0, 55, 5), mins));

  function setCustom(h: number, m: number) {
    onMin?.(h * 60 + m || 5);
  }

  // A colour of your own. Until one is picked the swatch shows the five task colours as a wheel.
  const custom = $derived(hue && isHex(hue) ? hue : null);
  let lastCustom = $state(untrack(() => (hue && isHex(hue) ? hue : '#f472b6')));
  $effect(() => {
    if (custom) lastCustom = custom;
  });
</script>

{#if field === 'duration'}
  <div class="group">
    {#if showLabel}<span class="label">How long</span>{/if}
    <div class="picks">
      {#each PICKS as m (m)}
        <button
          class="chip"
          aria-pressed={min === m && !customOpen}
          onclick={() => {
            customOpen = false;
            onMin?.(m);
          }}>{dL(m)}</button
        >
      {/each}
      <button
        class="chip"
        aria-pressed={customOpen || !isPreset}
        aria-expanded={customOpen}
        onclick={() => {
          customOpen = !customOpen;
          if (customOpen && min === 0) onMin?.(30);
        }}>{isPreset ? 'Custom' : dL(min)}</button
      >
    </div>
    {#if customOpen}
      <div class="custom">
        <label class="sel">
          <span class="sr-only">Hours</span>
          <select value={hours} onchange={(e) => setCustom(+e.currentTarget.value, mins)}>
            {#each hourOpts as h (h)}<option value={h}>{h} h</option>{/each}
          </select>
        </label>
        <label class="sel">
          <span class="sr-only">Minutes</span>
          <select value={mins} onchange={(e) => setCustom(hours, +e.currentTarget.value)}>
            {#each minOpts as m (m)}<option value={m}>{m} min</option>{/each}
          </select>
        </label>
      </div>
    {/if}
  </div>
{:else}
  <div class="colour">
    <span class="label">Colour</span>
    {#each Object.entries(HUES) as [k, col] (k)}
      <button class="sw" aria-label={hueName(k as Hue)} aria-pressed={hue === k} onclick={() => onHue?.(k as Hue)}>
        <span
          style:background={col}
          style:box-shadow={hue === k ? `0 0 0 2px ${ringBg}, 0 0 0 4px var(--text)` : 'none'}
        ></span>
      </button>
    {/each}
    <label class="sw" title="Custom colour">
      <span
        class="wheel"
        class:set={!!custom}
        style:--pick={custom ?? 'transparent'}
        style:box-shadow={custom ? `0 0 0 2px ${ringBg}, 0 0 0 4px var(--text)` : 'none'}
      ></span>
      <!-- The real input sits on top, invisible, so a tap opens the system colour picker. -->
      <input
        type="color"
        aria-label="Custom colour"
        value={lastCustom}
        oninput={(e) => onHue?.(e.currentTarget.value as Hue)}
        onclick={() => !custom && onHue?.(lastCustom as Hue)}
      />
    </label>
  </div>
{/if}

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .custom {
    display: flex;
    gap: 8px;
  }
  .sel {
    position: relative;
    display: inline-flex;
  }
  /* A small chevron drawn with borders, so it follows the theme colours. */
  .sel::after {
    content: '';
    position: absolute;
    right: 13px;
    top: 50%;
    width: 6px;
    height: 6px;
    margin-top: -5px;
    border-right: 1.5px solid var(--muted);
    border-bottom: 1.5px solid var(--muted);
    transform: rotate(45deg);
    pointer-events: none;
  }
  select {
    appearance: none;
    -webkit-appearance: none;
    height: 44px;
    min-width: 96px;
    padding: 0 34px 0 14px;
    border: none;
    border-radius: var(--r-ctl);
    background: var(--sunk);
    color: var(--text);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .colour {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-wrap: wrap;
  }
  .colour .label {
    margin-right: auto;
  }
  .sw {
    width: 44px;
    height: 44px;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .sw span {
    width: 28px;
    height: 28px;
    border-radius: var(--r-sm);
  }
  .sw:has(input) {
    position: relative;
  }
  /* A wheel of the five task colours; once a colour is picked it fills the middle. */
  .wheel {
    box-sizing: border-box;
    background: conic-gradient(var(--hue-stops));
  }
  .wheel.set {
    border: 3px solid transparent;
    background:
      linear-gradient(var(--pick), var(--pick)) padding-box,
      conic-gradient(var(--hue-stops)) border-box;
  }
  input[type='color'] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .sw:has(input:focus-visible) .wheel {
    outline: 2px solid var(--text);
    outline-offset: 3px;
  }
</style>
