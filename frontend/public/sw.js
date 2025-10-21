const CACHE_NAME = 'manatap-v2';
const RUNTIME_CACHE = 'manatap-runtime-v2';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/my-decks',
  '/collections',
  '/wishlist',
  '/pricing',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
  self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control immediately
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API calls (always go to network)
  if (url.pathname.startsWith('/api/')) return;

  // Skip external requests
  if (url.origin !== self.location.origin) return;

  // NETWORK-FIRST for JavaScript bundles (critical for updates!)
  if (url.pathname.includes('/_next/') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh JS for offline use
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cached version only if network fails
          return caches.match(request);
        })
    );
    return;
  }

  // CACHE-FIRST for static assets (images, fonts, manifest)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log('[SW] Serving from cache:', url.pathname);
        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetch(request)
        .then((response) => {
          // Don't cache error responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clone the response before caching
          const responseToCache = response.clone();

          caches.open(RUNTIME_CACHE)
            .then((cache) => {
              console.log('[SW] Caching new resource:', url.pathname);
              cache.put(request, responseToCache);
            });

          return response;
        })
        .catch((error) => {
          console.error('[SW] Fetch failed:', error);
          // Return offline page if available
          return caches.match('/offline.html').then((offlineResponse) => {
            return offlineResponse || new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        });
    })
  );
});

// Message event - for cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service worker script loaded');
