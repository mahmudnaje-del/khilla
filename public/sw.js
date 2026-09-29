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

  // 1. PRIMARY INGESTION: Intercept POST /share-target
  if (
    (url.pathname === "/share-target" || url.pathname === "/share-target/") &&
    event.request.method === "POST"
  ) {
    console.log("[SHARE-SW] POST received");

    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          console.log("[SHARE-SW] FormData parsed");

          // Locate the actual File
          let file = null;

          // Check standard keys first
          const expectedKeys = ["audio", "file", "media", "files"];
          for (const key of expectedKeys) {
            const val = formData.get(key);
            if (val && typeof val === "object" && typeof val.size === "number" && val.size > 0) {
              file = val;
              break;
            }
          }

          // If not found in standard keys, iterate through all FormData entries
          if (!file) {
            for (const [, val] of formData.entries()) {
              if (val && typeof val === "object" && typeof val.size === "number" && val.size > 0) {
                file = val;
                break;
              }
            }
          }

          const rawTitle = String(formData.get("title") || "").trim();
          const rawText = String(formData.get("text") || "").trim();
          const combinedText = [rawTitle, rawText].filter(Boolean).join("\n").trim();

          if (file) {
            console.log(`[SHARE-SW] File found: ${file.name || "unknown"} (${file.size} bytes)`);

            // Normalize MIME type based on filename extension + MIME type
            const fileName = file.name || "whatsapp-voice.opus";
            const lowerName = fileName.toLowerCase();
            let mimeType = (file.type || "").split(";")[0].toLowerCase().trim();

            if (lowerName.endsWith(".opus") || lowerName.endsWith(".ogg") || lowerName.endsWith(".oga")) {
              mimeType = "audio/ogg";
            } else if (lowerName.endsWith(".mp3")) {
              mimeType = "audio/mpeg";
            } else if (lowerName.endsWith(".wav")) {
              mimeType = "audio/wav";
            } else if (lowerName.endsWith(".m4a")) {
              mimeType = "audio/mp4";
            } else if (lowerName.endsWith(".aac")) {
              mimeType = "audio/aac";
            } else if (lowerName.endsWith(".amr")) {
              mimeType = "audio/amr";
            } else if (lowerName.endsWith(".3gp")) {
              mimeType = "audio/3gpp";
            } else if (lowerName.endsWith(".mp4")) {
              mimeType = "video/mp4";
            } else if (lowerName.endsWith(".mov")) {
              mimeType = "video/quicktime";
            } else if (lowerName.endsWith(".webm")) {
              mimeType = mimeType.startsWith("video/") ? "video/webm" : "audio/webm";
            }

            if (!mimeType || mimeType === "application/octet-stream" || mimeType === "application/ogg") {
              mimeType = lowerName.endsWith(".mp4") ? "video/mp4" : "audio/ogg";
            }

            const metadata = {
              name: fileName,
              size: file.size,
              originalType: file.type || "",
              mimeType: mimeType,
              receivedAt: Date.now(),
              text: combinedText || undefined,
            };

            // Store the real File in Cache Storage: shared-media-v1
            const cache = await caches.open(SHARED_CACHE_NAME);

            // Clear any previous share entry
            await cache.delete("/__shared-audio__");
            await cache.delete("/__shared-meta__");

            // Store actual Blob/File
            await cache.put(
              "/__shared-audio__",
              new Response(file, {
                headers: {
                  "Content-Type": metadata.mimeType,
                  "Content-Length": String(file.size),
                },
              })
            );

            // Store metadata
            await cache.put(
              "/__shared-meta__",
              new Response(JSON.stringify(metadata), {
                headers: { "Content-Type": "application/json" },
              })
            );

            console.log("[SHARE-SW] File stored in " + SHARED_CACHE_NAME);
            console.log("[SHARE-SW] Redirecting to /?shared=1");

            // Redirect using HTTP 303 to /?shared=1
            return Response.redirect("/?shared=1", 303);
          }

          // If no file, but text was shared
          if (combinedText) {
            console.log("[SHARE-SW] Text-only share received");
            const metadata = {
              name: "shared-text.txt",
              size: combinedText.length,
              originalType: "text/plain",
              mimeType: "text/plain",
              receivedAt: Date.now(),
              text: combinedText,
            };

            const cache = await caches.open(SHARED_CACHE_NAME);
            await cache.delete("/__shared-audio__");
            await cache.delete("/__shared-meta__");
            await cache.put(
              "/__shared-meta__",
              new Response(JSON.stringify(metadata), {
                headers: { "Content-Type": "application/json" },
              })
            );

            console.log("[SHARE-SW] Redirecting to /?shared=1");
            return Response.redirect("/?shared=1", 303);
          }

          console.warn("[SHARE-SW] No file and no text in share payload");
          return Response.redirect("/?shared=0", 303);
        } catch (err) {
          console.error("[SHARE-SW] Share Target Error:", err);
          return Response.redirect("/?shared=error", 303);
        }
      })()
    );
    return;
  }

  // Bypass API requests
  if (url.pathname.startsWith("/api/")) return;
});
