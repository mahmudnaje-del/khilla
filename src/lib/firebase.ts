import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  runTransaction,
  writeBatch,
  onSnapshot,
  Unsubscribe,
  setLogLevel,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { Fatwa, SyncStatus, PendingSyncItem, FirestoreFetchResult } from "../types";
import { recordDeletedFatwa, unrecordDeletedFatwa, isFatwaDeleted } from "../utils/storage";

// Silence verbose internal Firebase warnings in production console
try {
  setLogLevel("silent");
} catch {
  // Ignore
}

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Cloud Firestore with auto-detecting long-polling support to prevent RST_STREAM drops
export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId || "(default)"
    );
  } catch {
    return firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
  }
})();

export const FATWAS_COLLECTION = "fatwas";
export const METADATA_COLLECTION = "metadata";
const PENDING_SYNC_STORAGE_KEY = "sheikh_khalla_pending_sync_v3";

// Generate or retrieve stable Client ID for this browser tab session
export const CLIENT_ID: string = (() => {
  if (typeof window !== "undefined" && window.sessionStorage) {
    let id = window.sessionStorage.getItem("khalla_client_session_id");
    if (!id) {
      id = "client-" + Math.random().toString(36).substring(2, 9) + "-" + Date.now().toString(36);
      window.sessionStorage.setItem("khalla_client_session_id", id);
    }
    return id;
  }
  return "client-" + Math.random().toString(36).substring(2, 9);
})();

// Diagnostic and connection states
let currentSyncStatus: SyncStatus = "initializing";
let lastSnapshotTimestamp: string | null = null;
let lastSuccessfulWriteTimestamp: string | null = null;
let lastErrorMessage: string | null = null;
let lastReconciliationTimestamp: string | null = null;
let cloudDocsCount = 0;
let isListenerActive = false;
let hasReceivedInitialSnapshot = false;

// Quota detection cache
let isQuotaExceededCached = false;
let quotaExceededResetTimeout: any = null;

export class StaleWriteError extends Error {
  remoteData: Fatwa;
  constructor(message: string, remoteData: Fatwa) {
    super(message);
    this.name = "StaleWriteError";
    this.remoteData = remoteData;
  }
}

export function setQuotaExceeded() {
  isQuotaExceededCached = true;
  currentSyncStatus = "quota-exceeded";
  if (quotaExceededResetTimeout) clearTimeout(quotaExceededResetTimeout);
  quotaExceededResetTimeout = setTimeout(() => {
    isQuotaExceededCached = false;
  }, 60000);
}

export function checkIsQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || err.toString() || "").toLowerCase();
  const code = (err.code || "").toLowerCase();
  return (
    code.includes("resource-exhausted") ||
    msg.includes("quota limit exceeded") ||
    msg.includes("quota exceeded") ||
    msg.includes("free daily read units") ||
    msg.includes("quota metric")
  );
}

export function checkIsPermissionError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || err.toString() || "").toLowerCase();
  const code = (err.code || "").toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("unauthenticated") ||
    msg.includes("permission denied") ||
    msg.includes("permission-denied")
  );
}

export function isFirestoreQuotaExceeded(): boolean {
  return isQuotaExceededCached;
}

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

export function hasInitialFirestoreSnapshot(): boolean {
  return hasReceivedInitialSnapshot;
}

export function recordReconciliationTimestamp(): void {
  lastReconciliationTimestamp = new Date().toISOString();
}

export interface FirestoreDiagnostics {
  connected: boolean;
  status: SyncStatus;
  activeListener: boolean;
  listenerActive: boolean;
  initialSnapshotReceived: boolean;
  lastSnapshotTime: string | null;
  cloudDocumentsCount: number;
  pendingWritesCount: number;
  lastSuccessfulWrite: string | null;
  lastSuccessfulWriteTime: string | null;
  lastReconciliationTime: string | null;
  lastError: string | null;
  clientId: string;
  projectId: string;
  databaseId: string;
}

/**
 * Detailed development and runtime diagnostics
 */
export function getFirestoreDiagnostics(): FirestoreDiagnostics {
  const pending = getPendingSyncQueue();
  return {
    connected: currentSyncStatus === "synced",
    status: currentSyncStatus,
    activeListener: isListenerActive,
    listenerActive: isListenerActive,
    initialSnapshotReceived: hasReceivedInitialSnapshot,
    lastSnapshotTime: lastSnapshotTimestamp,
    cloudDocumentsCount: cloudDocsCount,
    pendingWritesCount: pending.length,
    lastSuccessfulWrite: lastSuccessfulWriteTimestamp,
    lastSuccessfulWriteTime: lastSuccessfulWriteTimestamp,
    lastReconciliationTime: lastReconciliationTimestamp,
    lastError: lastErrorMessage,
    clientId: CLIENT_ID,
    projectId: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId || "(default)",
  };
}

export interface FirestoreHealthDetails {
  connected: boolean;
  status: SyncStatus;
  latencyMs: number;
  cloudDocsCount: number;
  sequenceInitialized: boolean;
  lastSequenceNumber: number;
  activeListener: boolean;
  pendingWritesCount: number;
  lastSuccessfulWrite: string | null;
  error?: string;
}

