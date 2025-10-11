// ManaTap AI - Service Worker for PWA functionality
// Provides offline support, caching, and background sync

const CACHE_NAME = 'manatap-ai-v1.0.0';
const STATIC_CACHE_NAME = 'manatap-static-v1.0.0';
const API_CACHE_NAME = 'manatap-api-v1.0.0';

// Static assets to always cache
const STATIC_ASSETS = [
  '/',
  '/my-decks',
  '/collections',
  '/manifest.json',
  '/favicon.ico',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  // Add critical CSS and JS files (Next.js will inject these)
];

// API endpoints to cache for offline access
const CACHEABLE_APIS = [
  '/api/decks/my',
  '/api/collections/list',
  '/api/cards/batch-images',
  '/api/price/snapshot',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => 
              cacheName !== CACHE_NAME && 
              cacheName !== STATIC_CACHE_NAME && 
              cacheName !== API_CACHE_NAME
            )
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      }),
      // Take control of all pages
      self.clients.claim()
    ])
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle different types of requests
  if (url.pathname.startsWith('/api/')) {
    // API requests - network first, cache fallback for specific endpoints
    event.respondWith(handleApiRequest(request));
  } else if (url.pathname.startsWith('/_next/') || url.pathname.includes('.')) {
    // Static assets - cache first
    event.respondWith(handleStaticRequest(request));
  } else {
    // HTML pages - network first with cache fallback
    event.respondWith(handlePageRequest(request));
  }
});

// Handle API requests with selective caching
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const shouldCache = CACHEABLE_APIs.some(api => url.pathname.startsWith(api));
  
  if (!shouldCache) {
    // Don't cache sensitive API calls, just try network
    try {
      return await fetch(request);
    } catch (error) {
      console.log('[SW] API request failed:', url.pathname);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Network unavailable - please check your connection',
          offline: true 
        }),
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  // For cacheable APIs - network first, cache fallback
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', url.pathname);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline-friendly response
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: 'Offline - data not available',
        offline: true 
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle static asset requests
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Static asset fetch failed:', request.url);
    return new Response('Asset not available offline', { status: 503 });
  }
}

// Handle page requests
async function handlePageRequest(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Page fetch failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/') || 
        await caches.match('/offline.html');
      return offlinePage || new Response(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>ManaTap AI - Offline</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              body { font-family: -apple-system, sans-serif; text-align: center; padding: 2rem; background: #0a0a0a; color: #fff; }
              .container { max-width: 500px; margin: 0 auto; }
              .icon { font-size: 4rem; margin-bottom: 1rem; }
              h1 { color: #2563eb; margin-bottom: 0.5rem; }
              p { opacity: 0.8; margin-bottom: 2rem; }
              button { background: #2563eb; color: white; border: none; padding: 1rem 2rem; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; }
              button:hover { background: #1d4ed8; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">⚡</div>
              <h1>ManaTap AI</h1>
              <p>You're offline, but some features are still available!</p>
              <button onclick="window.location.reload()">Try Again</button>
            </div>
          </body>
        </html>`,
        { 
          status: 200, 
          headers: { 'Content-Type': 'text/html' } 
        }
      );
    }

    return new Response('Page not available offline', { status: 503 });
  }
}

// Background sync for failed requests (future enhancement)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'deck-updates') {
    event.waitUntil(syncDeckUpdates());
  }
});

async function syncDeckUpdates() {
  // Placeholder for syncing deck changes when back online
  console.log('[SW] Syncing deck updates...');
}

// Push notifications (future enhancement)
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);
  
  const options = {
    body: 'Price alert or system update',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('ManaTap AI', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});

console.log('[SW] Service worker loaded successfully');