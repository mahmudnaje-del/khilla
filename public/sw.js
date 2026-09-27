/**
 * Service Worker — khilla-pwa-v19
 * لا نعترض POST /share-target.
 * اعتراض formData() كان يستهلك جسم الطلب، وعلى أندرويد غالباً يفشل clone()
 * فيُعاد التوجيه بلا ملف حتى لو كان التسجيل موجوداً.
 * الخادم يستلم الملف كما أرسله واتساب ويسلّمه للصفحة عبر IndexedDB + Cache.
 */
const PWA_CACHE_NAME = "khilla-pwa-v19";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PWA_CACHE_NAME).then((cache) => cache.addAll(["/", "/manifest.json"]).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((k) => {
            // كاش المشاركة يُحفظ دائماً. حذفه أثناء التفعيل كان يمسح تسجيل واتساب
            // قبل أن تقرأه الصفحة.
            if (k.startsWith("khilla-shared-media-")) return Promise.resolve(false);
            if (k !== PWA_CACHE_NAME) return caches.delete(k);
            return Promise.resolve(false);
          })
        )
      ),
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/share-target" || url.pathname === "/share-target/") return;
  if (url.pathname === "/__shared_opus_media__" || url.pathname === "/__shared_opus_meta__") return;
});