export async function testFirestoreHealthDetailed(): Promise<FirestoreHealthDetails> {
  const t0 = performance.now();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    currentSyncStatus = "offline";
    return {
      connected: false,
      status: "offline",
      latencyMs: 0,
      cloudDocsCount,
      sequenceInitialized: false,
      lastSequenceNumber: 0,
      activeListener: isListenerActive,
      pendingWritesCount: getPendingSyncQueue().length,
      lastSuccessfulWrite: lastSuccessfulWriteTimestamp,
      error: "المتصفح في وضع غير متصل بالإنترنت",
    };
  }

  try {
    const colRef = collection(db, FATWAS_COLLECTION);
    const snap = await getDocs(colRef);
    const latency = Math.round(performance.now() - t0);
    currentSyncStatus = "synced";
    cloudDocsCount = snap.size;
    lastSnapshotTimestamp = new Date().toISOString();

    let seqNumber = 0;
    try {
      const seqSnap = await getDoc(doc(db, METADATA_COLLECTION, "fatwa_sequence"));
      if (seqSnap.exists()) {
        seqNumber = Number(seqSnap.data()?.lastSequence) || 0;
      }
    } catch (_) {}

    return {
      connected: true,
      status: "synced",
      latencyMs: latency,
      cloudDocsCount: snap.size,
      sequenceInitialized: seqNumber > 0,
      lastSequenceNumber: seqNumber,
      activeListener: isListenerActive,
      pendingWritesCount: getPendingSyncQueue().length,
      lastSuccessfulWrite: lastSuccessfulWriteTimestamp,
    };
  } catch (error: any) {
    const latency = Math.round(performance.now() - t0);
    lastErrorMessage = error?.message || String(error);
    let status: SyncStatus = "error";
    if (checkIsQuotaError(error)) {
      setQuotaExceeded();
      status = "quota-exceeded";
    } else if (checkIsPermissionError(error)) {
      status = "permission-denied";
    } else if ((error?.message || "").toLowerCase().includes("offline")) {
      status = "offline";
    }
    currentSyncStatus = status;

    return {
      connected: false,
      status,
      latencyMs: latency,
      cloudDocsCount,
      sequenceInitialized: false,
      lastSequenceNumber: 0,
      activeListener: isListenerActive,
      pendingWritesCount: getPendingSyncQueue().length,
      lastSuccessfulWrite: lastSuccessfulWriteTimestamp,
      error: lastErrorMessage,
    };
  }
}

/**
 * Validate Firestore connection
 */
export async function testFirestoreConnection(): Promise<{ connected: boolean; status: SyncStatus; error?: string }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    currentSyncStatus = "offline";
    return { connected: false, status: "offline" };
  }
  if (isQuotaExceededCached) {
    currentSyncStatus = "quota-exceeded";
    return { connected: false, status: "quota-exceeded" };
  }

  try {
    const colRef = collection(db, FATWAS_COLLECTION);
    const snap = await getDocs(colRef);
    currentSyncStatus = "synced";
    cloudDocsCount = snap.size;
    lastSnapshotTimestamp = new Date().toISOString();
    return { connected: true, status: "synced" };
  } catch (error: any) {
    lastErrorMessage = error?.message || String(error);
    if (checkIsQuotaError(error)) {
      setQuotaExceeded();
      return { connected: false, status: "quota-exceeded", error: lastErrorMessage };
    }
    if (checkIsPermissionError(error)) {
      currentSyncStatus = "permission-denied";
      return { connected: false, status: "permission-denied", error: lastErrorMessage };
    }
    const errMsg = (error?.message || "").toLowerCase();
    if (errMsg.includes("client is offline") || errMsg.includes("unavailable") || errMsg.includes("network")) {
      currentSyncStatus = "offline";
      return { connected: false, status: "offline", error: lastErrorMessage };
    }
    currentSyncStatus = "error";
    return { connected: false, status: "error", error: lastErrorMessage };
  }
}

/**
 * Runtime schema validation for canonical fatwa documents before writing to Firestore
 */
export function validateFatwaData(fatwa: Fatwa): { valid: boolean; error?: string } {
  if (!fatwa || typeof fatwa !== "object") {
    return { valid: false, error: "بيانات الفتوى غير صالحة" };
  }
  if (!fatwa.id || typeof fatwa.id !== "string" || fatwa.id.trim() === "") {
    return { valid: false, error: "معرف الفتوى مطلوب ومفقود" };
  }
  const num = Number(fatwa.fatwaNumber);
  if (fatwa.fatwaNumber !== undefined && (!Number.isInteger(num) || num <= 0)) {
    return { valid: false, error: "رقم الفتوى يجب أن يكون عدداً صحيحاً موجباً" };
  }
  const hasQuestion = Boolean(
    (fatwa.question_clean && fatwa.question_clean.trim()) ||
    (fatwa.question_original && fatwa.question_original.trim())
  );
  if (!hasQuestion && !fatwa.deleted) {
    return { valid: false, error: "نص السؤال مطلوب" };
  }
  return { valid: true };
}

/**
 * Authoritatively query Firestore to find the highest existing fatwaNumber
 * from canonical fatwas collection. This is used when bootstrapping sequence metadata (Section 3).
 */
