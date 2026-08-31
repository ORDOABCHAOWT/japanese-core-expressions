const CACHE_NAME = "nihongo-core-v9";
const PRECACHE = [
  "/japanese",
  "/japanese/index.html",
  "/japanese/words.html",
  "/japanese/manifest.webmanifest",
  "/japanese/icon-192.png",
  "/japanese/icon-512.png",
  "/japanese/icon-1024.png",
];
const MODULE_PATHS = new Set([
  "/japanese",
  "/japanese/",
  "/japanese/index.html",
  "/japanese/words.html",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("nihongo-core-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    const offlineFallback = url.pathname.endsWith("/words.html")
      ? "/japanese/words.html"
      : "/japanese/index.html";

    if (MODULE_PATHS.has(url.pathname)) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request, { ignoreSearch: true });
        const networkUpdate = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        });

        if (cached) {
          event.waitUntil(networkUpdate.catch(() => undefined));
          return cached;
        }

        return networkUpdate.catch(() => cache.match(offlineFallback));
      })());
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true })
          .then((cached) => cached || caches.match(offlineFallback))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request)),
  );
});
