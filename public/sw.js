/**
 * Service Worker — khilla-pwa-v18
 * استلام ملف التسجيل المشارك من واتساب فقط.
 */
const PWA_CACHE_NAME = "khilla-pwa-v18";
const SHARE_CACHE_NAME = "khilla-shared-media-v18";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(PWA_CACHE_NAME).then((cache) => cache.addAll(["/", "/manifest.json"]).catch(() => {})));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.map((k) => {
      if (k !== PWA_CACHE_NAME && k !== SHARE_CACHE_NAME) return caches.delete(k);
    })))
  ]));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isFileLike(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  const name = value.constructor && value.constructor.name;
  if (name === "File" || name === "Blob") return true;
  return typeof value.arrayBuffer === "function" || typeof value.stream === "function";
}

async function saveSharedMedia(buffer, fileName, mimeType) {
  const type = mimeType || "audio/ogg; codecs=opus";
  const blob = new Blob([buffer], { type: type });
  const meta = {
    name: fileName || "whatsapp-voice.opus",
    size: buffer.byteLength || buffer.length || 0,
    mimeType: type,
    isVideo: String(type).startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(fileName || ""),
    text: "",
    source: "SERVICE_WORKER",
    timestamp: Date.now()
  };
  const cache = await caches.open(SHARE_CACHE_NAME);
  await Promise.all([
    cache.put("/__shared_opus_media__", new Response(blob, {
      headers: { "Content-Type": type, "Content-Length": String(meta.size), "Cache-Control": "no-store" }
    })),
    cache.put("/__shared_opus_meta__", new Response(JSON.stringify(meta), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    }))
  ]);
  try {
    const dbReq = indexedDB.open("khilla-share-v18", 1);
    dbReq.onupgradeneeded = () => {
      if (!dbReq.result.objectStoreNames.contains("media")) dbReq.result.createObjectStore("media");
    };
    dbReq.onsuccess = () => {
      const tx = dbReq.result.transaction("media", "readwrite");
      tx.objectStore("media").put({ blob: blob, meta: meta }, "latest");
    };
  } catch (_) {}
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    for (const client of clients) client.postMessage({ type: "OPUS_SHARE_READY", meta: meta });
  } catch (_) {}
  return meta;
}

async function handleWhatsAppSharePost(request) {
  let cloneA;
  let cloneB;
  try { cloneA = request.clone(); } catch (_) {}
  try { cloneB = request.clone(); } catch (_) {}
  try {
    const formData = await request.formData();
    let targetFile = null;
    let targetName = "";
    for (const [key, value] of formData.entries()) {
      if (!isFileLike(value)) continue;
      const size = typeof value.size === "number" ? value.size : 0;
      if (!targetFile || size >= (targetFile.size || 0)) {
        targetFile = value;
        targetName = value.name || key || "whatsapp-voice.opus";
      }
    }
    if (targetFile) {
      const buffer = await targetFile.arrayBuffer();
      if (buffer && buffer.byteLength > 0) {
        let mime = targetFile.type || "";
        if (!mime || mime === "application/octet-stream" || mime === "application/ogg") {
          mime = "audio/ogg; codecs=opus";
        }
        if (!targetName || targetName === "blob" || targetName === "audio" || targetName === "file" || targetName === "media") {
          targetName = "whatsapp-voice.opus";
        }
        await saveSharedMedia(buffer, targetName, mime);
        // نسخة احتياط على السيرف إذا كان الكاش لا يكفي
        try {
          const body = new FormData();
          body.append("audio", new Blob([buffer], { type: mime }), targetName);
          fetch(new URL("/api/share-ingest", self.location.origin).href, { method: "POST", body: body }).catch(() => {});
        } catch (_) {}
        return Response.redirect(new URL("/?shared=opus", self.location.origin).href, 303);
      }
    }
  } catch (err) {
    console.warn("[SW] formData failed, forwarding to server", err);
  }
  if (cloneA) {
    try {
      return await fetch(cloneA);
    } catch (_) {}
  }
  if (cloneB) {
    try {
      return await fetch(cloneB);
    } catch (_) {}
  }
  return Response.redirect(new URL("/?shared=opus", self.location.origin).href, 303);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && (url.pathname === "/share-target" || url.pathname === "/share-target/")) {
    event.respondWith(handleWhatsAppSharePost(event.request));
    return;
  }
  if (event.request.method === "GET" && (url.pathname === "/share-target" || url.pathname === "/share-target/")) {
    event.respondWith(Response.redirect(new URL("/?shared=opus", self.location.origin).href, 303));
    return;
  }
  if (event.request.method === "GET" && (url.pathname === "/__shared_opus_media__" || url.pathname === "/__shared_opus_meta__")) {
    event.respondWith((async () => {
      const cache = await caches.open(SHARE_CACHE_NAME);
      const hit = await cache.match(url.pathname);
      return hit || new Response("", { status: 404 });
    })());
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
});