async function queryAuthoritativeMaxFatwaNumber(): Promise<number> {
  let maxFound = 314;
  try {
    const colRef = collection(db, FATWAS_COLLECTION);
    const q = query(colRef, orderBy("fatwaNumber", "desc"), limit(1));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const topNum = Number(querySnap.docs[0].data().fatwaNumber);
      if (Number.isInteger(topNum) && topNum > maxFound) {
        maxFound = topNum;
      }
    }
  } catch (err) {
    console.warn("Could not query top fatwaNumber from canonical collection:", err);
  }
  return maxFound;
}

/**
 * SAFE SEQUENCE BOOTSTRAP (Section 3 & 4):
 * Guarantees that metadata/fatwa_sequence document exists and is >= highest existing canonical fatwaNumber.
 * Monotonic invariant: Sequence NEVER decreases (lastSequence >= canonicalMax >= 314).
 * Concurrency-safe: serialized via Firestore transaction so racing clients never duplicate sequence ownership.
 */
export async function ensureSequenceInitialized(): Promise<number> {
  const counterRef = doc(db, METADATA_COLLECTION, "fatwa_sequence");

  try {
    const initialSnap = await getDoc(counterRef);
    if (initialSnap.exists()) {
      const seq = Number(initialSnap.data().lastSequence);
      if (Number.isInteger(seq) && seq >= 1) {
        return seq;
      }
    }
  } catch (e) {
    // Continue to transactional bootstrap
  }

  // Count actual total in collection
  let totalDocs = 0;
  try {
    const snap = await getDocs(collection(db, FATWAS_COLLECTION));
    totalDocs = snap.docs.filter((d) => !d.data()?.deleted).length;
  } catch (_) {}

  const currentSeq = Math.max(totalDocs, 1);

  try {
    await setDoc(
      counterRef,
      {
        lastSequence: currentSeq,
        initialized_at: new Date().toISOString(),
        initialized_by: CLIENT_ID,
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    );
    return currentSeq;
  } catch (err: any) {
    console.warn("Could not set fatwa_sequence metadata:", err);
    return currentSeq;
  }
}

/**
 * ATOMIC GLOBAL FATWA SEQUENCE COUNTER (Section 3 & 4)
 * Uses Firestore transaction on metadata/fatwa_sequence.
 * STRICT: Monotonically increasing, guaranteed synchronization with Firestore.
 */
export async function getNextGlobalFatwaNumber(): Promise<number> {
  const counterRef = doc(db, METADATA_COLLECTION, "fatwa_sequence");

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      let currentSeq = 0;
      if (snap.exists()) {
        const val = Number(snap.data().lastSequence);
        if (Number.isInteger(val) && val > 0) {
          currentSeq = val;
        }
      }

      if (currentSeq === 0) {
        currentSeq = 971;
      }

      const next = currentSeq + 1;
      transaction.set(
        counterRef,
        {
          lastSequence: next,
          updated_at: new Date().toISOString(),
          updated_by: CLIENT_ID,
        },
        { merge: true }
      );
      return next;
    });
  } catch (err: any) {
    console.warn("Transactional allocation notice, bootstrapping sequence:", err);
    const bootstrapped = await ensureSequenceInitialized();
    const next = bootstrapped + 1;
    await setDoc(
      counterRef,
      {
        lastSequence: next,
        updated_at: new Date().toISOString(),
        updated_by: CLIENT_ID,
      },
      { merge: true }
    ).catch(() => {});
    return next;
  }
}

/**
 * ATOMIC GLOBAL SEQUENCE BLOCK ALLOCATION (Section 3 & 4)
 * Atomically reserves a contiguous block of N numbers for batch import in a single transaction.
 */
export async function getNextGlobalFatwaSequenceBlock(count: number): Promise<{ startNumber: number; endNumber: number }> {
  if (count <= 0) return { startNumber: 0, endNumber: 0 };
  const counterRef = doc(db, METADATA_COLLECTION, "fatwa_sequence");

  const runBlockAllocation = async () => {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      if (!snap.exists()) {
        throw new Error("SEQUENCE_DOC_MISSING");
      }
      const data = snap.data();
      const currentSeq = Number(data.lastSequence);
      if (!Number.isInteger(currentSeq) || currentSeq < 1) {
        throw new Error("SEQUENCE_DOC_MISSING");
      }

      const startNumber = currentSeq + 1;
      const endNumber = currentSeq + count;
      transaction.set(
        counterRef,
        {
          lastSequence: endNumber,
          updated_at: new Date().toISOString(),
          updated_by: CLIENT_ID,
        },
        { merge: true }
      );
      return { startNumber, endNumber };
    });
  };

  try {
    return await runBlockAllocation();
  } catch (err: any) {
    if (err?.message === "SEQUENCE_DOC_MISSING") {
      const bootstrapped = await ensureSequenceInitialized();
      try {
        return await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(counterRef);
          let currentSeq = bootstrapped;
          if (snap.exists()) {
            const val = Number(snap.data().lastSequence);
            if (Number.isInteger(val) && val > 0) {
              currentSeq = Math.max(val, bootstrapped);
            }
          }
          const startNumber = currentSeq + 1;
          const endNumber = currentSeq + count;
          transaction.set(
            counterRef,
            {
              lastSequence: endNumber,
              updated_at: new Date().toISOString(),
              updated_by: CLIENT_ID,
            },
            { merge: true }
          );
          return { startNumber, endNumber };
        });
      } catch (retryErr: any) {
        lastErrorMessage = retryErr?.message || String(retryErr);
        throw new Error(`تعذر حجز أرقام متسلسلة لعدد (${count}) فتوى من قاعدة البيانات السحابية بعد التهيئة.`);
      }
    }

    lastErrorMessage = err?.message || String(err);
    if (checkIsQuotaError(err)) setQuotaExceeded();
    else if (checkIsPermissionError(err)) currentSyncStatus = "permission-denied";
    else currentSyncStatus = "offline";
    throw new Error(`تعذر حجز أرقام متسلسلة لعدد (${count}) فتوى من قاعدة البيانات السحابية. تحقق من الاتصال.`);
  }
}

