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
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const { v } = (await res.json()) as { v?: unknown };
    return typeof v === 'string' && v !== BUILD;
  } catch {
    return false;
  }
}

/**
 * Fetch the new service worker too, then load the page again from the server. The service worker
 * opens the app from its cache, so `?fresh` asks it for the network's copy this once.
 */
export async function reloadToUpdate(): Promise<void> {
  try {
    await (await navigator.serviceWorker?.getRegistration())?.update();
  } catch {
    /* the reload still gets the new page */
  }
  const url = new URL(location.href);
  url.searchParams.set('fresh', String(Date.now()));
  location.replace(url.href);
}

// The address after such a reload loses its ?fresh again.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('fresh')) {
  const url = new URL(location.href);
  url.searchParams.delete('fresh');
  history.replaceState(history.state, '', url.href);
}
