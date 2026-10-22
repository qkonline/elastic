<script lang="ts">
  // Cancel and Save under something changed in place (a goal, a corrected time, a setting):
  // nothing is kept until Save. Save stays muted until there's something to keep.
  let {
    label = 'Save',
    ok = true,
    onsave,
    oncancel,
  }: { label?: string; ok?: boolean; onsave: () => void; oncancel: () => void } = $props();
</script>

<div class="saverow">
  <button type="button" class="no" onclick={oncancel}>Cancel</button>
  <button type="button" class="yes" class:ok disabled={!ok} onclick={onsave}>{label}</button>
</div>

<style>
  .saverow {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
  }
  button {
    height: 40px;
    padding: 0 16px;
    border-radius: var(--r-ctl);
    border: none;
    font: 400 14px/1 var(--font);
    white-space: nowrap;
  }
  .no {
    padding: 0 10px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .yes {
    background: var(--sunk);
    color: var(--faint);
    cursor: default;
    transition:
      background 240ms,
      color 240ms;
  }
  .yes.ok {
    background: var(--text);
    color: var(--bg);
    font-weight: 500;
    cursor: pointer;
  }
  @media (pointer: coarse) {
    button {
      height: 44px;
    }
  }
</style>