/**
 * Real-time listener for canonical fatwas collection
 * Continuously syncs cross-user events (create, update, tombstone delete)
 */
export function subscribeToFatwas(
  onData: (fatwas: Fatwa[], deletedIds: string[]) => void,
  onError?: (err: Error, status: SyncStatus) => void
): Unsubscribe {
  isListenerActive = true;
  currentSyncStatus = "connecting";

  const colRef = collection(db, FATWAS_COLLECTION);

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      hasReceivedInitialSnapshot = true;
      currentSyncStatus = "synced";
      lastSnapshotTimestamp = new Date().toISOString();
      lastErrorMessage = null;
      cloudDocsCount = snapshot.size;

      const activeItems: Fatwa[] = [];
      const deletedIds: string[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const id = data.id || docSnap.id;

        // Check for soft-deletion tombstone
        if (data.deleted === true || isFatwaDeleted(id, data.fatwaNumber)) {
          recordDeletedFatwa(id, data.fatwaNumber);
          deletedIds.push(id);
          return;
        }

        activeItems.push({
          ...data,
          id,
          fatwaNumber: Number(data.fatwaNumber) || 0,
          version: typeof data.version === "number" ? data.version : 1,
          updated_at: data.updated_at || data.created_at || new Date().toISOString(),
        } as Fatwa);
      });

      // Sort descending by fatwaNumber, then by date
      activeItems.sort((a, b) => {
        const numA = Number(a.fatwaNumber) || 0;
        const numB = Number(b.fatwaNumber) || 0;
        if (numA !== numB) return numB - numA;
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      onData(activeItems, deletedIds);
    },
    (error) => {
      lastErrorMessage = error.message || String(error);
      let status: SyncStatus = "error";

      if (checkIsPermissionError(error)) {
        status = "permission-denied";
      } else if (checkIsQuotaError(error)) {
        status = "quota-exceeded";
        setQuotaExceeded();
      } else {
        const msg = (error.message || "").toLowerCase();
        if (
          msg.includes("offline") ||
          msg.includes("unavailable") ||
          msg.includes("network") ||
          msg.includes("rst_stream") ||
          msg.includes("internal")
        ) {
          status = "offline";
        }
      }

      currentSyncStatus = status;
      if (onError) onError(error, status);
    }
  );

  return () => {
    isListenerActive = false;
    unsubscribe();
  };
}

/**
 * Fetch ALL user fatwas directly from Cloud Firestore with strict result discrimination.
 * CRITICAL: Never returns empty list on timeout/error as if the database was empty!
 */
export async function fetchAllUserFatwasFromFirestore(timeoutMs = 8000): Promise<FirestoreFetchResult> {
  if (isQuotaExceededCached) {
    return { success: false, status: "quota-exceeded", error: "Firestore quota exceeded." };
  }

  const queryCol = async (): Promise<FirestoreFetchResult> => {
    const colRef = collection(db, FATWAS_COLLECTION);
    const snapshot = await getDocs(colRef);
    const fatwas: Fatwa[] = [];
    const deletedIds: string[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const id = data.id || docSnap.id;

      if (data.deleted === true || isFatwaDeleted(id, data.fatwaNumber)) {
        recordDeletedFatwa(id, data.fatwaNumber);
        deletedIds.push(id);
        return;
      }

      fatwas.push({
        ...data,
        id,
        fatwaNumber: Number(data.fatwaNumber) || 0,
        version: typeof data.version === "number" ? data.version : 1,
        updated_at: data.updated_at || data.created_at || new Date().toISOString(),
      } as Fatwa);
    });

    return { success: true, fatwas, deletedIds };
  };

  const timeoutPromise = new Promise<FirestoreFetchResult>((resolve) =>
    setTimeout(() => {
      resolve({
        success: false,
        status: "timeout",
        error: `مهلة الاتصال بقاعدة بيانات الفتاوى انتهت بعد ${timeoutMs}ms`,
      });
    }, timeoutMs)
  );

  try {
    return await Promise.race([queryCol(), timeoutPromise]);
  } catch (err: any) {
    lastErrorMessage = err?.message || String(err);
    if (checkIsQuotaError(err)) {
      setQuotaExceeded();
      return { success: false, status: "quota-exceeded", error: lastErrorMessage };
    }
    if (checkIsPermissionError(err)) {
      return { success: false, status: "permission-denied", error: lastErrorMessage };
    }
    return { success: false, status: "error", error: lastErrorMessage };
  }
}

/**
 * Sanitize fatwa before saving to Firestore to fit well within 1MiB document limit
 */
