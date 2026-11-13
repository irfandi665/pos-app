'use strict';

const CACHE_VERSION = 'pos-qris-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const API_GET_ALLOWLIST = [
  '/api/products',
  '/api/products/categories/list',
  '/api/settings',
  '/api/customers',
  '/api/shifts/current'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.allSettled([
        cache.add('/'),
        cache.add('/index.html')
      ])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isCacheableApiRequest(url) {
  return API_GET_ALLOWLIST.some((allowed) =>
    url.pathname === allowed || url.pathname.startsWith(`${allowed}/`)
  );
}

async function networkFirst(request, cacheName, fallbackRequest) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(fallbackRequest || request, response.clone());
    }
    return response;
  } catch (_error) {
    const cached = await cache.match(fallbackRequest || request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const shell = await caches.match('/');
      if (shell) return shell;
    }

    return new Response(
      JSON.stringify({ error: 'Anda sedang offline dan data belum tersedia di cache.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_error) {
    return new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, '/'));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (!isCacheableApiRequest(url)) return;

    const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
    event.respondWith(networkFirst(request, RUNTIME_CACHE, cacheKey));
    return;
  }

  event.respondWith(
    url.pathname === '/sw.js' ? fetch(request) : cacheFirst(request)
  );
});
