<script lang="ts">
  import { onMount } from 'svelte';
  import { type AccountInfo, accountsAvailable, passkeysAvailable } from '../lib/account';
  import { planner as P } from '../lib/planner.svelte';
  import AccountYou from './AccountYou.svelte';
  import DisarmBar from './DisarmBar.svelte';

  // The account on this device: whether it's syncing, its name and email, and its passkeys.
  // Signing in, and finishing signing in, happen on the sign-in page (SignIn.svelte) before the app.
  let info = $state<AccountInfo | null>(null);
  const S = $derived(P.session);
  const keys = passkeysAvailable();
  const site = location.origin + location.pathname.replace(/index\.html$/, '');

  const STATUS = {
    off: '',
    connecting: 'Connecting',
    live: 'Synced',
    offline: "Offline. Your changes will sync when you're back online.",
    paused: 'Not syncing yet',
    full: 'Your account is full, so some new changes stay on this device.',
  } as const;

  const refresh = () => void P.accountDetails().then((i) => (info = i));
  onMount(() => {
    if (P.session) refresh();
  });

  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

<div class="head">
  <span class="h">Sync across devices</span>
  <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
</div>
<div class="body">
  {#if P.accountMsg}
    <span class="msg" class:err={P.accountMsg.err} role="status">{P.accountMsg.t}</span>
  {/if}
  {#if !accountsAvailable()}
    <section class="card">
      <span class="muted">This browser can't sync, so your plan stays on this device.</span>
    </section>
  {:else if S}
    <section class="card">
      <div class="status">
        <span class="dot" class:live={P.syncStatus === 'live'} class:off={P.syncStatus === 'offline'}></span>
        <span>{STATUS[P.syncStatus] || 'Signed in'}</span>
      </div>
      <span class="muted">
        Your days, repeating tasks and day settings are the same on every device you sign in on. Theme, sound and
        notifications are set on each device.
      </span>
      <span class="muted">To add a device, open <span class="url">{site}</span> on it and sign in there.</span>
    </section>

    <section class="card">
      <span class="ct">You</span>
      <AccountYou />
    </section>

    <section class="card">
      <span class="ct">Passkeys</span>
      {#if info?.keys.length}
        <ul class="keys">
          {#each info.keys as k (k.id)}
            <li>
              <span class="lv">
                <span>{k.label ?? 'Passkey'}</span>
                <span class="ll">Added {day(k.created)}{k.used ? `, last used ${day(k.used)}` : ''}</span>
              </span>
              {#if P.armed('passkey', k.id)}
                <span class="confirm">
                  <button
                    class="btn-yes"
                    onclick={() => P.removePasskey(k.id).then(refresh)}
                    {@attach (el) => el.focus()}>Remove</button
                  >
                  <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
                  <DisarmBar />
                </span>
              {:else}
                <button class="btn-plain" onclick={() => P.arm('passkey', k.id)}>Remove</button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else if info}
        <span class="muted">None yet. You sign in with a code sent to {S.user.email}.</span>
      {/if}
      {#if keys}
        <span class="muted">
          A passkey made on an iPhone or Mac works on your other Apple devices too. Add one for a Windows or Android
          device, or a different browser.
        </span>
        <button class="btn-plain self" disabled={P.accountBusy} onclick={() => P.addPasskey().then(refresh)}
          >Add a passkey on this device</button
        >
      {/if}
    </section>

    <section class="card">
      {#if P.armed('signout', 'me')}
        <span class="confirm">
          Sign out on this device? It keeps its copy of your plan but stops syncing.
          <button class="btn-yes" onclick={() => P.signOut()} {@attach (el) => el.focus()}>Sign out</button>
          <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
          <DisarmBar />
        </span>
      {:else}
        <button class="btn-plain self" onclick={() => P.arm('signout', 'me')}>Sign out</button>
      {/if}
      {#if P.armed('others', 'me')}
        <span class="confirm">
          Sign out on every other device? They keep their copies of your plan but stop syncing until you sign in there
          again.
          <button class="btn-yes" onclick={() => P.signOutOthers()} {@attach (el) => el.focus()}>Sign out</button>
          <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
          <DisarmBar />
        </span>
      {:else}
        <button class="btn-plain self" disabled={P.accountBusy} onclick={() => P.arm('others', 'me')}
          >Sign out other devices</button
        >
      {/if}
      {#if P.armed('unaccount', 'me')}
        <span class="confirm">
          Delete your account and the plan it holds? Each device keeps the copy it has now.
          <button class="btn-yes" onclick={() => P.deleteAccount()} {@attach (el) => el.focus()}>Delete</button>
          <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
          <DisarmBar />
        </span>
      {:else}
        <button class="erase" onclick={() => P.arm('unaccount', 'me')}>Delete account</button>
      {/if}
    </section>
  {/if}
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
  }
  .h {
    flex: 1;
    font: 600 21px/1.2 var(--font);
    letter-spacing: -0.01em;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 16px calc(28px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .body > :global(*) {
    flex-shrink: 0;
  }
  .card {
    padding: 16px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ct {
    font: 400 15px/1.2 var(--font);
  }
  .muted {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .url {
    color: var(--text);
    word-break: break-all;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 400 15px/1.3 var(--font);
  }
  .dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--faint);
  }
  .dot.live {
    background: #22c55e;
  }
  .dot.off {
    background: #f59e0b;
  }
  .self {
    align-self: flex-start;
  }
  .card button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .keys li {
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
  .keys {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .erase {
    align-self: flex-start;
    height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--redT);
    font: 400 13px/1 var(--font);
    cursor: pointer;
  }
  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font: 400 14px/1.3 var(--font);
    position: relative;
    overflow: hidden;
    padding-bottom: 8px;
  }
  .msg {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    padding: 0 4px;
  }
  .msg.err {
    color: var(--redT);
  }
</style>