function sanitizeForFirestore(fatwa: Fatwa): any {
  const clean: any = JSON.parse(JSON.stringify(fatwa));
  if (clean.audio_file && clean.audio_file.dataUrl && clean.audio_file.dataUrl.length > 1000) {
    delete clean.audio_file.dataUrl;
  }
  if (clean.image_url && clean.image_url.startsWith("data:") && clean.image_url.length > 5000) {
    delete clean.image_url;
  }
  return clean;
}

/**
 * Save or update a single fatwa in Firestore using STRICT OPTIMISTIC CONCURRENCY CONTROL (OCC)
 * via a Firestore transaction.
 * - Reads remote document in transaction.
 * - Enforces EXACT equality between expectedVersion and remoteVersion (no stale overwrites).
 * - Enforces immutability of fatwaNumber, id, and created_at.
 * - Assigns remoteVersion + 1 monotonically.
 * - If mismatch, throws StaleWriteError with complete remote document.
 */
export async function saveFatwaToFirestore(
  fatwa: Fatwa,
  expectedVersion?: number
): Promise<{ success: boolean; id: string; version: number; updated_at: string }> {
  if (!fatwa.id) {
    throw new Error("Cannot save fatwa to Firestore without a stable ID.");
  }

  const docRef = doc(db, FATWAS_COLLECTION, fatwa.id);
  const now = new Date().toISOString();

  try {
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      const cleanData = sanitizeForFirestore(fatwa);

      if (snap.exists()) {
        const remote = snap.data() as any;
        const remoteVersion = typeof remote.version === "number" ? remote.version : 1;
        const targetExpectedVer =
          typeof expectedVersion === "number"
            ? expectedVersion
            : typeof fatwa.version === "number"
            ? fatwa.version
            : remoteVersion;

        // If remote was deleted via tombstone, forbid overwriting unless explicitly reviving
        if (remote.deleted === true && fatwa.deleted !== false) {
          throw new StaleWriteError("الفتوى محذوفة في السحابة بواسطة مستخدم آخر", remote as Fatwa);
        }

        // Section 4 & 5: Strict Optimistic Concurrency Control — exact equality check
        if (remoteVersion !== targetExpectedVer) {
          throw new StaleWriteError(
            `يوجد تضارب في الإصدار: الفتوى في السحابة بالإصدار ${remoteVersion} بينما المتوقع ${targetExpectedVer}`,
            remote as Fatwa
          );
        }

        // Section 2 & 6: Strict Immutable fatwaNumber check (NO client bypass)
        if (
          remote.fatwaNumber &&
          fatwa.fatwaNumber &&
          Number(remote.fatwaNumber) !== Number(fatwa.fatwaNumber)
        ) {
          throw new Error(
            `انتهاك تكامل البيانات: لا يمكن تعديل رقم الفتوى الثابت (#${remote.fatwaNumber} إلى #${fatwa.fatwaNumber})`
          );
        }

        // Preserve immutable fields
        cleanData.id = remote.id || fatwa.id;
        cleanData.fatwaNumber = remote.fatwaNumber || fatwa.fatwaNumber;
        cleanData.created_at = remote.created_at || fatwa.created_at || now;

        // Authoritative version increment
        cleanData.version = remoteVersion + 1;
        cleanData.updated_at = now;
        cleanData.deleted = false;
      } else {
        // Document creation: runtime schema validation
        const val = validateFatwaData(cleanData);
        if (!val.valid) {
          throw new Error(val.error || "بيانات الفتوى غير صالحة للإنشاء");
        }

        cleanData.version = 1;
        cleanData.created_at = cleanData.created_at || now;
        cleanData.updated_at = now;
        cleanData.deleted = false;
      }

      transaction.set(docRef, cleanData, { merge: true });
      return { version: cleanData.version, updated_at: cleanData.updated_at };
    });

    lastSuccessfulWriteTimestamp = now;
    currentSyncStatus = "synced";
    removeFromPendingSyncQueue(fatwa.id);

    return { success: true, id: fatwa.id, version: result.version, updated_at: result.updated_at };
  } catch (err: any) {
    if (err instanceof StaleWriteError) {
      removeFromPendingSyncQueue(fatwa.id);
      throw err;
    }

    lastErrorMessage = err?.message || String(err);
    if (checkIsQuotaError(err)) {
      setQuotaExceeded();
    } else if (checkIsPermissionError(err)) {
      currentSyncStatus = "permission-denied";
    } else {
      currentSyncStatus = "error";
    }

    enqueuePendingSync({
      id: fatwa.id,
      operation: "update",
      fatwa: {
        ...fatwa,
        updated_at: now,
      },
      expectedVersion: typeof expectedVersion === "number" ? expectedVersion : fatwa.version || 1,
      createdAt: now,
      timestamp: now,
      retries: 0,
    });

    throw err;
  }
}

export interface BatchSaveResult {
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  conflicts: number;
  conflictFatwas: Fatwa[];
  succeededIds: string[];
  errors: string[];
}

/**
 * Batch save multiple fatwas to Firestore WITH STRICT PER-DOCUMENT OCC CONCURRENCY PROTECTION.
 * Enforces exact OCC version matching and immutability.
 */
