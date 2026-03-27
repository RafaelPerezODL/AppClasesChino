/* ══════════════════════════════════════════════════════════
   学中文  —  Service Worker (PWA offline support)
   ══════════════════════════════════════════════════════════ */

const CACHE_NAME = "xuzhongwen-v2";

// Assets to pre-cache for offline use
const PRECACHE_URLS = [
    "/",
    "/static/css/styles.css",
    "/static/js/app.js",
    "/static/js/conversation.js",
    "/static/manifest.json",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png",
    "/api/vocabulary",
    "/api/phrases",
];

// Install: cache core assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("[SW] Pre-caching core assets");
            return cache.addAll(PRECACHE_URLS);
        })
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((n) => n !== CACHE_NAME)
                    .map((n) => caches.delete(n))
            )
        )
    );
    self.clients.claim();
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // OpenAI proxy calls — always need network, don't cache
    if (url.pathname.startsWith("/api/openai/")) {
        return;
    }

    // Audio files — cache on first use (runtime caching)
    if (url.pathname.startsWith("/static/audio/")) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) =>
                cache.match(event.request).then((cached) => {
                    if (cached) return cached;
                    return fetch(event.request).then((resp) => {
                        if (resp.ok) cache.put(event.request, resp.clone());
                        return resp;
                    });
                })
            )
        );
        return;
    }

    // API data (vocabulary, phrases) — network first, fall back to cache
    if (url.pathname.startsWith("/api/")) {
        event.respondWith(
            fetch(event.request)
                .then((resp) => {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
                    return resp;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Everything else — cache first, fall back to network
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((resp) => {
                if (resp.ok) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
                }
                return resp;
            });
        })
    );
});
