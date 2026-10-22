<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import SaveRow from './SaveRow.svelte';

  // The signed-in account's name and email, each with Change: the name is saved as it is, a new
  // email once the code sent to it is entered. In the account sheet and in Settings. `notes`:
  // say how each change went right here (the sheet says it at its top instead).
  let { notes = false }: { notes?: boolean } = $props();

  let editing = $state<'name' | 'email' | 'code' | null>(null);
  let name = $state('');
  let email = $state('');
  let code = $state('');
  let note = $state<{ err: boolean; t: string } | null>(null);
  const S = $derived(P.session);
  const okEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

  /** Run an account action and keep what it said, for `notes`. */
  async function act(fn: () => Promise<boolean>): Promise<boolean> {
    note = null;
    const ok = await fn();
    note = P.accountMsg;
    return ok;
  }

  async function saveName() {
    if (await act(() => P.saveName(name.trim()))) editing = null;
  }
  async function sendCode() {
    if (await act(() => P.sendEmailCode(email.trim()))) {
      editing = 'code';
      code = '';
      note = null;
    }
  }
  async function confirm() {
    if (await act(() => P.confirmEmail(email.trim(), code))) editing = null;
  }
  function start(what: 'name' | 'email') {
    note = null;
    name = S?.user.name ?? '';
    email = '';
    editing = what;
  }
</script>

{#if S}
  {#if editing === 'name'}
    <form class="col" onsubmit={(e) => (e.preventDefault(), saveName())}>
      <input class="field" autocomplete="name" aria-label="Name" bind:value={name} {@attach (el) => el.focus()} />
      <SaveRow
        ok={!!name.trim() && name.trim() !== S.user.name && !P.accountBusy}
        onsave={saveName}
        oncancel={() => (editing = null)}
      />
    </form>
  {:else}
    <div class="line">
      <span class="lv"><span class="ll">Name</span>{S.user.name}</span>
      <button class="btn-plain" disabled={!!editing} onclick={() => start('name')}>Change</button>
    </div>
  {/if}
  {#if editing === 'email'}
    <span class="muted">We'll send a code to the new address to confirm it.</span>
    <form class="col" onsubmit={(e) => (e.preventDefault(), sendCode())}>
      <input
        class="field"
        type="email"
        autocomplete="email"
        aria-label="New email"
        bind:value={email}
        {@attach (el) => el.focus()}
      />
      <SaveRow
        label="Send code"
        ok={okEmail && email.trim().toLowerCase() !== S.user.email && !P.accountBusy}
        onsave={sendCode}
        oncancel={() => (editing = null)}
      />
    </form>
  {:else if editing === 'code'}
    <span class="muted">We sent a code to {email.trim()}. It works for 10 minutes.</span>
    <form class="col" onsubmit={(e) => (e.preventDefault(), confirm())}>
      <input
        class="field"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        aria-label="Code"
        bind:value={code}
        {@attach (el) => el.focus()}
      />
      <SaveRow
        ok={code.replace(/\D/g, '').length === 6 && !P.accountBusy}
        onsave={confirm}
        oncancel={() => (editing = null)}
      />
    </form>
  {:else}
    <div class="line">
      <span class="lv"><span class="ll">Email</span>{S.user.email}</span>
      <button class="btn-plain" disabled={!!editing} onclick={() => start('email')}>Change</button>
    </div>
  {/if}
  {#if notes && note}
    <span class="note" class:err={note.err} role="status">{note.t}</span>
  {/if}
{/if}

<style>
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .lv {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    font: 400 15px/1.3 var(--font);
    overflow-wrap: anywhere;
  }
  .ll {
    font: 400 12px/1.3 var(--font);
    color: var(--muted);
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .field {
    height: 40px;
    padding: 0 12px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font: 400 15px/1 var(--font);
    box-sizing: border-box;
  }
  .muted,
  .note {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
  }
  .note.err {
    color: var(--redT);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
