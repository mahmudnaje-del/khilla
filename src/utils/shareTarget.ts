/**
 * shareTarget.ts — khilla-pwa-v19
 * استلام تسجيل واتساب بعد تسليمه من الخادم (IndexedDB + Cache + رابط الملف).
 */

const PENDING_KEY = "khilla-pending-share";
const PENDING_MAX_AGE_MS = 3 * 60 * 1000;
const DB_NAMES = ["khilla-share-v19", "khilla-share-v18"];
const CACHE_NAMES = [
  "khilla-shared-media-v19",
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
  id: string | null;
}

interface PendingShare {
  shared: string | null;
  id: string | null;
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
  if (!shared && !id) return;
  const prev = readPending();
  try {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        shared: shared || prev?.shared || null,
        id: id || prev?.id || null,
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
        shared: prev?.shared || "opus",
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
  if (p.has("shared") || p.has("id")) return true;
  const pending = readPending();
  return Boolean(pending && pending.status !== "miss");
}

export function getShareTargetInfo(): ShareInfo {
  if (typeof window === "undefined") return { isShare: false, type: null, id: null };
  const p = new URLSearchParams(window.location.search);
  const pending = readPending();
  const shared = p.get("shared") || pending?.shared || "";
  const id = p.get("id") || pending?.id || null;
  if (!shared && !id) return { isShare: false, type: null, id: null };
  if (shared === "text") return { isShare: true, type: "text", id };
  if (shared === "empty" || shared === "nofile" || shared === "error") {
    return { isShare: true, type: "empty", id };
  }
  return { isShare: true, type: "opus", id };
}

export function chromeDropsShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;
  const match = ua.match(/Chrome\/(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  return major >= 153 && major < 154;
}

export function isWhatsAppVoiceCaption(text: string | null | undefined): boolean {
  if (!text) return false;
  return /مقطع صوتي|رسالة صوتية|voice message|whatsapp/i.test(text);
}

export function usableSharedQuestionText(text: string | null | undefined): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed || isWhatsAppVoiceCaption(trimmed)) return "";
  return trimmed;
}

function toResult(blob: Blob, name: string, mime: string, isVideo: boolean, text?: string): SharedOpusResult {
  const file = new File([blob], name || "whatsapp-voice.opus", {
    type: mime || blob.type || "audio/ogg",
  });
  return {
    file,
    name: file.name,
    size: file.size,
    mimeType: (file.type || mime || "audio/ogg").split(";")[0],
    isVideo,
    text: text || "",
  };
}

async function shareCacheNames(): Promise<string[]> {
  const names = [...CACHE_NAMES];
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      if (key.startsWith("khilla-shared-media-") && !names.includes(key)) names.push(key);
    }
  } catch {
    /* ignore */
  }
  return names;
}

async function readFromCache(cacheName: string): Promise<SharedOpusResult | null> {
  const cache = await caches.open(cacheName);
  const mediaRes = await cache.match("/__shared_opus_media__");
  if (!mediaRes) return null;
  const blob = await mediaRes.blob();
  if (!blob || blob.size <= 0) return null;
  let name = "whatsapp-voice.opus";
  let mime = blob.type || "audio/ogg";
  let isVideo = mime.startsWith("video/");
  let text = "";
  const metaRes = await cache.match("/__shared_opus_meta__");
  if (metaRes) {
    try {
      const parsed = await metaRes.json();
      if (parsed.name) name = parsed.name;
      if (parsed.mimeType) mime = parsed.mimeType;
      if (parsed.isVideo !== undefined) isVideo = Boolean(parsed.isVideo);
      if (typeof parsed.text === "string") text = parsed.text;
    } catch {
      /* ignore */
    }
  }
  return toResult(blob, name, mime, isVideo, text);
}

function readFromIndexedDb(dbName: string): Promise<SharedOpusResult | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName, 1);
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
            const age = Date.now() - (meta.receivedAt || meta.timestamp || 0);
            if (meta.receivedAt && age > PENDING_MAX_AGE_MS) return resolve(null);
            resolve(
              toResult(
                blob,
                meta.name || "whatsapp-voice.opus",
                meta.mimeType || blob.type,
                Boolean(meta.isVideo),
                typeof meta.text === "string" ? meta.text : ""
              )
            );
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

async function readSharedTextFromStores(): Promise<string | null> {
  if (typeof window !== "undefined" && "caches" in window) {
    for (const name of await shareCacheNames()) {
      try {
        const cache = await caches.open(name);
        const metaRes = await cache.match("/__shared_opus_meta__");
        if (!metaRes) continue;
        const parsed = await metaRes.json();
        if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export async function getSharedOpusAudio(): Promise<SharedOpusResult | null> {
  if (typeof window !== "undefined" && "caches" in window) {
    for (const name of await shareCacheNames()) {
      try {
        const fromCache = await readFromCache(name);
        if (fromCache) return fromCache;
      } catch {
        /* ignore */
      }
    }
  }
  for (const dbName of DB_NAMES) {
    try {
      const fromIdb = await readFromIndexedDb(dbName);
      if (fromIdb) return fromIdb;
    } catch {
      /* ignore */
    }
  }

  const info = getShareTargetInfo();
  const endpoints: string[] = [];
  if (info.id) endpoints.push("/api/shared-file/" + encodeURIComponent(info.id) + "/raw");
  endpoints.push("/api/latest-opus");
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size <= 0) continue;
      const mime = blob.type || "audio/ogg";
      const disposition = res.headers.get("Content-Disposition") || "";
      const nameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const name = nameMatch ? decodeURIComponent(nameMatch[1]) : "whatsapp-voice.opus";
      return toResult(blob, name, mime, mime.startsWith("video/"), "");
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function getSharedText(): Promise<string | null> {
  const fromStore = await readSharedTextFromStores();
  return usableSharedQuestionText(fromStore) || fromStore;
}

export async function waitForSharedOpus(options?: {
  attempts?: number;
  delayMs?: number;
}): Promise<SharedOpusResult | null> {
  const attempts = options?.attempts ?? 12;
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
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      /* النسخة الجديدة تسيطر دون إعادة تحميل قسرية حتى لا نضيع المشاركة الجارية */
    });
  } catch {
    /* ignore */
  }
}

export function getShareDiagnosticInfo(): ShareDiagnosticInfo {
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  const pending = readPending();
  const chromeBug = chromeDropsShareFiles();

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
    lastSource: "SERVER_BRIDGE",
    lastRetrievalStatus: pending?.status === "miss" ? "FAILED" : pending ? "PENDING" : null,
    lastDiagnosticCode: chromeBug ? "CHROME_153_DROPS_SHARE_FILES" : "SHARE_HANDOFF_V19",
    lastErrorDetails: chromeBug
      ? "كروم 153 على أندرويد يسقط ملفات Web Share Target. التحديث إلى 154 يعيد إرفاق التسجيل."
      : null,
    timestamp: pending?.at || null,
    traceLog: [
      {
        timestamp: Date.now(),
        step: "V19",
        details: chromeBug
          ? "خلل كروم 153: ملف المشاركة لا يُرفق. اختر التسجيل يدوياً أو حدّث كروم."
          : "تسليم التسجيل يتم عبر الخادم ثم IndexedDB ومعرّف المشاركة.",
      },
    ],
  };
}
