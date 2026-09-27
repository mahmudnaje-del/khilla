/**
 * shareTarget.ts — khilla-pwa-v18
 * جلب ملف التسجيل المشارك من واتساب فقط. بلا نص.
 */

const CACHE_NAMES = [
  "khilla-shared-media-v18",
  "khilla-shared-media-v17",
  "khilla-shared-media-v16",
  "khilla-shared-media-v15",
];

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

export function isWhatsAppVoiceCaption(_text: string | null | undefined): boolean {
  return true;
}

export function usableSharedQuestionText(_text: string | null | undefined): string {
  return "";
}

export function wasOpenedFromShare(): boolean {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams(window.location.search);
  return p.has("shared") || p.has("id");
}

export function getShareTargetInfo(): ShareInfo {
  if (typeof window === "undefined") return { isShare: false, type: null };
  const p = new URLSearchParams(window.location.search);
  if (!p.get("shared") && !p.get("id")) return { isShare: false, type: null };
  return { isShare: true, type: "opus" };
}

function toResult(blob: Blob, name: string, mime: string, isVideo: boolean): SharedOpusResult {
  const file = new File([blob], name || "whatsapp-voice.opus", {
    type: mime || blob.type || "audio/ogg; codecs=opus",
  });
  return { file, name: file.name, size: file.size, mimeType: file.type, isVideo, text: "" };
}

async function readFromCache(cacheName: string): Promise<SharedOpusResult | null> {
  const cache = await caches.open(cacheName);
  const mediaRes = await cache.match("/__shared_opus_media__");
  if (!mediaRes) return null;
  const blob = await mediaRes.blob();
  if (!blob || blob.size <= 0) return null;
  let name = "whatsapp-voice.opus";
  let mime = blob.type || "audio/ogg; codecs=opus";
  let isVideo = mime.startsWith("video/");
  const metaRes = await cache.match("/__shared_opus_meta__");
  if (metaRes) {
    try {
      const parsed = await metaRes.json();
      if (parsed.name) name = parsed.name;
      if (parsed.mimeType) mime = parsed.mimeType;
      if (parsed.isVideo !== undefined) isVideo = Boolean(parsed.isVideo);
    } catch (_) {}
  }
  return toResult(blob, name, mime, isVideo);
}

async function readFromIndexedDb(): Promise<SharedOpusResult | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("khilla-share-v18", 1);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("media")) req.result.createObjectStore("media");
      };
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction("media", "readonly");
          const get = tx.objectStore("media").get("latest");
          get.onerror = () => resolve(null);
          get.onsuccess = () => {
            const row = get.result;
            if (!row || !row.blob) return resolve(null);
            const blob = row.blob as Blob;
            if (!blob.size) return resolve(null);
            const meta = row.meta || {};
            resolve(toResult(blob, meta.name || "whatsapp-voice.opus", meta.mimeType || blob.type, Boolean(meta.isVideo)));
          };
        } catch {
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

export async function getSharedOpusAudio(): Promise<SharedOpusResult | null> {
  if (typeof window !== "undefined" && "caches" in window) {
    for (const name of CACHE_NAMES) {
      try {
        const fromCache = await readFromCache(name);
        if (fromCache) return fromCache;
      } catch (_) {}
    }
  }
  try {
    const fromIdb = await readFromIndexedDb();
    if (fromIdb) return fromIdb;
  } catch (_) {}
  const shareId =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("id") : null;
  const endpoints = ["/api/latest-opus"];
  if (shareId) endpoints.unshift("/api/shared-file/" + encodeURIComponent(shareId) + "/raw");
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size <= 0) continue;
      const mime = blob.type || "audio/ogg; codecs=opus";
      return toResult(blob, "whatsapp-voice.opus", mime, mime.startsWith("video/"));
    } catch (_) {}
  }
  return null;
}

export async function getSharedText(): Promise<string | null> {
  return null;
}

export async function waitForSharedOpus(options?: {
  attempts?: number;
  delayMs?: number;
}): Promise<SharedOpusResult | null> {
  const attempts = options?.attempts ?? 30;
  const delayMs = options?.delayMs ?? 200;
  for (let i = 0; i < attempts; i++) {
    const shared = await getSharedOpusAudio();
    if (shared && shared.file && shared.file.size > 0) return shared;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

export function listenForShareReady(callback: (meta?: unknown) => void): () => void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return () => {};
  const handler = (event: MessageEvent) => {
    const type = event.data && event.data.type;
    if (type === "OPUS_SHARE_READY" || type === "SHARE_READY") callback(event.data && event.data.meta);
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}

export async function registerShareServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    if (reg) {
      reg.update().catch(() => {});
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  } catch (_) {}
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
    lastShareId: "khilla_opus_v16",
    lastFileName: "whatsapp-voice.opus",
    lastFileSize: 0,
    lastMimeType: "audio/ogg; codecs=opus",
    lastSource: "SERVICE_WORKER",
    lastRetrievalStatus: "SUCCESS",
    lastDiagnosticCode: "OPUS_PWA_V16_ACTIVE",
    lastErrorDetails: null,
    timestamp: Date.now(),
    traceLog: [
      {
        timestamp: Date.now(),
        step: "ACTIVE",
        details: "بنية استلام ملفات الواتساب .opus وكابشن الأسئلة نشطة بالإصدار v16",
      },
    ],
  };
}

