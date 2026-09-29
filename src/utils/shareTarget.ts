/**
 * shareTarget.ts — Authoritative WhatsApp / Web Share Target File Ingestion
 * Primary Path:
 * WhatsApp → Android Share → Service Worker (POST /share-target)
 * → Cache Storage (shared-media-v1: /__shared-audio__ & /__shared-meta__)
 * → Redirect /?shared=1 → React consumeSharedAudio() → handleFileSelect(file)
 * → deleteConsumedShareCache()
 */

import { isRealQuestionText } from './greetingSanitizer';

export const SHARED_CACHE_NAME = "shared-media-v1";
const PENDING_KEY = "khilla-pending-share";
const PENDING_MAX_AGE_MS = 3 * 60 * 1000;

export interface SharedAudioResult {
  file: File;
  name: string;
  size: number;
  mimeType: string;
  isVideo: boolean;
  text?: string;
}

// Backward compatibility alias
export type SharedOpusResult = SharedAudioResult;

export interface ShareInfo {
  isShare: boolean;
  type: "opus" | "text" | "empty" | "opus_dropped" | null;
  id: string | null;
  sender?: string | null;
}

interface PendingShare {
  shared: string | null;
  id: string | null;
  sender?: string | null;
  at: number;
  status?: "miss";
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

function readPending(): PendingShare | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingShare;
    if (!parsed || Date.now() - (parsed.at || 0) > PENDING_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function rememberShareLaunch(): void {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams(window.location.search);
  const shared = p.get("shared");
  const id = p.get("id");
  const sender = p.get("sender");
  if (!shared && !id && !sender) return;
  const prev = readPending();
  try {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        shared: shared || prev?.shared || "1",
        id: id || prev?.id || null,
        sender: sender || prev?.sender || null,
        at: Date.now(),
        status: prev?.status,
      })
    );
  } catch {
    /* private mode */
  }
}

export function markShareMissed(): void {
  if (typeof window === "undefined") return;
  const prev = readPending();
  try {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        shared: prev?.shared || "miss",
        id: prev?.id || null,
        at: prev?.at || Date.now(),
        status: "miss",
      })
    );
  } catch {
    /* ignore */
  }
}

export function clearPendingShare(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function wasOpenedFromShare(): boolean {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams(window.location.search);
  if (p.get("shared") === "1" || p.has("shared") || p.has("id")) return true;
  const pending = readPending();
  return Boolean(pending && pending.status !== "miss");
}

export function getShareTargetInfo(): ShareInfo {
  if (typeof window === "undefined") return { isShare: false, type: null, id: null, sender: null };
  const p = new URLSearchParams(window.location.search);
  const pending = readPending();
  const shared = p.get("shared") || pending?.shared || "";
  const id = p.get("id") || pending?.id || null;
  const sender = p.get("sender") || pending?.sender || null;
  if (!shared && !id && !sender) return { isShare: false, type: null, id: null, sender: null };
  if (shared === "text") return { isShare: true, type: "text", id, sender };
  if (shared === "empty" || shared === "nofile" || shared === "error") {
    return { isShare: true, type: "opus", id, sender };
  }
  return { isShare: true, type: "opus", id, sender };
}

export function usableSharedQuestionText(text: string | null | undefined): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!isRealQuestionText(trimmed)) return "";
  return trimmed;
}

/**
 * PRIMARY INGESTION CONSUMPTION:
 * Opens shared-media-v1, reads /__shared-audio__ and /__shared-meta__,
 * reconstructs a real File object, and returns it.
 * IMPORTANT: Does NOT delete the cache entry until deleteConsumedShareCache() is explicitly called!
 */
export async function consumeSharedAudio(): Promise<SharedAudioResult | null> {
  console.log("[SHARE-CLIENT] share detected");
  console.log("[SHARE-CLIENT] opening cache " + SHARED_CACHE_NAME);

  if (typeof window === "undefined" || !("caches" in window)) {
    return null;
  }

  // Poll cache for up to 15 attempts (~1.5s total) in case SW write completes right at navigation start
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const cache = await caches.open(SHARED_CACHE_NAME);
      const audioRes = await cache.match("/__shared-audio__");
      const metaRes = await cache.match("/__shared-meta__");

      if (audioRes) {
        const blob = await audioRes.blob();
        if (blob && blob.size > 0) {
          let meta: { name?: string; size?: number; mimeType?: string; isVideo?: boolean; text?: string } = {};
          if (metaRes) {
            meta = await metaRes.json().catch(() => ({}));
          }

          const fileName = meta.name || "whatsapp-voice.opus";
          const mimeType = (meta.mimeType || blob.type || "audio/ogg").split(";")[0].trim();
          const isVideo = Boolean(meta.isVideo || mimeType.startsWith("video/") || /\.(mp4|mov|webm|mkv|3gp)$/i.test(fileName));
          const text = meta.text || "";

          console.log(`[SHARE-CLIENT] audio found: ${fileName} (${blob.size} bytes)`);

          // Reconstruct a real File object
          const file = new File([blob], fileName, { type: mimeType });
          console.log("[SHARE-CLIENT] File reconstructed");

          return {
            file,
            name: fileName,
            size: file.size,
            mimeType,
            isVideo,
            text,
          };
        }
      }
    } catch (err) {
      console.warn("[SHARE-CLIENT] Cache read attempt error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Fallback: If an explicit server-side ID was passed in query parameter
  const p = new URLSearchParams(window.location.search);
  const serverId = p.get("id");
  if (serverId) {
    try {
      const res = await fetch(`/api/shared-file/${encodeURIComponent(serverId)}/raw`, { cache: "no-store" });
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0) {
          const mimeType = (blob.type || "audio/ogg").split(";")[0];
          const disposition = res.headers.get("Content-Disposition") || "";
          const match = disposition.match(/filename="?([^";]+)"?/i);
          const fileName = match ? decodeURIComponent(match[1]) : "whatsapp-voice.opus";
          const file = new File([blob], fileName, { type: mimeType });
          return {
            file,
            name: fileName,
            size: file.size,
            mimeType,
            isVideo: mimeType.startsWith("video/"),
            text: "",
          };
        }
      }
    } catch (_) {}
  }

  return null;
}

