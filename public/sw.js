/**
 * Service Worker — مفرّغ فتاوى الشيخ د. عبد الباري خلة
 * الإصدار: khilla-pwa-v15 (إعادة بناء شاملة لبنية استلام ملفات الواتساب .opus)
 */

const PWA_CACHE_NAME = "khilla-pwa-v15";
const SHARE_CACHE_NAME = "khilla-shared-media-v15";

const ESSENTIAL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PWA_CACHE_NAME).then((cache) => {
      return cache.addAll(ESSENTIAL_ASSETS).catch(() => {});
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((k) => {
            if (k !== PWA_CACHE_NAME && k !== SHARE_CACHE_NAME) {
              return caches.delete(k);
            }
          })
        );
      })
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

  // 1. استقبال مشاركة واتساب (POST /share-target)
  if (
    event.request.method === "POST" &&
    (url.pathname === "/share-target" || url.pathname === "/share-target/")
  ) {
    event.respondWith(handleWhatsAppSharePost(event.request));
    return;
  }

  // في حال تم طلب /share-target بـ GET
  if (
    event.request.method === "GET" &&
    (url.pathname === "/share-target" || url.pathname === "/share-target/")
  ) {
    event.respondWith(Response.redirect(new URL("/", self.location.origin).href, 303));
    return;
  }

  // 2. تسليم ملفات وميتاداتا المشاركة من الكاش
  if (
    event.request.method === "GET" &&
    (url.pathname.startsWith("/__shared_opus_media__") || url.pathname.startsWith("/__shared_opus_meta__"))
  ) {
    event.respondWith(serveShareCache(event.request));
    return;
  }

  // 3. استثناء مسارات الـ API
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 4. التخزين المؤقت للأصول والصفحات
  if (event.request.method === "GET") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const clone = res.clone();
            caches.open(PWA_CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            const fallback = await caches.match("/");
            if (fallback) return fallback;
          }
          return Response.error();
        })
    );
  }
});

/**
 * المعالج الرئيسي لاستقبال ملفات ومشاركات واتساب في الـ Service Worker
 */
async function handleWhatsAppSharePost(request) {
  let reqClone;
  try {
    reqClone = request.clone();
  } catch (_) {}

  try {
    const formData = await request.formData();

    let targetFile = null;
    let targetFileName = "";
    let sharedText = "";

    // استخراج الملفات والنصوص من كافة الحقول
    for (const [key, value] of formData.entries()) {
      if (value && typeof value === "object" && typeof value.size === "number" && value.size > 0) {
        if (!targetFile || value.size > targetFile.size) {
          targetFile = value;
          targetFileName = value.name || "";
        }
      } else if (typeof value === "string" && value.trim().length > 0) {
        if (!sharedText || key === "text") {
          sharedText = value.trim();
        }
      }
    }

    const cache = await caches.open(SHARE_CACHE_NAME);

    // الحالة الأولى: وصول ملف صوتي (أو فيديو) من واتساب
    if (targetFile && targetFile.size > 0) {
      const fileBuffer = await targetFile.arrayBuffer();

      let fileName = targetFileName;
      if (!fileName || fileName === "blob" || !fileName.includes(".")) {
        fileName = "whatsapp-voice.opus";
      }

      const isVideo = /\.(mp4|mov|webm|mkv|3gp)$/i.test(fileName) || (targetFile.type || "").startsWith("video/");
      let mimeType = targetFile.type;
      if (!mimeType || mimeType === "application/octet-stream") {
        mimeType = isVideo ? "video/mp4" : "audio/ogg; codecs=opus";
      }

      const mediaBlob = new Blob([fileBuffer], { type: mimeType });
      const meta = {
        name: fileName,
        size: fileBuffer.byteLength,
        mimeType: mimeType,
        isVideo: isVideo,
        text: sharedText,
        source: "SERVICE_WORKER",
        timestamp: Date.now()
      };

      await Promise.all([
        cache.put("/__shared_opus_media__", new Response(mediaBlob, {
          headers: { "Content-Type": mimeType, "Content-Length": String(fileBuffer.byteLength), "Cache-Control": "no-store" }
        })),
        cache.put("/__shared_opus_meta__", new Response(JSON.stringify(meta), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
        }))
      ]);

      // إشعار النوافذ المفتوحة
      try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
        for (const client of clients) {
          client.postMessage({ type: "OPUS_SHARE_READY", meta });
        }
      } catch (_) {}

      return Response.redirect(new URL("/?shared=opus", self.location.origin).href, 303);
    }

    // الحالة الثانية: مشاركة نص فقط من واتساب (مثل سؤال السائل)
    if (sharedText && sharedText.length > 0) {
      const meta = {
        name: "",
        size: 0,
        mimeType: "text/plain",
        isVideo: false,
        text: sharedText,
        source: "SERVICE_WORKER",
        timestamp: Date.now()
      };

      await cache.put("/__shared_opus_meta__", new Response(JSON.stringify(meta), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      }));

      return Response.redirect(new URL("/?shared=text", self.location.origin).href, 303);
    }

    // الحالة الثالثة: لم يصل أي ملف أو نص
    return Response.redirect(new URL("/?shared=empty", self.location.origin).href, 303);
  } catch (err) {
    console.warn("[SW]: formData parse error, passing to server:", err);
    if (reqClone) {
      try {
        return await fetch(reqClone);
      } catch (_) {}
    }
    return Response.redirect(new URL("/?shared=empty", self.location.origin).href, 303);
  }
}

/** تسليم محتوى الكاش */
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