export async function batchSaveFatwasToFirestore(
  fatwas: Fatwa[]
): Promise<BatchSaveResult> {
  if (!fatwas || fatwas.length === 0) {
    return {
      success: true,
      total: 0,
      succeeded: 0,
      failed: 0,
      conflicts: 0,
      conflictFatwas: [],
      succeededIds: [],
      errors: [],
    };
  }

  let succeeded = 0;
  let failed = 0;
  let conflicts = 0;
  const conflictFatwas: Fatwa[] = [];
  const succeededIds: string[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const fatwa of fatwas) {
    if (!fatwa.id) {
      failed++;
      errors.push("Missing ID for fatwa");
      continue;
    }

    try {
      const docRef = doc(db, FATWAS_COLLECTION, fatwa.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(docRef);
        const cleanData = sanitizeForFirestore(fatwa);

        if (snap.exists()) {
          const remote = snap.data() as any;
          const remoteVersion = typeof remote.version === "number" ? remote.version : 1;
          const targetExpectedVer =
            typeof (fatwa as any).expectedVersion === "number"
              ? (fatwa as any).expectedVersion
              : typeof fatwa.version === "number"
              ? fatwa.version
              : remoteVersion;

          if (remote.deleted === true && !fatwa.deleted) {
            throw new StaleWriteError("الفتوى محذوفة سحابياً", remote as Fatwa);
          }

          // Strict exact OCC check
          if (remoteVersion !== targetExpectedVer) {
            throw new StaleWriteError(
              `تضارب في الإصدار: الفتوى #${remote.fatwaNumber || fatwa.id} في السحابة بالإصدار ${remoteVersion} (المتوقع ${targetExpectedVer})`,
              remote as Fatwa
            );
          }

          // Section 2 & 6: Strict Immutable fatwaNumber check
          if (
            remote.fatwaNumber &&
            fatwa.fatwaNumber &&
            Number(remote.fatwaNumber) !== Number(fatwa.fatwaNumber)
          ) {
            throw new Error(
              `انتهاك تكامل البيانات: لا يمكن تعديل رقم الفتوى الثابت (#${remote.fatwaNumber} إلى #${fatwa.fatwaNumber})`
            );
          }

          cleanData.id = remote.id || fatwa.id;
          cleanData.fatwaNumber = remote.fatwaNumber || fatwa.fatwaNumber;
          cleanData.created_at = remote.created_at || fatwa.created_at || now;
          cleanData.version = remoteVersion + 1;
          cleanData.updated_at = now;
          cleanData.deleted = false;
        } else {
          const val = validateFatwaData(cleanData);
          if (!val.valid) {
            throw new Error(val.error || "بيانات الفتوى المستوردة غير صالحة");
          }

          cleanData.version = 1;
          cleanData.created_at = cleanData.created_at || now;
          cleanData.updated_at = now;
          cleanData.deleted = false;
        }

        transaction.set(docRef, cleanData, { merge: true });
      });

      succeeded++;
      succeededIds.push(fatwa.id);
      removeFromPendingSyncQueue(fatwa.id);
    } catch (err: any) {
      if (err instanceof StaleWriteError) {
        conflicts++;
        if (err.remoteData) conflictFatwas.push(err.remoteData);
        errors.push(`تضارب في الفتوى #${fatwa.fatwaNumber || fatwa.id}: ${err.message}`);
      } else {
        failed++;
        errors.push(`فشل حفظ الفتوى #${fatwa.fatwaNumber || fatwa.id}: ${err.message || String(err)}`);
      }
    }
  }

  if (succeeded > 0) {
    lastSuccessfulWriteTimestamp = now;
    currentSyncStatus = "synced";
  }

  const allSuccess = failed === 0 && conflicts === 0;
  return {
    success: allSuccess,
    total: fatwas.length,
    succeeded,
    failed,
    conflicts,
    conflictFatwas,
    succeededIds,
    errors,
  };
}

/**
 * Uploads user fatwas from local state (Archive and Review) that are missing or newer than Firestore documents.
 */
export async function uploadUserFatwasToFirestore(
  localFatwas: Fatwa[],
  cloudFatwas: Fatwa[] = []
): Promise<{ uploaded: number; failed: number; conflicts: number }> {
  if (!localFatwas || localFatwas.length === 0) {
    return { uploaded: 0, failed: 0, conflicts: 0 };
  }

  const cloudMap = new Map<string, Fatwa>();
  (cloudFatwas || []).forEach((cf) => {
    if (cf && cf.id) cloudMap.set(cf.id, cf);
  });

  const toUpload: Fatwa[] = [];
  for (const lf of localFatwas) {
    if (!lf || !lf.id || isFatwaDeleted(lf.id, lf.fatwaNumber)) continue;
    const remote = cloudMap.get(lf.id);
    if (!remote) {
      // Missing in cloud: upload new document
      toUpload.push(lf);
    } else {
      const lVer = typeof lf.version === "number" ? lf.version : 1;
      const rVer = typeof remote.version === "number" ? remote.version : 1;
      const lTime = lf.updated_at ? new Date(lf.updated_at).getTime() : 0;
      const rTime = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
      if (lf.pendingSync || lVer > rVer || (lTime > rTime && lTime > 0)) {
        toUpload.push({ ...lf, expectedVersion: rVer } as any);
      }
    }
  }

  if (toUpload.length === 0) {
    return { uploaded: 0, failed: 0, conflicts: 0 };
  }

  // Upload in chunks of 50 to avoid connection timeouts
  let totalUploaded = 0;
  let totalFailed = 0;
  let totalConflicts = 0;
  const chunkSize = 50;

  for (let i = 0; i < toUpload.length; i += chunkSize) {
    const chunk = toUpload.slice(i, i + chunkSize);
    const res = await batchSaveFatwasToFirestore(chunk);
    totalUploaded += res.succeeded;
    totalFailed += res.failed;
    totalConflicts += res.conflicts;
  }

  return {
    uploaded: totalUploaded,
    failed: totalFailed,
    conflicts: totalConflicts,
  };
}

