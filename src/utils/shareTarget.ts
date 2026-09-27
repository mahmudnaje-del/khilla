/**
 * shareTarget.ts
 * مشاركة واتساب = تسجيل صوتي فقط. لا يُستخدم اسم المرسل ولا كابشن واتساب كسؤال.
 * khilla-pwa-v17
 */

const LEGACY_CACHE_NAMES = ["khilla-shared-media-v15", "khilla-shared-media-v16", "khilla-shared-media-v17"];

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

export function isWhatsAppVoiceCaption(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (!t) return false;
  if (t.length > 220) return false;
  if (/\bمن\s+\S+/.test(t) && t.length < 120 && !t.includes("؟") && !t.includes("?")) {
    if (/^(?:مقطع|رسالة|تسجيل|فيديو)/.test(t)) return true;
  }
  if (/^(?:مقطع\s+(?:صوتي|فيديو)|رسالة\s+صوتية|تسجيل\s+صوتي)\s+من\b/i.test(t)) return true;
  if (/^Voice\s+(?:message|note)\s+from\b/i.test(t)) return true;
  if (/^Audio(?:\s+message)?\s+from\b/i.test(t)) return true;
  if (/^Video\s+from\b/i.test(t)) return true;
  if (/^PTT[-_\s]/i.test(t) || /^AUD[-_\s]/i.test(t)) return true;
  if (/\.(?:opus|ogg|oga|amr|m4a|mp3|wav)$/i.test(t) && t.length < 80) return true;
  return false;
}

/** لا نستخدم نص واتساب كسؤال أبداً عند مشاركة تسجيل */
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
  const shared = p.get("shared");
  if (!shared && !p.get("id")) return { isShare: false, type: null };
  // أي مشاركة من واتساب تُعامل كمحاولة استلام تسجيل، وليس نص سؤال
  return { isShare: true, type: "opus" };
}

async function readFromCache(cacheName: string): Promise<SharedOpusResult | null> {
  const cache = await caches.open(cacheName);
  const [mediaRes, metaRes] = await Promise.all([
    cache.match("/__shared_opus_media__"),
    cache.match("/__shared_opus_meta__"),
  ]);
  if (!mediaRes) return null;
  const blob = await mediaRes.blob();
  if (!blob || blob.size <= 0) return null;
  let meta = { name: "whatsapp-voice.opus", mimeType: blob.type || "audio/ogg; codecs=opus", isVideo: false };
  if (metaRes) {
    try {
      const parsed = await metaRes.json();
      if (parsed.name) meta.name = parsed.name;
      if (parsed.mimeType) meta.mimeType = parsed.mimeType;
      if (parsed.isVideo !== undefined) meta.isVideo = Boolean(parsed.isVideo);
    } catch (_) {}
  }
  const file = new File([blob], meta.name || "whatsapp-voice.opus", {
    type: meta.mimeType || blob.type || "audio/ogg; codecs=opus",
  });
  cache.delete("/__shared_opus_media__").catch(() => {});
  cache.delete("/__shared_opus_meta__").catch(() => {});
  return {
    file,
    name: file.name,
    size: file.size,
    mimeType: file.type,
    isVideo: meta.isVideo,
    text: "",
  };
}

export async function getSharedOpusAudio(): Promise<SharedOpusResult | null> {
  if (typeof window !== "undefined" && "caches" in window) {
    for (const name of LEGACY_CACHE_NAMES) {
      try {
        const fromCache = await readFromCache(name);
        if (fromCache) return fromCache;
      } catch (cacheErr) {
        console.warn("Cache match error:", cacheErr);
      }
    }
  }
  const shareId =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("id") : null;
  const endpoints = ["/api/latest-opus"];
  if (shareId) endpoints.unshift(`/api/shared-file/${encodeURIComponent(shareId)}/raw`);
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size <= 0) continue;
      const mime = blob.type || "audio/ogg; codecs=opus";
      const file = new File([blob], "whatsapp-voice.opus", { type: mime });
      return { file, name: file.name, size: file.size, mimeType: file.type, isVideo: mime.startsWith("video/"), text: "" };
    } catch (_) {}
  }
  return null;
}

export async function getSharedText(): Promise<string | null> {
  // مشاركة التسجيل لا تُدخل أي نص في خانة السؤال
  return null;
}

export async function waitForSharedOpus(options?: {
  attempts?: number;
  delayMs?: number;
}): Promise<SharedOpusResult | null> {
  const attempts = options?.attempts ?? 24;
  const delayMs = options?.delayMs ?? 250;
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
    const type = event.data?.type;
    if (type === "OPUS_SHARE_READY" || type === "SHARE_READY") callback(event.data?.meta);
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
