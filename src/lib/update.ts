// Keeping installed copies up to date. An app on the Home Screen can stay in memory for days
// without reloading, so it would keep running an old build. The page knows its own build (a
// meta tag written at build time, see vite.config.ts) and asks the server for the current one
// (version.json, never cached); the store reloads when they differ (see Planner.checkForUpdate).
// The service worker opens the app from its cache, so this is also how a new build arrives at
// all: the app asks as soon as it opens, and reloads for it at the first quiet moment.

const BUILD =
  typeof document === 'undefined'
    ? null
    : (document.querySelector<HTMLMetaElement>('meta[name="build"]')?.content ?? null);

/** Whether the server has a newer build than the one running. False in development or offline. */
export async function newBuildOut(): Promise<boolean> {
  if (!BUILD) return false;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout?.(8000),
    });
    if (!res.ok) return false;
    const { v } = (await res.json()) as { v?: unknown };
    if (v === BUILD) forgetTried();
    return typeof v === 'string' && v !== BUILD;
  } catch {
    return false;
  }
}

/** When this device last reloaded for a new build (localStorage). */
const TRIED_KEY = 'elastic-day:update-tried';
/** How long after one that didn't bring the new build before trying again. */
const RETRY_MS = 10 * 60_000;

/** Up to date: the next new build is reloaded for at once. */
function forgetTried(): void {
  try {
    localStorage.removeItem(TRIED_KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * Fetch the new service worker too, then load the page again from the server. The service worker
 * opens the app from its cache, so `?fresh` asks it for the network's copy this once. On a network
 * that can't fetch it, the service worker gives up after a few seconds and opens the copy it has
 * (sw.js), the old build: then this waits a while before trying again, rather than reloading every
 * time the app opens. False when it didn't reload.
 */
export async function reloadToUpdate(): Promise<boolean> {
  try {
    const tried = Number(localStorage.getItem(TRIED_KEY));
    if (tried && Date.now() - tried < RETRY_MS) return false;
    localStorage.setItem(TRIED_KEY, String(Date.now()));
  } catch {
    /* storage blocked: try anyway */
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    // A network that hangs mustn't hold the app up: the reload brings the worker along anyway.
    await Promise.race([reg?.update(), new Promise((r) => setTimeout(r, 4000))]);
  } catch {
    /* the reload still gets the new page */
  }
  const url = new URL(location.href);
  url.searchParams.set('fresh', String(Date.now()));
  location.replace(url.href);
  return true;
}

// The address after such a reload loses its ?fresh again.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('fresh')) {
  const url = new URL(location.href);
  url.searchParams.delete('fresh');
  history.replaceState(history.state, '', url.href);
}
