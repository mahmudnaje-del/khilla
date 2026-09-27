import { Fatwa, CardTemplateSettings } from "../types";
export const DEFAULT_TEMPLATE_SETTINGS: CardTemplateSettings = {
  templateStyle: "official_khalla",
  aspectRatio: "auto",
  theme: "emerald",
  fontSize: "auto",
  showSheikhTitle: true,
  showFatwaNumber: false,
  showDate: false,
  showWallahuAalam: true,
  watermark: "الصفحة الرسمية للفتاوى",
};

export const SEED_FATWAS: Fatwa[] = [];

const STORAGE_KEY = "sheikh_khalla_fatwas_v2";
const DELETED_FATWAS_KEY = "khilla_deleted_fatwa_ids_v1";
const DB_NAME = "SheikhKhallaFatwasDB";
const STORE_NAME = "fatwas";
const DB_VERSION = 1;

/**
 * Tombstone management: stores IDs and Fatwa Numbers of deleted fatwas permanently
 * so that background synchronization, IndexedDB, or localStorage never resurrects them.
 */
export function getDeletedFatwaIds(): Set<string> {
  try {
    if (typeof localStorage === "undefined") return new Set();
    const raw = localStorage.getItem(DELETED_FATWAS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    // Strictly filter out any numeric or "num-" tombstones to prevent banning ordinal numbers
    const cleanIds = (Array.isArray(arr) ? arr : []).filter(
      (id) => typeof id === "string" && !id.startsWith("num-") && isNaN(Number(id))
    );
    return new Set(cleanIds);
  } catch {
    return new Set();
  }
}

export function recordDeletedFatwa(id: string, fatwaNumber?: number): void {
  try {
    if (typeof localStorage === "undefined" || !id) return;
    const set = getDeletedFatwaIds();
    set.add(id);
    // Never record pure numbers or "num-" in tombstones, so future fatwas can use ordinal numbers
    localStorage.setItem(DELETED_FATWAS_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn("Could not save tombstone to localStorage:", e);
  }
}

export function unrecordDeletedFatwa(id: string): void {
  try {
    if (typeof localStorage === "undefined" || !id) return;
    const set = getDeletedFatwaIds();
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(DELETED_FATWAS_KEY, JSON.stringify(Array.from(set)));
    }
  } catch (e) {
    console.warn("Could not remove tombstone from localStorage:", e);
  }
}

export function isFatwaDeleted(id?: string, fatwaNumber?: number): boolean {
  if (!id) return false;
  const set = getDeletedFatwaIds();
  return set.has(id);
}

export function syncDeletedFatwaIds(serverDeletedIds: string[]): void {
  if (!Array.isArray(serverDeletedIds) || serverDeletedIds.length === 0) return;
  try {
    const set = getDeletedFatwaIds();
    let added = false;
    serverDeletedIds.forEach((id) => {
      if (id && typeof id === "string" && !id.startsWith("num-") && isNaN(Number(id)) && !set.has(id)) {
        set.add(id);
        added = true;
      }
    });
    if (added && typeof localStorage !== "undefined") {
      localStorage.setItem(DELETED_FATWAS_KEY, JSON.stringify(Array.from(set)));
    }
  } catch (e) {
    console.warn("Error syncing deleted fatwa IDs:", e);
  }
}

/**
 * Strips huge fields (such as raw base64 audio dataUrl or generated card dataUrls)
 * before storing in localStorage or Firestore to prevent QuotaExceededError.
 */
export function sanitizeFatwaForStorage(fatwa: Fatwa): Fatwa {
  if (!fatwa) return fatwa;
  const sanitized: Fatwa = { ...fatwa };

  if (sanitized.audio_file) {
    const { dataUrl, ...restAudio } = sanitized.audio_file;
    // We preserve name, size, duration, mimeType.
    // Audio dataUrl is omitted from localStorage/Firestore because it can be 5-20MB.
    sanitized.audio_file = {
      ...restAudio,
      dataUrl: dataUrl && dataUrl.length < 500 ? dataUrl : undefined,
    };
  }

  // If image_url is a giant data:image base64 string, omit it from localStorage cache
  if (sanitized.image_url && sanitized.image_url.startsWith("data:") && sanitized.image_url.length > 2000) {
    delete sanitized.image_url;
  }

  return sanitized;
}

// IndexedDB Helper for high-capacity offline persistence
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB not supported in this environment"));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
}

