/**
 * Service Worker — khilla-pwa-v27
 * Authoritative Web Share Target Ingestion Pipeline
 * Cache: shared-media-v1
 * Keys: /__shared-audio__ and /__shared-meta__
 */

const PWA_CACHE_NAME = "khilla-pwa-v27";
const SHARED_CACHE_NAME = "shared-media-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PWA_CACHE_NAME).then((cache) =>
      cache.addAll(["/", "/manifest.json"]).catch(() => {})
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((k) => {
            // The share cache shared-media-v1 MUST survive Service Worker activation/update!
            if (k === SHARED_CACHE_NAME || k === PWA_CACHE_NAME) {
              return Promise.resolve(false);
            }
            return caches.delete(k);
          })
        )
      ),
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Let the document navigation deliver the multipart POST to the server.
  // Consuming it here and redirecting drops the recording when the cache
  // write is not visible to the next page, which looks like a silent ignore.
  if (
    (url.pathname === "/share-target" || url.pathname === "/share-target/") &&
    event.request.method === "POST"
  ) {
    return;
  }

  // Bypass API requests
  if (url.pathname.startsWith("/api/")) return;
});