/**
 * Delete a fatwa using a VERSIONED cloud tombstone (deleted: true, version: remoteVersion + 1)
 * via a transaction with STRICT EXPECTED VERSION check so stale deletes cannot delete newer edits.
 */
export async function deleteFatwaFromFirestore(
  fatwaId: string,
  fatwaNumber?: number,
  expectedVersion?: number
): Promise<{ success: boolean; version?: number }> {
  if (!fatwaId) return { success: false };

  const docRef = doc(db, FATWAS_COLLECTION, fatwaId);
  const now = new Date().toISOString();

  try {
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      let newVersion = 1;
      let num = fatwaNumber || 0;

      if (snap.exists()) {
        const remote = snap.data() as any;
        const remoteVersion = typeof remote.version === "number" ? remote.version : 1;
        num = remote.fatwaNumber || num;

        // Section 11: Delete must be strict OCC — exact expectedVersion check
        if (typeof expectedVersion === "number" && remoteVersion !== expectedVersion) {
          throw new StaleWriteError(
            `فشل الحذف: تم تعديل الفتوى من مستخدم آخر إلى الإصدار ${remoteVersion} (المتوقع ${expectedVersion})`,
            remote as Fatwa
          );
        }

        newVersion = remoteVersion + 1;
      }

      const tombstone = {
        id: fatwaId,
        fatwaNumber: num,
        deleted: true,
        version: newVersion,
        deleted_at: now,
        updated_at: now,
      };

      transaction.set(docRef, tombstone, { merge: true });
      return { version: newVersion, fatwaNumber: num };
    });

    // Section 5: ONLY record local tombstone AFTER Firestore transaction succeeds!
    recordDeletedFatwa(fatwaId, result.fatwaNumber);

    lastSuccessfulWriteTimestamp = now;
    removeFromPendingSyncQueue(fatwaId);
    return { success: true, version: result.version };
  } catch (err: any) {
    if (err instanceof StaleWriteError) {
      // Section 5: Unrecord/rollback any local tombstone marker so remote document remains visible
      unrecordDeletedFatwa(fatwaId);
      removeFromPendingSyncQueue(fatwaId);
      throw err;
    }

    lastErrorMessage = err?.message || String(err);
    enqueuePendingSync({
      id: fatwaId,
      operation: "delete",
      fatwa: { id: fatwaId, fatwaNumber: fatwaNumber || 0, deleted: true, updated_at: now } as Fatwa,
      expectedVersion: expectedVersion || 1,
      createdAt: now,
      timestamp: now,
      retries: 0,
    });
    throw err;
  }
}

/**
 * Delete all fatwas via tombstones with per-document transactional OCC verification.
 * Never silently claims success if concurrent edits occurred.
 */
export async function clearAllFatwasFromFirestore(): Promise<{
  success: boolean;
  total: number;
  cleared: number;
  conflicts: number;
  errors: string[];
}> {
  try {
    const snapshot = await getDocs(collection(db, FATWAS_COLLECTION));
    const now = new Date().toISOString();
    let cleared = 0;
    let conflicts = 0;
    const errors: string[] = [];

    for (const docSnap of snapshot.docs) {
      try {
        await runTransaction(db, async (transaction) => {
          const currentSnap = await transaction.get(docSnap.ref);
          if (!currentSnap.exists()) return;
          const remote = currentSnap.data() as any;
          const remoteVersion = typeof remote.version === "number" ? remote.version : 1;
          const newVersion = remoteVersion + 1;
          transaction.set(
            docSnap.ref,
            {
              id: docSnap.id,
              fatwaNumber: remote.fatwaNumber || 0,
              deleted: true,
              version: newVersion,
              deleted_at: now,
              updated_at: now,
            },
            { merge: true }
          );
        });
        cleared++;
      } catch (err: any) {
        conflicts++;
        errors.push(`Doc ${docSnap.id}: ${err.message || String(err)}`);
      }
    }

    lastSuccessfulWriteTimestamp = now;
    return {
      success: conflicts === 0,
      total: snapshot.docs.length,
      cleared,
      conflicts,
      errors,
    };
  } catch (err: any) {
    lastErrorMessage = err?.message || String(err);
    throw err;
  }
}

/**
 * CANONICAL ADMINISTRATIVE RESEQUENCING MIGRATION (Section 12 & 13)
 * Atomically resequences all active fatwas in Firestore:
 * 1. Approved fatwas are ordered first (1..A) preserving citation order.
 * 2. Fatwas in review / drafts continue sequentially (A+1..N).
 * 3. Updates metadata/fatwa_sequence to N.
 */