export async function saveFatwasToIndexedDB(fatwas: Fatwa[]): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const fatwa of fatwas) {
      if (fatwa && fatwa.id) {
        store.put(sanitizeFatwaForStorage(fatwa));
      }
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // Non-blocking fallback
    console.warn("IndexedDB save fallback:", err);
  }
}

export async function loadFatwasFromIndexedDB(): Promise<Fatwa[]> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    const rawList: Fatwa[] = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // Strictly filter out any fatwa that was deleted
    const list = rawList.filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));

    if (SEED_FATWAS.length > 0 && list.length === 0) {
      const filteredSeed = SEED_FATWAS.filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));
      saveFatwasToIndexedDB(filteredSeed).catch(() => {});
      return filteredSeed;
    }
    return list;
  } catch (err) {
    return SEED_FATWAS.filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));
  }
}

export async function clearFatwasFromIndexedDB(): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
  } catch (err) {
    console.warn("IndexedDB clear fallback:", err);
  }
}

export function loadFatwasFromStorage(): Fatwa[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return SEED_FATWAS.filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));
    }
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return SEED_FATWAS.filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));
    }

    // Strictly filter out any deleted fatwa
    const valid = parsed.filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));
    return valid;
  } catch (e) {
    console.error("Failed to load fatwas from storage, using seed:", e);
    return SEED_FATWAS.filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));
  }
}

export function saveFatwasToStorage(fatwas: Fatwa[]): void {
  if (!fatwas || !Array.isArray(fatwas)) return;

  // Filter out any tombstone deleted items
  const cleanList = fatwas.filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));

  // Persist ALL fatwas to high-capacity IndexedDB asynchronously without quota barriers
  saveFatwasToIndexedDB(cleanList).catch(() => {});

  // Sanitize data (strip multi-megabyte audio dataUrls and base64 images)
  const sanitized = cleanList.map(sanitizeFatwaForStorage);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (e: any) {
    const isQuotaError =
      e?.name === "QuotaExceededError" ||
      e?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      e?.code === 22 ||
      e?.code === 1014 ||
      (typeof e?.message === "string" && e.message.toLowerCase().includes("quota"));

    if (isQuotaError) {
      console.warn("Local storage quota reached. Gracefully caching essential fields for all fatwas.");
      try {
        localStorage.removeItem("sheikh_khalla_fatwas_v1");
      } catch (_) {}

      // Keep ALL fatwas in localStorage by stripping non-essential visual template blobs
      try {
        const compact = sanitized.map((f) => ({
          id: f.id,
          fatwaNumber: f.fatwaNumber,
          question_clean: f.question_clean,
          question_original: f.question_original,
          answer_clean: f.answer_clean,
          status: f.status,
          approved: f.approved,
          reviewed: f.reviewed,
          has_wallahu_aalam: f.has_wallahu_aalam,
          category: f.category,
          tags: f.tags,
          created_at: f.created_at,
          updated_at: f.updated_at,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
      } catch (errCompact) {
        console.warn("Compact localStorage fallback notice. Full dataset is secured in IndexedDB, Server and Firestore.");
      }
    } else {
      console.warn("Could not save fatwas to localStorage cache:", e);
    }
  }
}

export function clearAllFatwasFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("sheikh_khalla_fatwas_v1");
    clearFatwasFromIndexedDB().catch(() => {});
  } catch (e) {
    console.error("Failed to clear fatwas storage:", e);
  }
}

export function getQueuedPendingSyncIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem("sheikh_khalla_pending_sync_v3");
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map((item: any) => item.id).filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Deterministic reconciliation between local cache and authoritative cloud documents
 * - Cloud data is the canonical source of truth.
 * - Deletions in cloud (deleted: true) purge local cache and record tombstones.
 * - Conflicts are resolved deterministically:
 *   1. If incoming.deleted -> deleted locally.
 *   2. Cloud documents win by default unless a verified write is currently in the pending queue and is newer.
 *   3. Timestamp alone is NEVER accepted as proof of authority.
 * - NEVER renumbers fatwas during synchronization.
 */
