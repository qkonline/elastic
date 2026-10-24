// Elastic service worker. Generated into dist/sw.js at build time (see vite.config.ts),
// which fills in the cache version, the build's file list and the worker's address.
// The app page opens from the cache first, so Elastic opens at once whatever the network is
// doing; a newer build is noticed by the page (version.json, src/lib/update.ts), its worker
// stores all of it on install, and the page then opens again from that copy. Other pages:
// network first. Build files: cache first.

const CACHE = 'elastic-day-__VERSION__';
/** This build, as its page says it (`<meta name="build">`). */
const BUILD = CACHE.slice('elastic-day-'.length);
const ASSETS = __ASSETS__;
const API = __API__;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...ASSETS])));
});

// The previous build's cache stays until the one after: a page it served may still be loading
// its files when this worker takes over (it activates at once), and on the server they're gone.
// caches.keys() lists caches oldest first.
// Activating does nothing that waits: while a worker activates, every page load waits for it, and
// on iPhone the app froze at launch while one was activating (24 Oct 2026). So no clients.claim()
// (pages it didn't load come to it as they next load) and the old caches go afterwards.
self.addEventListener('activate', () => {
  setTimeout(async () => {
    try {
      const older = (await caches.keys()).filter((k) => k.startsWith('elastic-day-') && k !== CACHE);
      for (const k of older.slice(0, -1)) await caches.delete(k);
    } catch {
      /* next time */
    }
  }, 30_000);
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Which build is current: always the server's answer, never a cached one. Nor the API.
  if (url.pathname === scope.pathname + 'version.json' || url.pathname.startsWith(scope.pathname + 'api/')) return;

  if (req.mode === 'navigate') {
    // Only the app page itself is stored as the offline shell, never some other file opened in a tab.
    const isShell = url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html';
    if (isShell) {
      e.respondWith(shell().then((hit) => hit || fromNetwork(e, true)));
      return;
    }
    e.respondWith(fromNetwork(e, isShell));
    return;
  }

  // Build files never vary (their names carry a hash of their content), whatever a server's Vary says.
  e.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

/** How long a page from the network gets before the cached copy opens instead. */
const PAGE_WAIT = 6000;

/**
 * The app page this build stored. The previous build's cache is kept a while (see activate) and
 * holds its own page, and caches.match() looks in the oldest cache first: it would open the old
 * build, which then reloads for this one at every launch.
 */
const shell = () =>
  caches
    .open(CACHE)
    .then((c) => c.match('./', { ignoreVary: true }))
    // Any build's page rather than none: it loads its own files and updates itself from there.
    .then((hit) => hit || caches.match('./', { ignoreVary: true }))
    .catch(() => undefined);

/** No copy of the app here and no answer from the network: say so, rather than wait for ever. */
const unreachable = () =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elastic</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:420px;margin:20vh auto 0;padding:0 24px;background:#0f1115;color:#e7e9ee">
<h1 style="font-size:22px;font-weight:600">Can't reach Elastic</h1>
<p style="color:#9aa1ad">This network isn't answering. Your plan is safe. Try again in a moment, or on another network.</p>
<button onclick="location.replace(location.pathname)" style="font:inherit;padding:10px 18px;border-radius:8px;border:0;background:#e7e9ee;color:#0f1115">Try again</button>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

/**
 * A page from the network (the app page is kept as the shell), or the cached shell when offline,
 * when the server answers with an error, or when the network hasn't answered in a few seconds:
 * a network can hang for minutes (one whose DNS gives only an address it can't reach, say), and
 * the app would sit frozen on its way to a new build. Only this build's own page is stored as the
 * shell: a newer build's page needs its files, which only its own worker stores (on install).
 */
function fromNetwork(e, isShell) {
  const req = e.request;
  const cached = () => (isShell ? shell() : caches.match(req).then((hit) => hit || shell()));
  const net = fetch(req).then((res) => {
    if (isShell && res.ok && (res.headers.get('content-type') || '').includes('text/html'))
      e.waitUntil(
        res
          .clone()
          .text()
          .then((html) =>
            html.includes(`name="build" content="${BUILD}"`)
              ? caches.open(CACHE).then((c) => c.put('./', new Response(html, { headers: res.headers })))
              : undefined,
          )
          .catch(() => {}),
      );
    return res;
  });
  net.catch(() => {});
  const late = new Promise((r) => setTimeout(r, PAGE_WAIT));
  return Promise.race([net, late])
    .then(async (res) => (res && res.ok ? res : (await cached()) || res || (isShell ? unreachable() : net)))
    .catch(async () => (await cached()) || (isShell ? unreachable() : Response.error()));
}

// Time's up, or a fixed-time task coming up, while the app is closed or in the background.
// The push worker sends an empty push at each moment the app booked, and what to say comes
// from the app's own IndexedDB (see src/lib/reminders.ts), so it never leaves the device.
// Signed in, the account sends the pushes and says what they're for, since another device may
// have changed the plan after this one last saw it.
self.addEventListener('push', (e) => {
  e.waitUntil(
    accountNotes()
      .catch(() => null)
      .then((notes) => notes ?? dueNotes().catch(() => null))
      .then((notes) => notes ?? timeUpNotes())
      .then(async (notes) => {
        for (const n of notes) {
          // Not every browser replaces a notification with the same tag, so close any first.
          try {
            for (const old of await self.registration.getNotifications({ tag: n.tag })) old.close();
          } catch {
            /* can't list them here; the tag has to do */
          }
          await self.registration.showNotification(n.title, { body: n.body, icon: 'icon-192.png?v=4', tag: n.tag });
        }
      }),
  );
});

/** A little early is fine: the worker's clock and the phone's can differ by a few seconds. */
const EARLY_MS = 30_000;
/** A push that came late shows the latest alert again, if it's this recent; older ones are news no longer. */
const AGAIN_MS = 10 * 60_000;
/** Alerts older than this are never shown. */
const STALE_MS = 60 * 60_000;

/**
 * What this push is for: every booked group that is due and not shown yet, marked as shown.
 * If none is due (a push that arrived late), the last one shown again; null when nothing
 * was booked this way (a push booked by an older version of the app).
 */
function dueNotes() {
  return withMeta('readwrite', (meta, resolve) => {
    const get = meta.get('alerts');
    get.onsuccess = () => {
      const plan = get.result;
      if (!plan || !Array.isArray(plan.groups) || !plan.groups.length) return resolve(null);
      const now = Date.now();
      const due = plan.groups.filter((g) => !g.shown && g.at <= now + EARLY_MS && g.at > now - STALE_MS);
      if (!due.length) {
        const last = plan.groups.filter((g) => g.shown && g.at > now - AGAIN_MS).pop();
        return resolve(last ? last.notes : null);
      }
      for (const g of due) g.shown = true;
      meta.put(plan, 'alerts');
      resolve(due.flatMap((g) => g.notes));
    };
  });
}

/** How long to wait for the account before falling back on what this device knows. */
const ACCOUNT_WAIT_MS = 8000;

/**
 * Signed in: the account's alerts that are due and haven't been shown here, or if none are
 * (a push that arrived late) the last one again. Null when not signed in or out of reach.
 */
async function accountNotes() {
  if (!API) return null;
  const session = await withMeta('readonly', (meta, resolve) => {
    const get = meta.get('account');
    get.onsuccess = () => resolve(get.result ?? null);
  });
  if (!session || !session.token) return null;
  const res = await fetch(API + '/alerts/due', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' }, // no preflight
    body: JSON.stringify({ token: session.token }),
    signal: AbortSignal.timeout(ACCOUNT_WAIT_MS),
  });
  if (!res.ok) return null;
  const { groups } = await res.json();
  if (!Array.isArray(groups) || !groups.length) return null;
  const id = (g) => g.at + '|' + g.notes.map((n) => n.tag).join(',');
  return withMeta('readwrite', (meta, resolve) => {
    const get = meta.get('shown');
    get.onsuccess = () => {
      const shown = Array.isArray(get.result) ? get.result : [];
      const fresh = groups.filter((g) => !shown.includes(id(g)));
      meta.put([...shown, ...fresh.map(id)].slice(-50), 'shown');
      const again = groups.slice(-1).filter((g) => g.at > Date.now() - AGAIN_MS);
      resolve(fresh.length ? fresh.flatMap((g) => g.notes) : again.length ? again[0].notes : null);
    };
  });
}

/**
 * The old way (a push booked by an older version of the app): time's up for the task running, if
 * its time is up. Something has to show for every push, so otherwise a plain note.
 */
async function timeUpNotes() {
  const found = await runningItem().catch(() => null);
  if (found) {
    const { it, key } = found;
    const [y, m, d] = key.split('-').map(Number);
    const now = (Date.now() - new Date(y, m - 1, d).getTime()) / 60000;
    const worked = (it.pausedAt ?? now) - it.startedAt - (it.pausedFor || 0);
    if (worked >= it.min) return [{ title: "Time's up", body: it.title, tag: 'timer-' + it.id }];
  }
  return [{ title: 'Elastic', body: 'Open Elastic to see your plan.', tag: 'elastic' }];
}

/** Open the app's database (never creating it) and run `fn` on its meta store. */
function withMeta(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('elastic-day');
    req.onupgradeneeded = () => req.transaction.abort(); // no database yet: don't create an empty one
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) {
        db.close();
        return resolve(null);
      }
      let out = null;
      const tx = db.transaction('meta', mode);
      tx.oncomplete = () => {
        db.close();
        resolve(out);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
      fn(tx.objectStore('meta'), (v) => (out = v));
    };
  });
}

/** The item currently running, read straight from the app's database (never creating it). */
function runningItem() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('elastic-day');
    req.onupgradeneeded = () => req.transaction.abort(); // no database yet: don't create an empty one
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('days')) {
        db.close();
        return resolve(null);
      }
      const all = db.transaction('days').objectStore('days').getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => {
        db.close();
        for (const day of all.result)
          for (const it of day.items) if (it.status === 'running' && !it.card) return resolve({ it, key: day.key });
        resolve(null);
      };
    };
  });
}

// Tapping a notification brings the planner back to the front.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