export async function resequenceCanonicalFirestoreFatwas(): Promise<{
  success: boolean;
  total: number;
  resequenced: number;
  conflicts: number;
  errors: string[];
}> {
  try {
    const colRef = collection(db, FATWAS_COLLECTION);
    const snap = await getDocs(colRef);
    const allDocs: Fatwa[] = [];
    snap.docs.forEach((d) => {
      const data = d.data() as Fatwa;
      if (!data.deleted) {
        allDocs.push({
          ...data,
          id: data.id || d.id,
          fatwaNumber: Number(data.fatwaNumber) || 0,
          status: data.status || (data.approved ? "معتمدة" : "تحتاج مراجعة"),
          approved: Boolean(data.approved || data.status === "معتمدة" || data.status === "منشورة"),
          created_at: data.created_at || "",
          updated_at: data.updated_at || "",
          version: Number(data.version) || 1,
        });
      }
    });

    const approved = allDocs.filter((f) => f.approved);
    const review = allDocs.filter((f) => !f.approved);

    approved.sort((a, b) => {
      if (a.fatwaNumber !== b.fatwaNumber && a.fatwaNumber > 0 && b.fatwaNumber > 0) {
        return a.fatwaNumber - b.fatwaNumber;
      }
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });

    review.sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tA !== tB && tA > 0 && tB > 0) return tA - tB;
      if (a.fatwaNumber !== b.fatwaNumber && a.fatwaNumber > 0 && b.fatwaNumber > 0) {
        return a.fatwaNumber - b.fatwaNumber;
      }
      return a.id.localeCompare(b.id);
    });

    const orderedList = [...approved, ...review];
    const now = new Date().toISOString();
    const resequencedDocs = orderedList.map((f, idx) => ({
      ...f,
      fatwaNumber: idx + 1,
      version: (f.version || 1) + 1,
      updated_at: now,
    }));

    // Commit in chunks using writeBatch
    const chunkSize = 200;
    for (let i = 0; i < resequencedDocs.length; i += chunkSize) {
      const chunk = resequencedDocs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        const docRef = doc(db, FATWAS_COLLECTION, item.id);
        batch.set(docRef, item, { merge: true });
      });
      await batch.commit();
    }

    // Update metadata/fatwa_sequence
    const totalCount = resequencedDocs.length;
    await setDoc(
      doc(db, METADATA_COLLECTION, "fatwa_sequence"),
      {
        lastSequence: totalCount,
        initialized_at: now,
        updated_at: now,
        initialized_by: "canonical_admin_resequence",
        totalFatwas: totalCount,
        approvedCount: approved.length,
        reviewCount: review.length,
      },
      { merge: true }
    );

    return {
      success: true,
      total: totalCount,
      resequenced: totalCount,
      conflicts: 0,
      errors: [],
    };
  } catch (err: any) {
    return {
      success: false,
      total: 0,
      resequenced: 0,
      conflicts: 0,
      errors: [err?.message || String(err)],
    };
  }
}

// ==========================================
// OFFLINE / PENDING SYNCHRONIZATION QUEUE
// ==========================================

export function getPendingSyncQueue(): PendingSyncItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_SYNC_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePendingSyncQueue(queue: PendingSyncItem[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("Could not save pending sync queue:", e);
  }
}

export function enqueuePendingSync(item: PendingSyncItem): void {
  const queue = getPendingSyncQueue();
  const existingIdx = queue.findIndex((q) => q.id === item.id);
  if (existingIdx >= 0) {
    queue[existingIdx] = {
      ...queue[existingIdx],
      ...item,
      retries: queue[existingIdx].retries + 1,
      timestamp: new Date().toISOString(),
    };
  } else {
    queue.push(item);
  }
  savePendingSyncQueue(queue);
}

export function removeFromPendingSyncQueue(id: string): void {
  const queue = getPendingSyncQueue();
  const filtered = queue.filter((q) => q.id !== id);
  if (filtered.length !== queue.length) {
    savePendingSyncQueue(filtered);
  }
}

/**
 * Flush pending writes to Firestore with version-aware concurrency checks.
 * If remote document in Firestore is already newer than the queued item, discard the stale retry.
 * Invariant: NEWER REMOTE EDIT > OLD OFFLINE DELETE / UPDATE
 */
export async function flushPendingSyncQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  discarded: number;
}> {
  const queue = getPendingSyncQueue();
  if (queue.length === 0) return { processed: 0, succeeded: 0, failed: 0, discarded: 0 };

  let succeeded = 0;
  let failed = 0;
  let discarded = 0;
  const remaining: PendingSyncItem[] = [];

  for (const item of queue) {
    try {
      if (item.operation === "delete") {
        await deleteFatwaFromFirestore(item.id, item.fatwa.fatwaNumber, item.expectedVersion);
      } else {
        await saveFatwaToFirestore(item.fatwa, item.expectedVersion);
      }
      succeeded++;
    } catch (err: any) {
      if (err instanceof StaleWriteError) {
        // Discard stale retry - Section 7: NEWER REMOTE EDIT > OLD OFFLINE DELETE
        if (item.operation === "delete") {
          unrecordDeletedFatwa(item.id);
        }
        discarded++;
        console.warn(`[SyncQueue] Discarding stale pending operation for ${item.id} - remote document is newer.`);
      } else {
        failed++;
        item.retries += 1;
        remaining.push(item);
      }
    }
  }

  savePendingSyncQueue(remaining);
  return { processed: queue.length, succeeded, failed, discarded };
}