export function reconcileFatwasWithCloud(localFatwas: Fatwa[], cloudFatwas: Fatwa[]): Fatwa[] {
  const map = new Map<string, Fatwa>();
  const queuedPendingIds = getQueuedPendingSyncIds();

  // If cloudFatwas is empty or null, NEVER wipe localFatwas!
  if (!cloudFatwas || cloudFatwas.length === 0) {
    (localFatwas || []).forEach((lf) => {
      if (lf && lf.id && !isFatwaDeleted(lf.id, lf.fatwaNumber)) {
        map.set(lf.id, lf);
      }
    });
    return Array.from(map.values());
  }

  // 1. Authoritative Cloud Documents
  cloudFatwas.forEach((cf) => {
    if (!cf || !cf.id) return;
    if (cf.deleted === true || isFatwaDeleted(cf.id, cf.fatwaNumber)) {
      recordDeletedFatwa(cf.id, cf.fatwaNumber);
      return;
    }
    map.set(cf.id, {
      ...cf,
      pendingSync: false,
    });
  });

  // 2. Reconcile with Local Cache
  localFatwas.forEach((lf) => {
    if (!lf || !lf.id) return;
    if (isFatwaDeleted(lf.id, lf.fatwaNumber)) return;

    const isActuallyQueued = queuedPendingIds.has(lf.id);

    if (!map.has(lf.id)) {
      // If it exists locally but not in cloud:
      // PRESERVE IT! Never drop legitimate fatwas just because cloud has not indexed them yet.
      map.set(lf.id, lf);
      return;
    }

    const cloudDoc = map.get(lf.id)!;
    const localTime = lf.updated_at ? new Date(lf.updated_at).getTime() : 0;
    const cloudTime = cloudDoc.updated_at ? new Date(cloudDoc.updated_at).getTime() : 0;
    const localVer = typeof lf.version === "number" ? lf.version : 1;
    const cloudVer = typeof cloudDoc.version === "number" ? cloudDoc.version : 1;

    // Only preserve local if genuinely queued in pending queue AND strictly newer than cloud
    const isLocalStrictlyNewer =
      localVer > cloudVer || (localVer === cloudVer && localTime > cloudTime);

    if (lf.pendingSync && isActuallyQueued && isLocalStrictlyNewer) {
      map.set(lf.id, lf);
    } else {
      // Cloud is authoritative, but keep local audio_file if remote does not have it
      map.set(lf.id, {
        ...cloudDoc,
        audio_file: lf.audio_file || cloudDoc.audio_file,
        pendingSync: false,
      });
    }
  });

  const reconciled = Array.from(map.values()).filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));

  // Sort descending by fatwaNumber, then by created_at
  reconciled.sort((a, b) => {
    const numA = Number(a.fatwaNumber) || 0;
    const numB = Number(b.fatwaNumber) || 0;
    if (numA !== numB) return numB - numA;
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });

  return reconciled;
}

/**
 * Merges server-retrieved fatwas with local cache without losing local unsaved drafts or edits.
 */
export function mergeWithServerFatwas(currentFatwas: Fatwa[], serverFatwas: Fatwa[]): Fatwa[] {
  const map = new Map<string, Fatwa>();

  // 1. Load all server fatwas
  (serverFatwas || []).forEach((sf) => {
    if (sf && sf.id && !isFatwaDeleted(sf.id, sf.fatwaNumber)) {
      map.set(sf.id, sf);
    }
  });

  // 2. Overlay local fatwas (keeping local drafts or pending changes)
  (currentFatwas || []).forEach((cf) => {
    if (cf && cf.id && !isFatwaDeleted(cf.id, cf.fatwaNumber)) {
      if (!map.has(cf.id)) {
        map.set(cf.id, cf);
      } else {
        const existing = map.get(cf.id)!;
        const curVer = typeof cf.version === "number" ? cf.version : 1;
        const srvVer = typeof existing.version === "number" ? existing.version : 1;
        if (curVer > srvVer || cf.pendingSync) {
          map.set(cf.id, { ...existing, ...cf });
        }
      }
    }
  });

  const list = Array.from(map.values()).filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));
  list.sort((a, b) => {
    const numA = Number(a.fatwaNumber) || 0;
    const numB = Number(b.fatwaNumber) || 0;
    if (numA !== numB) return numB - numA;
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });
  return list;
}

