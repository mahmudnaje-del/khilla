/**
 * Service Worker — khilla-pwa-v16
 */
const PWA_CACHE_NAME = "khilla-pwa-v16";
const SHARE_CACHE_NAME = "khilla-shared-media-v16";
const ESSENTIAL_ASSETS = ["/", "/index.html", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];
function isWhatsAppVoiceCaption(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (!t || t.length > 180) return false;
  if (/^(?:مقطع\s+(?:صوتي|فيديو)|رسالة\s+صوتية|تسجيل\s+صوتي)\s+من\b/i.test(t)) return true;
  if (/^Voice\s+(?:message|note)\s+from\b/i.test(t)) return true;
  if (/^Audio(?:\s+message)?\s+from\b/i.test(t)) return true;
  if (/^Video\s+from\b/i.test(t)) return true;
  if (/^PTT[-_\s]/i.test(t) || /^AUD[-_\s]/i.test(t)) return true;
  if (/\.(?:opus|ogg|oga|amr|m4a|mp3|wav)$/i.test(t) && t.length < 80) return true;
  return false;
}
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(PWA_CACHE_NAME).then((cache) => cache.addAll(ESSENTIAL_ASSETS).catch(() => {})));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k !== PWA_CACHE_NAME && k !== SHARE_CACHE_NAME ? caches.delete(k) : undefined))))
  ]));
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && (url.pathname === "/share-target" || url.pathname === "/share-target/")) {
    event.respondWith(handleWhatsAppSharePost(event.request));
    return;
  }
  if (event.request.method === "GET" && (url.pathname === "/share-target" || url.pathname === "/share-target/")) {
    event.respondWith(Response.redirect(new URL("/", self.location.origin).href, 303));
    return;
  }
  if (event.request.method === "GET" && (url.pathname.startsWith("/__shared_opus_media__") || url.pathname.startsWith("/__shared_opus_meta__"))) {
    event.respondWith(serveShareCache(event.request));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method === "GET") {
    event.respondWith(fetch(event.request).then((res) => {
      if (res && res.status === 200 && res.type === "basic") {
        const clone = res.clone();
        caches.open(PWA_CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
      }
      return res;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const fallback = await caches.match("/");
        if (fallback) return fallback;
      }
      return Response.error();
    }));
  }
});
async function handleWhatsAppSharePost(request) {
  let reqClone;
  try { reqClone = request.clone(); } catch (_) {}
  try {
    const formData = await request.formData();
    let targetFile = null;
    let targetFileName = "";
    let sharedText = "";
    let sharedTitle = "";
    for (const [key, value] of formData.entries()) {
      const isFileLike = value && typeof value === "object" && typeof value.size === "number" && typeof value.arrayBuffer === "function";
      if (isFileLike && value.size > 0) {
        if (!targetFile || value.size > targetFile.size) {
          targetFile = value;
          targetFileName = value.name || key || "";
        }
        continue;
      }
      if (typeof value === "string" && value.trim().length > 0) {
        if (key === "title") sharedTitle = value.trim();
        else if (key === "text" || !sharedText) sharedText = value.trim();
      }
    }
    const combinedText = sharedText || sharedTitle;
    const cache = await caches.open(SHARE_CACHE_NAME);
    if (targetFile && targetFile.size > 0) {
      const fileBuffer = await targetFile.arrayBuffer();
      let fileName = targetFileName;
      if (!fileName || fileName === "blob" || fileName === "audio" || !fileName.includes(".")) fileName = "whatsapp-voice.opus";
      const isVideo = /\.(mp4|mov|webm|mkv|3gp)$/i.test(fileName) || (targetFile.type || "").startsWith("video/");
      let mimeType = targetFile.type;
      if (!mimeType || mimeType === "application/octet-stream" || mimeType === "application/ogg") mimeType = isVideo ? "video/mp4" : "audio/ogg; codecs=opus";
      const caption = isWhatsAppVoiceCaption(combinedText) ? "" : combinedText;
      const mediaBlob = new Blob([fileBuffer], { type: mimeType });
      const meta = { name: fileName, size: fileBuffer.byteLength, mimeType, isVideo, text: caption, source: "SERVICE_WORKER", timestamp: Date.now() };
      await Promise.all([
        cache.put("/__shared_opus_media__", new Response(mediaBlob, { headers: { "Content-Type": mimeType, "Content-Length": String(fileBuffer.byteLength), "Cache-Control": "no-store" } })),
        cache.put("/__shared_opus_meta__", new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }))
      ]);
      try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
        for (const client of clients) client.postMessage({ type: "OPUS_SHARE_READY", meta });
      } catch (_) {}
      return Response.redirect(new URL("/?shared=opus", self.location.origin).href, 303);
    }
    if (combinedText && isWhatsAppVoiceCaption(combinedText)) {
      return Response.redirect(new URL("/?shared=empty", self.location.origin).href, 303);
    }
    if (combinedText && combinedText.length > 0) {
      const meta = { name: "", size: 0, mimeType: "text/plain", isVideo: false, text: combinedText, source: "SERVICE_WORKER", timestamp: Date.now() };
      await cache.put("/__shared_opus_meta__", new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
      return Response.redirect(new URL("/?shared=text", self.location.origin).href, 303);
    }
    return Response.redirect(new URL("/?shared=empty", self.location.origin).href, 303);
  } catch (err) {
    if (reqClone) {
      try { return await fetch(reqClone); } catch (_) {}
    }
    return Response.redirect(new URL("/?shared=empty", self.location.origin).href, 303);
  }
}
async function serveShareCache(request) {
  try {
    const url = new URL(request.url);
    const cache = await caches.open(SHARE_CACHE_NAME);
    const match = (await cache.match(url.pathname)) || (await cache.match(request.url));
    if (match) return match;
    return new Response("", { status: 404 });
  } catch {
    return new Response("", { status: 404 });
  }
}
