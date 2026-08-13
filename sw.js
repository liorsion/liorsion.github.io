// Service worker for קסם המספרים — makes the game playable with no network.
//
// Two deliberate constraints:
//
// 1. SCOPE. A worker registered at the site root controls the whole origin, and
//    this origin hosts other, unrelated pages. So this worker ignores every
//    request except the game's own URL: anything else falls through to the
//    network exactly as if no worker existed.
//
// 2. NETWORK FIRST. The cache is the fallback, not the source of truth. A
//    freshly deployed build is therefore picked up as soon as the device is
//    online, instead of a stale copy being served indefinitely — which is the
//    usual way offline support goes wrong.

const CACHE = 'kesem-hamisparim-v1';

// Which page this worker owns. Passed by the page at registration
// (sw.js?app=/math-game.html) rather than hardcoded, because the same build is
// deployed both as /math-game.html and as a plain index.html — and a worker
// guessing the wrong path silently does nothing at all.
const APP_PATH = new URLSearchParams(self.location.search).get('app') || '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(APP_PATH))
      // Don't fail the install if the pre-cache fetch fails; the first
      // successful navigation will populate the cache anyway.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The published build is a single self-contained HTML file, so APP_PATH is
// normally all there is. A regular multi-file build (used in development and by
// the tests) also pulls hashed files out of /assets/ — without those the page
// would load offline but render nothing, so they're cached too.
function ownsRequest(url) {
  return url.pathname === APP_PATH || url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Leave other origins, other pages on this site, and non-GET requests alone.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;
  if (!ownsRequest(url)) return;

  // Cache the app page under its bare path so "?seed=123" still matches
  // offline; assets are already unique by their hashed filename.
  const cacheKey = url.pathname === APP_PATH ? APP_PATH : url.pathname;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(cacheKey, copy));
        }
        return response;
      })
      .catch(() => caches.match(cacheKey)),
  );
});
