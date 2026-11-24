<script lang="ts">
  import { passkeysAvailable } from '../lib/account';
  import { planner as P } from '../lib/planner.svelte';
  import SaveRow from './SaveRow.svelte';

  // Before the account's email changes or the account goes: show it's you, with a passkey or a
  // code to the email it has.
  let { onok, oncancel }: { onok: () => void; oncancel: () => void } = $props();
  let sent = $state(false);
  let code = $state('');
  let err = $state('');

  async function go(how: Parameters<typeof P.prove>[0]): Promise<boolean> {
    err = '';
    const ok = await P.prove(how);
    if (!ok) err = P.accountMsg?.t ?? '';
    P.accountMsg = null;
    return ok;
  }
  const passkey = async () => (await go('passkey')) && onok();
  const send = async () => {
    if (await go('send')) sent = true;
  };
  const check = async () => (await go({ code })) && onok();
</script>

<div class="col" role="group" aria-label="Confirm it's you">
  <span class="q">Confirm it's you first</span>
  {#if sent}
    <span class="muted">We sent a code to {P.session?.user.email}. It works for 10 minutes.</span>
    <form class="col" onsubmit={(e) => (e.preventDefault(), check())}>
      <input
        class="field"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        aria-label="Code to confirm it's you"
        bind:value={code}
        {@attach (el) => el.focus()}
      />
      <SaveRow label="Confirm" ok={code.replace(/\D/g, '').length === 6 && !P.accountBusy} onsave={check} {oncancel} />
    </form>
  {:else}
    <div class="row">
      {#if passkeysAvailable()}
        <button class="btn-plain" disabled={P.accountBusy} onclick={passkey} {@attach (el) => el.focus()}
          >Use a passkey</button
        >
      {/if}
      <button class="btn-plain" disabled={P.accountBusy} onclick={send}>Send a code to {P.session?.user.email}</button>
      <button class="btn-no" onclick={oncancel}>Cancel</button>
    </div>
  {/if}
  {#if err}<span class="err" role="alert">{err}</span>{/if}
</div>

<style>
  .col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .q {
    font: 500 14px/1.35 var(--font);
  }
  .muted,
  .err {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
  }
  .err {
    color: var(--redT);
  }
  .field {
    height: 44px;
    padding: 0 12px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font: 400 15px/1 var(--font);
    box-sizing: border-box;
  }
  .row button {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
</style>
