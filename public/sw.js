/* Service Worker — Your World Arcade PWA v1 */
const CACHE = 'arcade-v42';
const SHELL = [
    '/',
    '/css/arcade.css?v=42',
    '/css/command-center.css?v=42',
    '/js/utils/api.js?v=42',
    '/js/utils/router.js?v=42',
    '/js/utils/helpers.js?v=42',
    '/js/utils/themes.js?v=42',
    '/js/utils/arcade-engine.js?v=42',
    '/js/components/game-card.js?v=42',
    '/js/views/home.js?v=42',
    '/js/views/library.js?v=42',
    '/js/views/game.js?v=42',
    '/js/views/recommendations.js?v=42',
    '/js/views/completion.js?v=42',
    '/js/app.js?v=42',
    '/manifest.json',
];

// Install — pre-cache app shell
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

// Activate — purge old caches
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch strategy:
// - API calls → network-first (fresh data), fall back to cache
// - Static assets → cache-first (fast loads)
// - Artwork images → cache-first with network fallback (large files)
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Never intercept non-GET or cross-origin
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

    // API: network-first
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(
            fetch(e.request).then(res => {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
                return res;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // Artwork: cache-first
    if (url.pathname.startsWith('/artwork/') || url.pathname.startsWith('/images/')) {
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) return cached;
                return fetch(e.request).then(res => {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                    return res;
                });
            })
        );
        return;
    }

    // Static JS/CSS: cache-first
    if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) {
        e.respondWith(
            caches.match(e.request).then(cached => cached || fetch(e.request))
        );
        return;
    }

    // HTML / root: network-first, fall back to cached shell
    e.respondWith(
        fetch(e.request).catch(() => caches.match('/'))
    );
});
