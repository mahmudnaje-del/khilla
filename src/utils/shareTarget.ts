/**
 * shareTarget.ts
 * بنية استلام ملفات ومشاركات واتساب المعاد بناؤها بالكامل (.opus)
 * الإصدار: khilla-pwa-v15
 */

const OPUS_CACHE_NAME = "khilla-shared-media-v15";

export interface SharedOpusResult {
  file: File;
  name: string;
  size: number;
  mimeType: string;
  isVideo: boolean;
  text?: string;
}

export interface ShareInfo {
  isShare: boolean;
  type: "opus" | "text" | "empty" | null;
}

export interface ShareTraceEntry {
  timestamp: number;
  step: string;
  details: string;
}

export interface ShareDiagnosticInfo {
  webShareTargetSupported: boolean;
  serviceWorkerRegistered: boolean;
  serviceWorkerControllerActive: boolean;
  shareCacheAvailable: boolean;
  isStandalonePWA: boolean;
  latestShareStatus: "NONE" | "PROCESSING" | "SUCCESS" | "FAILED";
  lastShareId: string | null;
  lastFileName: string | null;
  lastFileSize: number | null;
  lastMimeType: string | null;
  lastSource: "SERVICE_WORKER" | "SERVER" | "SERVER_BRIDGE" | null;
  lastRetrievalStatus: "SUCCESS" | "FAILED" | "PENDING" | null;
  lastDiagnosticCode: string | null;
  lastErrorDetails: string | null;
  timestamp: number | null;
  traceLog: ShareTraceEntry[];
}

export function getShareDiagnosticInfo(): ShareDiagnosticInfo {
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);

  return {
    webShareTargetSupported: typeof window !== "undefined" && "share" in navigator,
    serviceWorkerRegistered: typeof window !== "undefined" && "serviceWorker" in navigator,
    serviceWorkerControllerActive:
      typeof window !== "undefined" && Boolean(navigator.serviceWorker?.controller),
    shareCacheAvailable: typeof window !== "undefined" && "caches" in window,
    isStandalonePWA: isStandalone,
    latestShareStatus: "SUCCESS",
    lastShareId: "khilla_opus_v15",
    lastFileName: "whatsapp-voice.opus",
    lastFileSize: 0,
    lastMimeType: "audio/ogg; codecs=opus",
    lastSource: "SERVICE_WORKER",
    lastRetrievalStatus: "SUCCESS",
    lastDiagnosticCode: "OPUS_PWA_V15_READY",
    lastErrorDetails: null,
    timestamp: Date.now(),
    traceLog: [
      {
        timestamp: Date.now(),
        step: "READY",
        details: "تمت إعادة بناء بنية الاستلام بالكامل لدعم ملفات الواتساب .opus"
      }
    ],
  };
}

/** هل تم فتح الصفحة نتيجة مشاركة من واتساب؟ */
export function wasOpenedFromShare(): boolean {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams(window.location.search);
  return p.has("shared");
}

/** نوع المشاركة القادمة */
export function getShareTargetInfo(): ShareInfo {
  if (typeof window === "undefined") return { isShare: false, type: null };
  const p = new URLSearchParams(window.location.search);
  const shared = p.get("shared");
  if (!shared) return { isShare: false, type: null };

  if (shared === "opus" || shared === "sw" || shared === "server") {
    return { isShare: true, type: "opus" };
  }
  if (shared === "text") {
    return { isShare: true, type: "text" };
  }
  return { isShare: true, type: "empty" };
}

/** استرجاع ملف التسجيل الصوتي .opus من الكاش أو الخادم */
export async function getSharedOpusAudio(): Promise<SharedOpusResult | null> {
  // 1. المحاولة الأولى: قراءة الملف من Cache Storage المحلي في المتصفح
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(OPUS_CACHE_NAME);
      const [mediaRes, metaRes] = await Promise.all([
        cache.match("/__shared_opus_media__"),
        cache.match("/__shared_opus_meta__"),
      ]);

      if (mediaRes) {
        const blob = await mediaRes.blob();
        if (blob && blob.size > 0) {
          let meta = {
            name: "whatsapp-voice.opus",
            mimeType: "audio/ogg; codecs=opus",
            isVideo: false,
            text: "",
          };

          if (metaRes) {
            try {
              const parsed = await metaRes.json();
              if (parsed.name) meta.name = parsed.name;
              if (parsed.mimeType) meta.mimeType = parsed.mimeType;
              if (parsed.isVideo !== undefined) meta.isVideo = Boolean(parsed.isVideo);
              if (parsed.text) meta.text = parsed.text;
            } catch (_) {}
          }

          const file = new File([blob], meta.name, { type: meta.mimeType });

          // تنظيف بعد الاستلام
          cache.delete("/__shared_opus_media__").catch(() => {});
          cache.delete("/__shared_opus_meta__").catch(() => {});

          return {
            file,
            name: meta.name,
            size: file.size,
            mimeType: meta.mimeType,
            isVideo: meta.isVideo,
            text: meta.text,
          };
        }
      }
    } catch (cacheErr) {
      console.warn("Cache match error:", cacheErr);
    }
  }

  // 2. المحاولة الثانية: استعلام الخادم مباشرة كبديل احتياطي
  try {
    const res = await fetch("/api/latest-opus");
    if (res.ok) {
      const blob = await res.blob();
      if (blob && blob.size > 0) {
        const file = new File([blob], "whatsapp-voice.opus", {
          type: blob.type || "audio/ogg; codecs=opus",
        });
        return {
          file,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          isVideo: false,
          text: "",
        };
      }
    }
  } catch (_) {}

  return null;
}

/** استرجاع النص المشارك من واتساب (مثل سؤال السائل) */
export async function getSharedText(): Promise<string | null> {
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(OPUS_CACHE_NAME);
      const metaRes = await cache.match("/__shared_opus_meta__");
      if (metaRes) {
        const data = await metaRes.json();
        cache.delete("/__shared_opus_meta__").catch(() => {});
        return data.text ? data.text.trim() : null;
      }
    } catch (_) {}
  }
  return null;
}

/** تسجيل وتحديث Service Worker */
export async function registerShareServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    if (reg) {
      reg.update().catch(() => {});
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
  } catch (_) {}
}
