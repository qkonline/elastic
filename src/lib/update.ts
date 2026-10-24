// Keeping installed copies up to date. An app on the Home Screen can stay in memory for days
// without reloading, so it would keep running an old build. The page knows its own build (a
// meta tag written at build time, see vite.config.ts) and asks the server for the current one
// (version.json, never cached); the store reloads when they differ (see Planner.checkForUpdate).
// The service worker opens the app from its cache, so this is also how a new build arrives at
// all: the app asks as soon as it opens; the new build's service worker then fetches and stores
// all of it in the background (sw.js, install), and only once it's all on the device does the app
// reload, at the first quiet moment, from that copy. No reload waits on the network: on a network
// that hangs (24 Oct 2026, a router whose DNS gave only an unreachable address) the old way, a
// reload from the server, left the app frozen halfway.

const BUILD =
  typeof document === 'undefined'
    ? null
    : (document.querySelector<HTMLMetaElement>('meta[name="build"]')?.content ?? null);

/** The newest build the server has said it has. */
let latest: string | null = null;

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
    if (typeof v !== 'string' || v === BUILD) return false;
    latest = v;
    return true;
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
 * Whether the newest build is all on the device: its service worker stored it (its cache has the
 * app page, which install adds with every file in one go) and has taken over.
 */
async function storedHere(reg: ServiceWorkerRegistration): Promise<boolean> {
  if (!latest || reg.installing || reg.waiting || reg.active?.state !== 'activated') return false;
  try {
    return !!(await (await caches.open(`elastic-day-${latest}`)).match('./'));
  } catch {
    return false;
  }
}

/**
 * Reload into the newest build, once it's all on the device; until then, have the service worker
 * fetch it in the background and say so (false), for the app to ask again at its next quiet
 * moment. A reload that didn't bring it (it shouldn't) isn't tried again for a while, so it can
 * never loop.
 */
export async function reloadToUpdate(): Promise<boolean> {
  try {
    const tried = Number(localStorage.getItem(TRIED_KEY));
    if (tried && Date.now() - tried < RETRY_MS) return false;
  } catch {
    /* storage blocked */
  }
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  // Without a service worker (yet) the page comes from the server anyway.
  if (reg?.active && !(await storedHere(reg))) {
    void reg.update().catch(() => {});
    return false;
  }
  try {
    localStorage.setItem(TRIED_KEY, String(Date.now()));
  } catch {
    /* storage blocked */
  }
  location.reload();
  return true;
}

// The address after such a reload loses its ?fresh again.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('fresh')) {
  const url = new URL(location.href);
  url.searchParams.delete('fresh');
  history.replaceState(history.state, '', url.href);
}
