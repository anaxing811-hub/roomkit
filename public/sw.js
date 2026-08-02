/**
 * RoomKit service worker.
 *
 * Strategy, and why:
 *   - Navigations  -> network-first, falling back to the cached shell. So a
 *                     rebuild is picked up immediately when online, and the app
 *                     still opens on a plane.
 *   - Static assets -> cache-first. Vite fingerprints filenames, so a cached
 *                     hit is always the right version and never goes stale.
 *   - Everything else (api.anthropic.com in particular) -> not touched. User
 *                     data never enters the cache; the inventory lives in
 *                     localStorage, which the worker has no access to and
 *                     never clears.
 *
 * Bumping CACHE drops every previous cache in `activate`.
 */
const CACHE = 'roomkit-v1'

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is all-or-nothing; a single 404 would abort the install, so each
      // entry is added individually and allowed to fail.
      .then((cache) =>
        Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Only ever handle our own origin. API calls and anything cross-origin go
  // straight to the network, uncached.
  if (url.origin !== self.location.origin) return

  // Page loads: network first so a fresh build wins, cache as the fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html').then((hit) => hit ?? caches.match('/')))
    )
    return
  }

  // Assets: cache first, then fill the cache on a miss.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => hit)
    })
  )
})