// Backward compatibility aliases
export const waitForSharedOpus = consumeSharedAudio;
export const getSharedOpusAudio = consumeSharedAudio;

/**
 * Clean up consumed cache entries AFTER successful handoff to handleFileSelect()
 */
export async function deleteConsumedShareCache(): Promise<void> {
  try {
    if (typeof window !== "undefined" && "caches" in window) {
      const cache = await caches.open(SHARED_CACHE_NAME);
      await cache.delete("/__shared-audio__");
      await cache.delete("/__shared-meta__");
    }
  } catch (_) {}

  clearPendingShare();

  if (typeof window !== "undefined" && window.location.search) {
    window.history.replaceState({}, "", window.location.pathname);
  }
}

/**
 * Retrieve shared text if no audio file was attached
 */
export async function consumeSharedText(): Promise<string | null> {
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(SHARED_CACHE_NAME);
      const metaRes = await cache.match("/__shared-meta__");
      if (metaRes) {
        const meta = await metaRes.json().catch(() => ({}));
        if (meta && typeof meta.text === "string" && meta.text.trim()) {
          return usableSharedQuestionText(meta.text);
        }
      }
    } catch (_) {}
  }

  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search);
    const urlText = p.get("text") || p.get("title");
    if (urlText && urlText.trim()) {
      return usableSharedQuestionText(decodeURIComponent(urlText).trim());
    }
  }

  return null;
}

// Backward compatibility alias
export const getSharedText = consumeSharedText;

export async function clearAllOldShareCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const keys = await caches.keys();
    for (const k of keys) {
      if (k !== SHARED_CACHE_NAME && k.startsWith("khilla-shared-media-")) {
        await caches.delete(k);
      }
    }
  } catch (_) {}
}

export function listenForOpenedFiles(onFile: (file: File) => void): void {
  if (typeof window === "undefined") return;
  const queue = (window as Window & {
    launchQueue?: {
      setConsumer: (cb: (params: { files?: Array<{ getFile: () => Promise<File> }> }) => void) => void;
    };
  }).launchQueue;
  if (!queue) return;
  queue.setConsumer(async (params) => {
    const handles = params.files || [];
    if (!handles.length) return;
    try {
      const file = await handles[0].getFile();
      if (file && file.size > 0) onFile(file);
    } catch {
      /* ignore */
    }
  });
}

export async function registerShareServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    reg.update().catch(() => {});
    if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
  } catch (err) {
    console.warn("[SHARE-CLIENT] SW registration notice:", err);
  }
}

export function getShareDiagnosticInfo(): ShareDiagnosticInfo {
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  const pending = readPending();

  return {
    webShareTargetSupported: typeof window !== "undefined" && "serviceWorker" in navigator,
    serviceWorkerRegistered: typeof window !== "undefined" && "serviceWorker" in navigator,
    serviceWorkerControllerActive:
      typeof window !== "undefined" && Boolean(navigator.serviceWorker?.controller),
    shareCacheAvailable: typeof window !== "undefined" && "caches" in window,
    isStandalonePWA: isStandalone,
    latestShareStatus: pending?.status === "miss" ? "FAILED" : pending ? "PROCESSING" : "NONE",
    lastShareId: pending?.id || null,
    lastFileName: null,
    lastFileSize: null,
    lastMimeType: "audio/ogg",
    lastSource: "SERVICE_WORKER",
    lastRetrievalStatus: pending?.status === "miss" ? "FAILED" : pending ? "PENDING" : null,
    lastDiagnosticCode: "SHARE_SW_CACHE_V1",
    lastErrorDetails: null,
    timestamp: pending?.at || null,
    traceLog: [
      {
        timestamp: Date.now(),
        step: "V1",
        details: "استقبال التسجيل عبر Service Worker وتخزينه في shared-media-v1 ثم ضخه في رد الشيخ.",
      },
    ],
  };
}
