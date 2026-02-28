/**
 * FileGeek service worker — cache-first for static assets, network-first for API calls.
 */

const CACHE_NAME = 'filegeek-v1';

// App shell resources to pre-cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete stale caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Let API calls (backend) go straight to the network — never cache them.
  if (url.pathname.startsWith('/auth') ||
      url.pathname.startsWith('/sessions') ||
      url.pathname.startsWith('/chat') ||
      url.hostname !== self.location.hostname) {
    return; // fall through to browser default (network)
  }

  // Cache-first for everything else (JS/CSS/images/fonts).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache valid same-origin GET responses.
        if (
          !response ||
          response.status !== 200 ||
          response.type !== 'basic' ||
          request.method !== 'GET'
        ) {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, toCache));
        return response;
      });
    })
  );
});
