const CACHE_NAME = "nihongo-core-v10";
const PRECACHE = [
  "/japanese",
  "/japanese/words",
  "/japanese/manifest.webmanifest",
  "/japanese/icon-192.png",
  "/japanese/icon-512.png",
  "/japanese/icon-1024.png",
];
const MODULE_PATHS = new Set([
  "/japanese",
  "/japanese/",
  "/japanese/index.html",
  "/japanese/words",
  "/japanese/words.html",
]);

function canonicalModulePath(pathname) {
  return pathname === "/japanese/words" || pathname === "/japanese/words.html"
    ? "/japanese/words"
    : "/japanese";
}

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
    const offlineFallback = canonicalModulePath(url.pathname);

    if (MODULE_PATHS.has(url.pathname)) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const canonicalRequest = new Request(offlineFallback, { credentials: "same-origin" });
        const cached = await cache.match(canonicalRequest, { ignoreSearch: true });
        const networkUpdate = fetch(canonicalRequest).then((response) => {
          if (response.ok) cache.put(canonicalRequest, response.clone());
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