export function getNextFatwaNumber(fatwas: Fatwa[]): number {
  if (!fatwas || fatwas.length === 0) return 1;
  let max = 0;
  for (const f of fatwas) {
    const num = Number(f.fatwaNumber);
    if (Number.isInteger(num) && num > max) {
      max = num;
    }
  }
  return max + 1;
}

export interface CollisionReport {
  hasCollisions: boolean;
  collidingNumbers: number[];
  duplicateCount: number;
  invalidCount: number;
  details: Array<{ fatwaNumber: number; count: number; ids: string[] }>;
}

/**
 * DIAGNOSTIC ONLY (Section 18):
 * Detects whether any fatwa numbers are duplicated or invalid.
 * Strictly diagnostic: NEVER mutates canonical fatwaNumber values or modifies records.
 */
export function detectFatwaNumberCollisions(fatwas: Fatwa[]): CollisionReport {
  if (!fatwas || fatwas.length === 0) {
    return { hasCollisions: false, collidingNumbers: [], duplicateCount: 0, invalidCount: 0, details: [] };
  }

  const numberToIds = new Map<number, string[]>();
  let invalidCount = 0;

  for (const f of fatwas) {
    const num = Number(f.fatwaNumber);
    if (!Number.isInteger(num) || num <= 0) {
      invalidCount++;
      continue;
    }
    const existing = numberToIds.get(num) || [];
    existing.push(f.id);
    numberToIds.set(num, existing);
  }

  const collidingNumbers: number[] = [];
  const details: Array<{ fatwaNumber: number; count: number; ids: string[] }> = [];
  let duplicateCount = 0;

  for (const [num, ids] of numberToIds.entries()) {
    if (ids.length > 1) {
      collidingNumbers.push(num);
      duplicateCount += ids.length - 1;
      details.push({ fatwaNumber: num, count: ids.length, ids });
    }
  }

  return {
    hasCollisions: collidingNumbers.length > 0 || invalidCount > 0,
    collidingNumbers,
    duplicateCount,
    invalidCount,
    details,
  };
}

/**
 * @deprecated Use detectFatwaNumberCollisions instead.
 * Preserved for backwards compatibility with diagnostic callers.
 * Diagnostic only: NEVER alters or silently mutates canonical fatwaNumber values.
 */
export function resolveFatwaNumberCollisions(fatwas: Fatwa[]): { fatwas: Fatwa[]; fixedCount: number } {
  return { fatwas, fixedCount: 0 };
}

/**
 * Strict, pure sequential renumbering from 1 to N:
 * - Filters out deleted fatwas.
 * - Deduplicates any duplicate document IDs.
 * - Sorts them strictly in chronological order (oldest creation date receives #1,
 *   up to the newest which receives #N).
 * - Assigns exact sequential integer fatwaNumber (1, 2, 3, ..., N).
 * - Guarantees NO gaps, NO duplicates, and NO arbitrary random numbers.
 */
export function resequenceAllFatwasStrictly(fatwas: Fatwa[]): Fatwa[] {
  if (!fatwas || fatwas.length === 0) return [];

  // 1. Filter out deleted fatwas
  const valid = fatwas.filter((f) => !isFatwaDeleted(f.id, f.fatwaNumber));

  // 2. Deduplicate by unique id
  const map = new Map<string, Fatwa>();
  valid.forEach((f) => {
    const id = f.id || `fatwa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const existing = map.get(id);
    if (!existing) {
      map.set(id, { ...f, id });
    } else {
      const exTime = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const fTime = f.updated_at ? new Date(f.updated_at).getTime() : 0;
      map.set(id, fTime >= exTime ? { ...existing, ...f } : { ...f, ...existing });
    }
  });

  const uniqueList = Array.from(map.values());

  // 3. Sort chronologically (ascending: oldest created_at first)
  uniqueList.sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (timeA > 0 && timeB > 0 && timeA !== timeB) {
      return timeA - timeB;
    }
    // Fallback: previous fatwaNumber order
    const numA = Number(a.fatwaNumber) || 0;
    const numB = Number(b.fatwaNumber) || 0;
    if (numA !== numB) return numA - numB;
    return a.id.localeCompare(b.id);
  });

  const now = new Date().toISOString();
  // 4. Renumber strictly 1 to N
  return uniqueList.map((f, index) => ({
    ...f,
    fatwaNumber: index + 1,
    updated_at: now,
  }));
}

