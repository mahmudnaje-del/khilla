/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Header } from "./components/Header";
import { TranscribeWorkspace } from "./components/TranscribeWorkspace";
import { ReviewModalOrTab } from "./components/ReviewModalOrTab";
import { ImageCardGenerator } from "./components/ImageCardGenerator";
import { FatwaArchive } from "./components/FatwaArchive";
import { DashboardStats } from "./components/DashboardStats";
import { DeveloperPage } from "./components/DeveloperPage";
import { AdminPortal } from "./components/AdminPortal";
import { PublishingCenter } from "./components/PublishingCenter";
import { PageSkeletonLoader } from "./components/PageSkeletonLoader";
import PWADiagnostics from "./components/PWADiagnostics";
import { AuthModal } from "./components/AuthModal";
import { isEditorAuthorized, revokeEditorAuthorization } from "./utils/editorAuth";
import { InstallPromptModal } from "./components/InstallPromptModal";
import { ToastContainer, ToastMessage } from "./components/Toast";
import confetti from "canvas-confetti";
import { ArabicFatwaDetailsModal } from "./components/ArabicFatwaDetailsModal";
import { PublicPlatform, AdminReportsPanel, AdminSyncPanel } from "./public/PublicPlatform";
import { adminDestination, ensureShareLandsInAdmin, isAdminPath, isShareLaunch, pathForTab } from "./public/routes";
import { Fatwa, FatwaStatus, CardTemplateSettings, SyncStatus } from "./types";
import {
  syncApprovedFatwa,
  saveUserFatwaToServer,
  bulkSyncFatwasToServer,
  deleteApprovedFatwaFromServer,
} from "./utils/adminApi";
import {
  loadFatwasFromStorage,
  saveFatwasToStorage,
  clearAllFatwasFromStorage,
  loadFatwasFromIndexedDB,
  DEFAULT_TEMPLATE_SETTINGS,
  getPreferredTemplateStyle,
  recordDeletedFatwa,
  isFatwaDeleted,
  reconcileFatwasWithCloud,
  mergeWithServerFatwas,
  getStoredTranscriberInfo,
} from "./utils/storage";
import {
  subscribeToFatwas,
  saveFatwaToFirestore,
  batchSaveFatwasToFirestore,
  deleteFatwaFromFirestore,
  clearAllFatwasFromFirestore,
  testFirestoreConnection,
  fetchAllUserFatwasFromFirestore,
  uploadUserFatwasToFirestore,
  flushPendingSyncQueue,
  getPendingSyncQueue,
  getFirestoreDiagnostics,
  getNextGlobalFatwaNumber,
  getNextGlobalFatwaSequenceBlock,
  hasInitialFirestoreSnapshot,
  recordReconciliationTimestamp,
  StaleWriteError,
} from "./lib/firebase";

export default function App() {
  ensureShareLandsInAdmin();
  const [href, setHref] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname + window.location.search
  );
  const pathOnly = href.split("?")[0] || "/";
  const adminMode = isAdminPath(pathOnly) || isShareLaunch(href.includes("?") ? href.slice(href.indexOf("?")) : "");
  const adminTarget = adminDestination(pathOnly);

  const [activeTab, setActiveTab] = useState<
    "transcribe" | "review" | "card" | "archive" | "stats" | "developer" | "admin" | "publish"
  >(() => {
    if (!adminMode) return "stats";
    return adminTarget === "reports" || adminTarget === "sync" ? "stats" : adminTarget;
  });

  const [fatwas, setFatwas] = useState<Fatwa[]>(() => loadFatwasFromStorage());
  const [currentFatwa, setCurrentFatwa] = useState<Fatwa | null>(() => {
    const list = loadFatwasFromStorage();
    return list.length > 0 ? list[0] : null;
  });

  const [strictMode, setStrictMode] = useState<boolean>(true);
  const [isEditorVerified, setIsEditorVerified] = useState<boolean>(() => isEditorAuthorized());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => isEditorAuthorized());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const [isFirestoreConnected, setIsFirestoreConnected] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("initializing");
  const [pendingWritesCount, setPendingWritesCount] = useState<number>(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [detailsModalFatwa, setDetailsModalFatwa] = useState<Fatwa | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const transitionTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const handleOpenAdmin = () => {
    if (isEditorAuthorized()) {
      setIsEditorVerified(true);
      setIsAuthenticated(true);
      window.history.pushState(null, "", "/admin");
      setHref("/admin");
    } else {
      setIsAuthModalOpen(true);
    }
  };

  useEffect(() => {
    const sync = () => setHref(window.location.pathname + window.location.search);
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!adminMode) return;
    if (adminTarget === "reports" || adminTarget === "sync") return;
    setActiveTab(adminTarget);
  }, [adminMode, adminTarget]);

  // Real-time Cloud Firestore synchronization & initial seeding
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    testFirestoreConnection().then(({ connected, status }) => {
      setIsFirestoreConnected(connected);
      setSyncStatus(status);
      setPendingWritesCount(getPendingSyncQueue().length);
    });

    try {
      unsubscribe = subscribeToFatwas(
        (cloudFatwas, deletedIds) => {
          setIsFirestoreConnected(true);
          setSyncStatus("synced");
          recordReconciliationTimestamp();

          // 1. Record tombstones permanently
          if (deletedIds && deletedIds.length > 0) {
            deletedIds.forEach((id) => recordDeletedFatwa(id));
          }

          // 2. Deterministic reconciliation: Firestore is the single authoritative source of truth
          setFatwas((localPrev) => {
            const reconciled = reconcileFatwasWithCloud(localPrev, cloudFatwas);
            saveFatwasToStorage(reconciled);
            return reconciled;
          });

          // 3. Flush any pending offline queue items
          flushPendingSyncQueue().then(() => {
            setPendingWritesCount(getPendingSyncQueue().length);
          }).catch(() => {});
        },
        (error, status) => {
          setIsFirestoreConnected(false);
          setSyncStatus(status);
          setPendingWritesCount(getPendingSyncQueue().length);
        }
      );
    } catch (e) {
      setIsFirestoreConnected(false);
      setSyncStatus("error");
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Immediate canonical hydration from Firestore / Server to guarantee all authoritative fatwas are always loaded
  useEffect(() => {
    let isCancelled = false;
    const hydrateCanonicalFatwas = async () => {
      // 1. Direct Cloud Firestore authoritative fetch
      try {
        const firestoreResult = await fetchAllUserFatwasFromFirestore(7000);
        if (firestoreResult.success && Array.isArray(firestoreResult.fatwas) && firestoreResult.fatwas.length > 0 && !isCancelled) {
          if (firestoreResult.deletedIds && firestoreResult.deletedIds.length > 0) {
            firestoreResult.deletedIds.forEach((id) => recordDeletedFatwa(id));
          }
          setFatwas((prev) => {
            const reconciled = reconcileFatwasWithCloud(prev, firestoreResult.fatwas);
            saveFatwasToStorage(reconciled);
            return reconciled;
          });
          setCurrentFatwa((curr) => {
            if (curr) return curr;
            return firestoreResult.fatwas[0] || null;
          });
          return;
        }
      } catch (fErr) {
        console.warn("Direct Firestore initial fetch fallback to server:", fErr);
      }

      // 2. Central Server API fallback (which is also synchronized with Firestore)
      try {
        const res = await fetch("/api/fatwas");
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.fatwas) && data.fatwas.length > 0 && !isCancelled) {
            setFatwas((prev) => {
              const merged = mergeWithServerFatwas(prev, data.fatwas);
              saveFatwasToStorage(merged);
              return merged;
            });
            setCurrentFatwa((curr) => {
              if (curr) return curr;
              return data.fatwas[0] || null;
            });
            return;
          }
        }
      } catch (err) {
        console.warn("Could not fetch /api/fatwas, falling back to static seed:", err);
      }

      // 3. Static fallback if API is unreachable (e.g. offline cache)
      try {
        const staticRes = await fetch("/data/seed_fatwas.json");
        if (staticRes.ok) {
          const seedData = await staticRes.json();
          if (Array.isArray(seedData) && seedData.length > 0 && !isCancelled) {
            setFatwas((prev) => {
              const merged = mergeWithServerFatwas(prev, seedData);
              saveFatwasToStorage(merged);
              return merged;
            });
            setCurrentFatwa((curr) => {
              if (curr) return curr;
              return seedData[0] || null;
            });
          }
        }
      } catch (e) {
        console.warn("Could not load static seed fatwas:", e);
      }
    };

    hydrateCanonicalFatwas();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Real-Time Server-Sent Events (SSE) Stream for cross-tab and cross-device instant auto-sync
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource("/api/realtime/stream");

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "bulk_sync" && Array.isArray(data.fatwas) && data.fatwas.length > 0) {
              setFatwas((prev) => {
                const merged = mergeWithServerFatwas(prev, data.fatwas);
                saveFatwasToStorage(merged);
                return merged;
              });
            } else if (data.type === "fatwa_updated" && data.fatwa) {
              setFatwas((prev) => {
                const merged = mergeWithServerFatwas(prev, [data.fatwa]);
                saveFatwasToStorage(merged);
                return merged;
              });
            } else if (data.type === "fatwa_deleted" && (data.id || data.fatwaNumber)) {
              recordDeletedFatwa(data.id, data.fatwaNumber);
              setFatwas((prev) => {
                const filtered = prev.filter(
                  (f) => f.id !== data.id && (!data.fatwaNumber || f.fatwaNumber !== data.fatwaNumber)
                );
                saveFatwasToStorage(filtered);
                return filtered;
              });
            }
          } catch {
            // Heartbeat or parse skip
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch {
        reconnectTimeout = setTimeout(connectSSE, 10000);
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Hydrate from IndexedDB ONLY if authoritative Firestore initial snapshot has NOT yet arrived
  useEffect(() => {
    if (hasInitialFirestoreSnapshot()) return;
    loadFatwasFromIndexedDB()
      .then((idbFatwas) => {
        // Prevent race condition: if Firestore initial snapshot has already arrived, do not overwrite
        if (hasInitialFirestoreSnapshot()) return;
        if (idbFatwas && idbFatwas.length > 0) {
          setFatwas((prev) => {
            if (hasInitialFirestoreSnapshot()) return prev;
            if (prev.length === 0 || idbFatwas.length > prev.length) {
              return idbFatwas;
            }
            return prev;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Persist fatwas to local storage for instant offline cache
  useEffect(() => {
    saveFatwasToStorage(fatwas);
  }, [fatwas]);

  // Toast Helper
  const showToast = (text: string, type: "success" | "error" | "info" | "warning" = "success") => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const [isFetchingAllUsersFatwas, setIsFetchingAllUsersFatwas] = useState(false);

  // Unified Manual Sync & Upload (Upload user fatwas from Archive and Review -> Server & Firestore -> Download updates -> Reconcile)
  const handleFetchAllUserFatwas = async () => {
    setIsFetchingAllUsersFatwas(true);
    showToast("جارٍ رفع ومزامنة فتاوى الأرشيف والمراجعة مع السحابة والخادم المركزي...", "info");

    try {
      let workingFatwas = [...fatwas].filter((f) => f && f.id && !isFatwaDeleted(f.id, f.fatwaNumber));
      let uploadedToServerCount = 0;
      let uploadedToCloudCount = 0;

      // 1. PHASE 1: Always upload local user fatwas (both archive and review) to Central Server API
      try {
        const serverSyncRes = await fetch("/api/fatwas/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fatwas: workingFatwas }),
        });
        if (serverSyncRes.ok) {
          const syncData = await serverSyncRes.json();
          if (syncData.success && Array.isArray(syncData.fatwas)) {
            uploadedToServerCount = syncData.uploadedCount || 0;
            workingFatwas = mergeWithServerFatwas(workingFatwas, syncData.fatwas);
          }
        }
      } catch (serverErr) {
        console.warn("Server sync notice (continuing to cloud):", serverErr);
      }

      // 2. PHASE 2: Firestore Cloud Sync & Upload
      const conn = await testFirestoreConnection();
      setIsFirestoreConnected(conn.connected);
      setSyncStatus(conn.status);

      if (conn.connected) {
        // Flush any pending queue
        await flushPendingSyncQueue().catch(() => {});
        setPendingWritesCount(getPendingSyncQueue().length);

        // Fetch authoritative documents from Firestore
        const firestoreResult = await fetchAllUserFatwasFromFirestore(10000);

        if (firestoreResult.success) {
          // Record cloud tombstones
          if (firestoreResult.deletedIds && firestoreResult.deletedIds.length > 0) {
            firestoreResult.deletedIds.forEach((id) => recordDeletedFatwa(id));
          }

          // Upload any local fatwas (Archive or Review) that are missing or newer in Firestore
          const uploadCloudRes = await uploadUserFatwasToFirestore(workingFatwas, firestoreResult.fatwas);
          uploadedToCloudCount = uploadCloudRes.uploaded;

          // Reconcile working dataset with latest cloud docs
          const cloudDocs = firestoreResult.fatwas.length > 0 ? firestoreResult.fatwas : [];
          workingFatwas = reconcileFatwasWithCloud(workingFatwas, cloudDocs);
          recordReconciliationTimestamp();
          setSyncStatus("synced");
        }
      } else {
        console.warn("Firestore offline during sync; server sync was applied.");
      }

      // 3. Update application state and persistent storage
      setFatwas(workingFatwas);
      saveFatwasToStorage(workingFatwas);

      const approvedCount = workingFatwas.filter(
        (f) => f.status === "معتمدة" || f.status === "منشورة" || f.approved
      ).length;
      const pendingCount = workingFatwas.filter(
        (f) => f.status === "تحتاج مراجعة" || (!f.approved && f.status !== "معتمدة")
      ).length;

      const uploadSummary =
        uploadedToCloudCount > 0 || uploadedToServerCount > 0
          ? `(تم رفع ومزامنة ${Math.max(uploadedToCloudCount, uploadedToServerCount)} فتوى)`
          : "(كافة الفتاوى محدثة ومحفوظة)";

      showToast(
        `تمت المزامنة بنجاح ${uploadSummary} — إجمالي ${workingFatwas.length} فتوى (${approvedCount} معتمدة في الأرشيف، و${pendingCount} قيد المراجعة)`,
        "success"
      );
    } catch (err: any) {
      console.error("Sync error:", err);
      showToast("حدث خطأ أثناء المزامنة: " + (err?.message || String(err)), "error");
    } finally {
      setIsFetchingAllUsersFatwas(false);
    }
  };

  // Handle new transcribed fatwa with immediate automatic sync across Archive, Review, Server, and Cloud
  const handleTranscribeComplete = async (newFatwaData: Partial<Fatwa>) => {
    let nextNumber: number;
    try {
      nextNumber = await getNextGlobalFatwaNumber();
    } catch {
      // Fallback: calculate next number safely from local collection
      const maxExisting = fatwas.reduce((max, f) => {
        const n = Number(f.fatwaNumber);
        return Number.isInteger(n) && n > max ? n : max;
      }, 0);
      nextNumber = maxExisting + 1;
    }
    const now = new Date().toISOString();

    const rawStatus = (newFatwaData.status as FatwaStatus) || "تحتاج مراجعة";
    const isApproved = rawStatus === "معتمدة" || rawStatus === "منشورة" || Boolean(newFatwaData.approved);
    const finalStatus: FatwaStatus = isApproved ? "معتمدة" : "تحتاج مراجعة";

    const isVideo = newFatwaData.mediaType === "video" || Boolean(newFatwaData.audio_file?.isVideo);
    const preferredStyle = getPreferredTemplateStyle();
    const defaultStyle = newFatwaData.template_settings?.templateStyle || preferredStyle;

    const newFatwa: Fatwa = {
      id: newFatwaData.id || `fatwa-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      fatwaNumber: nextNumber,
      question_original: newFatwaData.question_original || "",
      question_clean: newFatwaData.question_clean || newFatwaData.question_original || "",
      audio_file: newFatwaData.audio_file || null,
      transcription_raw: newFatwaData.transcription_raw || "",
      answer_clean: newFatwaData.answer_clean || "",
      answer_tashkeel: newFatwaData.answer_tashkeel || "",
      fatwaType: newFatwaData.fatwaType || (isVideo ? "moasala" : "normal"),
      mediaType: newFatwaData.mediaType || (isVideo ? "video" : newFatwaData.audio_file ? "audio" : "text"),
      evidence_citations: newFatwaData.evidence_citations || [],
      unclear_segments: newFatwaData.unclear_segments || [],
      editing_notes: newFatwaData.editing_notes || [],
      created_at: now,
      updated_at: now,
      version: 1,
      deleted: false,
      pendingSync: true,
      status: finalStatus,
      reviewed: isApproved,
      approved: isApproved,
      has_wallahu_aalam: newFatwaData.has_wallahu_aalam ?? true,
      category: newFatwaData.category || "فتاوى عامة",
      tags: newFatwaData.tags || [],
      template_settings: {
        ...DEFAULT_TEMPLATE_SETTINGS,
        ...(newFatwaData.template_settings || {}),
        templateStyle: newFatwaData.template_settings?.templateStyle || defaultStyle,
      },
      transcriber_name: newFatwaData.transcriber_name || getStoredTranscriberInfo()?.name || "",
      transcriber_group: newFatwaData.transcriber_group || getStoredTranscriberInfo()?.groupNumber || "",
    };

    // 1. Immediately update state and persistent local storage
    setFatwas((prev) => {
      const updated = [newFatwa, ...prev.filter((f) => f.id !== newFatwa.id)];
      saveFatwasToStorage(updated);
      return updated;
    });
    setCurrentFatwa(newFatwa);

    // Navigate to appropriate tab: Archive if approved, Review if needs review
    if (isApproved) {
      setActiveTab("archive");
    } else {
      setActiveTab("review");
    }

    // 2. Immediate Automatic Central Server Sync (JSON database & SSE broadcast)
    fetch("/api/fatwas/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fatwas: [newFatwa] }),
    })
      .then(async (res) => {
        if (res.ok) {
          console.log(`[Auto-Sync] Fatwa #${newFatwa.fatwaNumber} auto-synced with central server`);
        }
      })
      .catch((e) => console.warn("[Auto-Sync] Server sync notice:", e));

    // 3. Immediate Automatic Cloud Firestore Sync with OCC
    const destinationName = isApproved ? "الأرشيف" : "قسم المراجعة";
    try {
      const res = await saveFatwaToFirestore(newFatwa);
      setFatwas((prev) => {
        const updated = prev.map((f) =>
          f.id === newFatwa.id
            ? { ...f, version: res.version, updated_at: res.updated_at, pendingSync: false }
            : f
        );
        saveFatwasToStorage(updated);
        return updated;
      });
      setPendingWritesCount(getPendingSyncQueue().length);
      showToast(
        `تم تفريغ الفتوى #${newFatwa.fatwaNumber} ومزامنتها تلقائياً مع ${destinationName} والسحابة بنجاح`,
        "success"
      );
    } catch (cloudErr: any) {
      if (cloudErr instanceof StaleWriteError && cloudErr.remoteData) {
        showToast("تنبيه: تم اعتماد النسخة السحابية الأحدث للفتوى تلقائياً", "info");
        setFatwas((prev) => {
          const updated = prev.map((f) => (f.id === newFatwa.id ? cloudErr.remoteData : f));
          saveFatwasToStorage(updated);
          return updated;
        });
        setCurrentFatwa(cloudErr.remoteData);
      } else {
        console.warn("Firestore auto-save notice:", cloudErr);
        setPendingWritesCount(getPendingSyncQueue().length);
        showToast(
          `تم تفريغ الفتوى #${newFatwa.fatwaNumber} وحفظها في ${destinationName} ومزامنتها مع الخادم (المزامنة السحابية جارية)`,
          "info"
        );
      }
    }
  };

  // Batch import fatwas with atomic block allocation and OCC verification
  const handleBatchImportFatwas = async (importedList: Partial<Fatwa>[], openFirstForReview: boolean = true) => {
    if (!importedList || importedList.length === 0) return;

    // Allocate authoritative global sequence block from Firestore
    let startSeq = 0;
    try {
      const block = await getNextGlobalFatwaSequenceBlock(importedList.length);
      startSeq = block.startNumber;
    } catch (seqErr: any) {
      showToast(seqErr.message || "تعذر حجز أرقام تسلسلية للدفعة المستوردة. تأكد من الاتصال بقاعدة البيانات السحابية.", "error");
      return;
    }

    const now = new Date().toISOString();

    const newFatwas: Fatwa[] = importedList.map((item, index) => {
      // Section 9: For a NEW imported document, fatwaNumber is strictly the authoritative allocated sequence number
      const allocatedNum = startSeq + index;

      return {
        id: item.id || `word-import-${Date.now()}-${index + 1}-${Math.random().toString(36).substring(2, 6)}`,
        fatwaNumber: allocatedNum,
        question_original: item.question_original || item.question_clean || `سؤال ${index + 1}`,
        question_clean: item.question_clean || item.question_original || `سؤال ${index + 1}`,
        transcription_raw: item.transcription_raw || item.answer_clean || "",
        answer_clean: item.answer_clean || "",
        unclear_segments: item.unclear_segments || [],
        editing_notes: item.editing_notes || ["مستورد من ملف Word"],
        category: item.category || "فتاوى عامة",
        tags: item.tags && item.tags.length ? item.tags : ["مستورد من Word"],
        has_wallahu_aalam: item.has_wallahu_aalam ?? true,
        status: (item.status as FatwaStatus) || "تحتاج مراجعة",
        reviewed: false,
        approved: false,
        created_at: now,
        updated_at: now,
        version: 1,
        deleted: false,
        pendingSync: true,
        template_settings: {
          ...DEFAULT_TEMPLATE_SETTINGS,
          templateStyle: getPreferredTemplateStyle(),
        },
      };
    });

    setFatwas((prev) => {
      const updated = [...newFatwas, ...prev];
      saveFatwasToStorage(updated);
      return updated;
    });

    // Immediate central server sync
    fetch("/api/fatwas/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fatwas: newFatwas }),
    }).catch((e) => console.warn("[Batch Auto-Sync] Server sync notice:", e));

    // Batch save to Cloud Firestore with OCC per-document check
    try {
      const batchResult = await batchSaveFatwasToFirestore(newFatwas);
      const succeededSet = new Set(batchResult.succeededIds || []);
      setFatwas((prev) => {
        const updated = prev.map((f) =>
          succeededSet.has(f.id) ? { ...f, pendingSync: false } : f
        );
        saveFatwasToStorage(updated);
        return updated;
      });
      setPendingWritesCount(getPendingSyncQueue().length);

      if (batchResult.success) {
        if (openFirstForReview && newFatwas.length > 0) {
          setCurrentFatwa(newFatwas[0]);
          setActiveTab("review");
          showToast(`تم استيراد ومزامنة ${newFatwas.length} فتوى بنجاح`, "success");
        } else {
          setActiveTab("archive");
          showToast(`تم إدراج ${newFatwas.length} فتوى في الأرشيف ومزامنتها بنجاح`, "success");
        }
      } else if (batchResult.succeeded > 0) {
        showToast(`مزامنة جزئية: تم استيراد ومزامنة ${batchResult.succeeded} من أصل ${newFatwas.length} فتوى (تعذر ${batchResult.failed + batchResult.conflicts})`, "warning");
        if (openFirstForReview && newFatwas.length > 0) {
          setCurrentFatwa(newFatwas[0]);
          setActiveTab("review");
        }
      } else {
        showToast(`فشلت مزامنة الاستيراد السحابي: ${batchResult.errors[0] || "تعذر الحفظ"}`, "error");
      }
    } catch (err: any) {
      setPendingWritesCount(getPendingSyncQueue().length);
      showToast(`حدث خطأ أثناء حفظ الفتاوى المستوردة: ${err.message || String(err)}`, "error");
    }

    bulkSyncFatwasToServer(newFatwas).catch((e) => console.warn("[Backup Mirror] Bulk sync notice:", e));
  };

  // Update fatwa with strict OCC and immediate auto-sync
  const handleUpdateFatwa = async (updated: Fatwa) => {
    const expectedVersion = updated.version || 1;
    const now = new Date().toISOString();
    const isApproved = updated.approved === false ? false : (updated.status === "معتمدة" || updated.status === "منشورة" || Boolean(updated.approved));
    const updatedFatwa: Fatwa = {
      ...updated,
      approved: isApproved,
      updated_at: now,
      deleted: false,
      pendingSync: true,
    };

    setFatwas((prev) => {
      const list = prev.map((f) => (f.id === updatedFatwa.id ? updatedFatwa : f));
      saveFatwasToStorage(list);
      return list;
    });
    setCurrentFatwa(updatedFatwa);

    // 1. Immediate Central Server Sync
    fetch("/api/fatwas/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fatwas: [updatedFatwa] }),
    }).catch((e) => console.warn("[Auto-Sync Update] Server sync notice:", e));

    // 2. Save to Cloud Firestore (authoritative with strict OCC)
    try {
      const res = await saveFatwaToFirestore(updatedFatwa, expectedVersion);
      setFatwas((prev) => {
        const list = prev.map((f) =>
          f.id === updatedFatwa.id
            ? { ...updatedFatwa, version: res.version, updated_at: res.updated_at, pendingSync: false }
            : f
        );
        saveFatwasToStorage(list);
        return list;
      });
      if (currentFatwa?.id === updatedFatwa.id) {
        setCurrentFatwa((prev) => prev ? { ...prev, version: res.version, updated_at: res.updated_at, pendingSync: false } : null);
      }
      setPendingWritesCount(getPendingSyncQueue().length);
    } catch (err: any) {
      if (err instanceof StaleWriteError && err.remoteData) {
        showToast(`تنبيه: قام مستخدم آخر بتعديل هذه الفتوى حديثاً (الإصدار ${err.remoteData.version}). تم استلام النسخة الأحدث تلقائياً.`, "warning");
        setFatwas((prev) => {
          const list = prev.map((f) => (f.id === err.remoteData.id ? { ...err.remoteData, pendingSync: false } : f));
          saveFatwasToStorage(list);
          return list;
        });
        setCurrentFatwa(err.remoteData);
      } else {
        console.warn("Firestore update save notice:", err);
        setPendingWritesCount(getPendingSyncQueue().length);
      }
    }

    // Backup mirror to server
    saveUserFatwaToServer(updatedFatwa).catch(() => {});
    if (updatedFatwa.status === "معتمدة" || updatedFatwa.status === "منشورة" || updatedFatwa.approved) {
      syncApprovedFatwa(updatedFatwa).catch(() => {});
    }
  };

  // Delete fatwa permanently using Firestore versioned tombstone with OCC protection
  const handleDeleteFatwa = async (id: string) => {
    const target = fatwas.find((f) => f.id === id);
    const fatwaNumber = target?.fatwaNumber;

    // 1. Record in permanent tombstone set immediately
    recordDeletedFatwa(id, fatwaNumber);

    // 2. Remove from local state
    setFatwas((prev) => {
      const filtered = prev.filter(
        (f) => f.id !== id && (!fatwaNumber || f.fatwaNumber !== fatwaNumber)
      );
      saveFatwasToStorage(filtered);
      return filtered;
    });

    if (currentFatwa?.id === id || (fatwaNumber && currentFatwa?.fatwaNumber === fatwaNumber)) {
      const remaining = fatwas.filter(
        (f) => f.id !== id && (!fatwaNumber || f.fatwaNumber !== fatwaNumber)
      );
      setCurrentFatwa(remaining.length > 0 ? remaining[0] : null);
    }

    // 3. Write versioned tombstone to Cloud Firestore with OCC check
    try {
      await deleteFatwaFromFirestore(id, fatwaNumber, target?.version);
      setPendingWritesCount(getPendingSyncQueue().length);
      showToast(`تم حذف الفتوى #${fatwaNumber || ""} بنجاح ومزامنة الحذف سحابياً`, "info");
    } catch (err: any) {
      setPendingWritesCount(getPendingSyncQueue().length);
      if (err instanceof StaleWriteError && err.remoteData) {
        showToast("تعذر حذف الفتوى: قام مستخدم آخر بتعديلها إلى إصدار أحدث. تم اعتماد النسخة الأحدث.", "warning");
        setFatwas((prev) => [err.remoteData, ...prev.filter((f) => f.id !== id)]);
        setCurrentFatwa(err.remoteData);
        return;
      }
      showToast(`تم حذف الفتوى #${fatwaNumber || ""} محلياً وجدولتها للحذف السحابي عند توفر الاتصال`, "info");
    }

    // 4. Secondary backup server delete
    deleteApprovedFatwaFromServer(id, fatwaNumber).catch(() => {});
  };

  // Clear all fatwas (Admin confirmation required - Section 12)
  const handleClearAllFatwas = async () => {
    const confirmed = window.confirm(
      "تحذير إداري صارم:\n\nهل أنت متأكد تماماً من رغبتك في نقل جميع الفتاوى إلى سجل المحذوفات؟\nلا يمكن التراجع عن هذه الخطوة إلا عبر استيراد جديد."
    );
    if (!confirmed) return;

    try {
      const clearRes = await clearAllFatwasFromFirestore();
      setPendingWritesCount(getPendingSyncQueue().length);
      if (clearRes.success && clearRes.cleared > 0) {
        fatwas.forEach((f) => recordDeletedFatwa(f.id, f.fatwaNumber));
        setFatwas([]);
        setCurrentFatwa(null);
        clearAllFatwasFromStorage();
        showToast(`تم تصفير ونقل جميع الفتاوى (${clearRes.cleared} فتوى) إلى سجل المحذوفات سحابياً ومحلياً بنجاح.`, "info");
      } else if (clearRes.cleared > 0) {
        showToast(`تم تصفير ${clearRes.cleared} فتوى مع تعذر ${clearRes.conflicts} بسبب تعديلات متزامنة.`, "warning");
      } else {
        showToast(`تعذر التصفير السحابي: ${clearRes.errors[0] || "فشلت العملية"}. لم يتم تعديل البيانات المحلية.`, "error");
      }
    } catch (err: any) {
      setPendingWritesCount(getPendingSyncQueue().length);
      showToast(`فشلت عملية التصفير السحابي: ${err.message || String(err)}. تم الإبقاء على البيانات المحلية بأمان.`, "error");
    }
  };

  // Update status directly with OCC and immediate auto-sync
  const handleUpdateStatus = async (id: string, newStatus: FatwaStatus) => {
    const targetFatwa = fatwas.find((f) => f.id === id);
    const expectedVersion = targetFatwa?.version || 1;
    const isApproved = newStatus === "معتمدة" || newStatus === "منشورة";
    let updatedItem: Fatwa | null = null;
    const now = new Date().toISOString();
    
    setFatwas((prev) => {
      const list = prev.map((f) => {
        if (f.id === id) {
          const updated = {
            ...f,
            status: newStatus,
            approved: isApproved,
            updated_at: now,
            deleted: false,
            pendingSync: true,
          };
          updatedItem = updated;
          return updated;
        }
        return f;
      });
      saveFatwasToStorage(list);
      return list;
    });

    if (currentFatwa?.id === id) {
      setCurrentFatwa((prev) => (prev ? { ...prev, status: newStatus, approved: isApproved, updated_at: now } : null));
    }

    if (updatedItem) {
      const itemToSave = updatedItem;

      // 1. Immediate Central Server Sync
      fetch("/api/fatwas/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fatwas: [itemToSave] }),
      }).catch((e) => console.warn("[Auto-Sync Status] Server sync notice:", e));

      // 2. Authoritative Firestore Sync
      try {
        const res = await saveFatwaToFirestore(itemToSave, expectedVersion);
        setFatwas((prev) => {
          const list = prev.map((f) =>
            f.id === id ? { ...f, version: res.version, updated_at: res.updated_at, pendingSync: false } : f
          );
          saveFatwasToStorage(list);
          return list;
        });
        setPendingWritesCount(getPendingSyncQueue().length);
        if (isApproved) {
          showToast("تم اعتماد الفتوى بنجاح ومزامنتها تلقائياً مع الأرشيف والسحابة", "success");
        } else {
          showToast(`تم تغيير حالة الفتوى إلى "${newStatus}" ومزامنتها تلقائياً مع المراجعة والسحابة`, "info");
        }
      } catch (err: any) {
        if (err instanceof StaleWriteError && err.remoteData) {
          showToast("تنبيه: قام مستخدم آخر بتعديل هذه الفتوى حديثاً. تم اعتماد النسخة الأحدث.", "warning");
          setFatwas((prev) => {
            const list = prev.map((f) => (f.id === id ? { ...err.remoteData, pendingSync: false } : f));
            saveFatwasToStorage(list);
            return list;
          });
          if (currentFatwa?.id === id) setCurrentFatwa(err.remoteData);
          return;
        }
        setPendingWritesCount(getPendingSyncQueue().length);
        showToast("تم تحديث الحالة ومزامنتها مع الخادم (المزامنة السحابية جارية)", "info");
      }

      saveUserFatwaToServer(itemToSave).catch(() => {});
      if (isApproved) {
        syncApprovedFatwa(itemToSave).catch(() => {});
      }
    }
  };

  // Update template settings
  const handleUpdateTemplateSettings = (settings: CardTemplateSettings) => {
    if (!currentFatwa) return;
    const updated = {
      ...currentFatwa,
      template_settings: settings,
    };
    handleUpdateFatwa(updated);
  };

  const [isPublishSyncing, setIsPublishSyncing] = useState(false);

  // Publish all approved fatwas with auto-sync of all transcribers
  const handleBatchPublishApproved = async () => {
    setIsPublishSyncing(true);
    showToast("جارٍ مزامنة فتاوى المفرغين ونشر كافة الفتاوى المعتمدة للبنية التحتية وواجهة القراء...", "info");
    try {
      const res = await fetch("/api/fatwas/publish-all-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fatwas }),
      });
      const data = await res.json();

      const now = new Date().toISOString();
      let localPublishedCount = 0;

      setFatwas((prev) => {
        const serverList = (data.success && Array.isArray(data.fatwas)) ? data.fatwas : [];
        const serverMap = new Map(serverList.map((f: any) => [f.id, f]));

        const updated = prev.map((f) => {
          if (serverMap.has(f.id)) {
            return serverMap.get(f.id);
          }
          if (f.status === "معتمدة" || f.approved || f.status === "منشورة") {
            localPublishedCount++;
            return {
              ...f,
              status: "منشورة" as const,
              approved: true,
              isPublic: true,
              published_at: f.published_at || now,
              updated_at: now,
              pendingSync: true,
            };
          }
          return f;
        });

        // Include any missing from server
        serverList.forEach((sf: any) => {
          if (!updated.some((item) => item.id === sf.id)) {
            updated.push(sf);
          }
        });

        saveFatwasToStorage(updated);
        return updated;
      });

      flushPendingSyncQueue().catch(() => {});

      const totalPublished = (data.success && typeof data.count === "number") ? data.count : localPublishedCount;
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
      showToast(`تم بنجاح نشر جميع الفتاوى المعتمدة (${totalPublished} فتوى) وأصبحت متاحة فوراً في واجهة القراء 🌐`, "success");
    } catch (e: any) {
      console.error("Batch publish error:", e);
      const now = new Date().toISOString();
      let count = 0;
      setFatwas((prev) => {
        const updated = prev.map((f) => {
          if (f.status === "معتمدة" || f.approved || f.status === "منشورة") {
            count++;
            return {
              ...f,
              status: "منشورة" as const,
              approved: true,
              isPublic: true,
              published_at: f.published_at || now,
              updated_at: now,
            };
          }
          return f;
        });
        saveFatwasToStorage(updated);
        return updated;
      });
      showToast(`تم نشر جميع الفتاوى المعتمدة محلياً (${count} فتوى) وتحديث واجهة القراء فوراً`, "success");
    } finally {
      setIsPublishSyncing(false);
    }
  };

  // Unpublish a single fatwa by its number
  const handleUnpublishFatwaByNumber = async (rawNumber: string | number): Promise<boolean> => {
    const cleanNum = Number(String(rawNumber).replace(/[^\d]/g, ""));
    const rawStr = String(rawNumber).trim();
    if (!cleanNum && !rawStr) {
      showToast("يرجى إدخال رقم الفتوى المطلوب إلغاء نشرها", "error");
      return false;
    }

    try {
      const res = await fetch("/api/fatwas/unpublish-by-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fatwaNumber: rawNumber }),
      });
      const data = await res.json();

      let targetItem: Fatwa | null = null;
      const now = new Date().toISOString();

      setFatwas((prev) => {
        const updated = prev.map((f) => {
          const match = (cleanNum && Number(f.fatwaNumber) === cleanNum) || f.id === rawStr;
          if (match) {
            targetItem = {
              ...f,
              status: "معتمدة" as const,
              approved: true,
              isPublic: false,
              updated_at: now,
              pendingSync: true,
            };
            return targetItem;
          }
          return f;
        });
        saveFatwasToStorage(updated);
        return updated;
      });

      if (targetItem) {
        showToast(`تم إلغاء نشر الفتوى رقم #${(targetItem as Fatwa).fatwaNumber || cleanNum} وسحبها من واجهة القراء فوراً 🚫`, "info");
        return true;
      } else if (data.success && data.fatwa) {
        showToast(`تم إلغاء نشر الفتوى رقم #${data.fatwa.fatwaNumber || cleanNum} وسحبها من واجهة القراء 🚫`, "info");
        return true;
      } else {
        showToast(`لم يتم العثور على فتوى برقم ${rawNumber} في النظام`, "error");
        return false;
      }
    } catch (e: any) {
      console.error("Unpublish single error:", e);
      showToast("حدث خطأ أثناء الاتصال بالخادم لإلغاء نشر الفتوى", "error");
      return false;
    }
  };

  // Unpublish all fatwas from readers platform
  const handleUnpublishAllFatwas = async () => {
    try {
      const res = await fetch("/api/fatwas/unpublish-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      const now = new Date().toISOString();
      let count = 0;

      setFatwas((prev) => {
        const updated = prev.map((f) => {
          if (f.status === "منشورة" || f.isPublic === true) {
            count++;
            return {
              ...f,
              status: "معتمدة" as const,
              approved: true,
              isPublic: false,
              updated_at: now,
              pendingSync: true,
            };
          }
          return f;
        });
        saveFatwasToStorage(updated);
        return updated;
      });

      const totalUnpublished = (data.success && typeof data.count === "number") ? data.count : count;
      showToast(`تم إلغاء نشر جميع الفتاوى (${totalUnpublished} فتوى) وسحبها فوراً من واجهة القراء 🚫`, "info");
    } catch (e: any) {
      console.error("Unpublish all error:", e);
      showToast("حدث خطأ أثناء محاولة إلغاء نشر جميع الفتاوى", "error");
    }
  };

  // New fatwa action
  const handleStartNewFatwa = () => {
    setActiveTab("transcribe");
  };

  // Select fatwa from archive
  const handleSelectFatwa = (fatwa: Fatwa, targetTab: "review" | "card" = "review") => {
    setCurrentFatwa(fatwa);
    setActiveTab(targetTab);
  };

  // Pending review fatwas list & count
  const pendingReviewFatwas = fatwas.filter(
    (f) =>
      !isFatwaDeleted(f.id, f.fatwaNumber) &&
      (f.status === "تحتاج مراجعة" ||
        f.status === "مسودة" ||
        f.status === "مراجعة" ||
        (!f.approved && f.status !== "معتمدة" && f.status !== "منشورة"))
  );
  const pendingReviewCount = pendingReviewFatwas.length;

  // Approved awaiting publish count
  const approvedPendingPublishFatwas = fatwas.filter(
    (f) =>
      !isFatwaDeleted(f.id, f.fatwaNumber) &&
      (f.status === "معتمدة" || f.approved) &&
      f.status !== "منشورة" &&
      (f as any).isPublic !== true
  );
  const approvedPendingPublishCount = approvedPendingPublishFatwas.length;

  // Publish a single fatwa
  const handlePublishSingleFatwa = async (fatwaId: string) => {
    const now = new Date().toISOString();
    let publishedItem: Fatwa | null = null;
    setFatwas((prev) => {
      const updated = prev.map((f) => {
        if (f.id === fatwaId) {
          publishedItem = {
            ...f,
            status: "منشورة" as const,
            approved: true,
            isPublic: true,
            published_at: f.published_at || now,
            updated_at: now,
            pendingSync: true,
          };
          return publishedItem;
        }
        return f;
      });
      saveFatwasToStorage(updated);
      return updated;
    });

    if (publishedItem) {
      await handleUpdateFatwa(publishedItem);
    }
  };

  const handleTabChange = (tab: "transcribe" | "review" | "card" | "archive" | "stats" | "developer" | "admin" | "publish") => {
    if (tab === activeTab) return;

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    // Show custom skeleton screen during transition to eliminate any white flash
    setIsTransitioning(true);

    if (tab === "review") {
      if (!currentFatwa || currentFatwa.approved || currentFatwa.status === "معتمدة" || currentFatwa.status === "منشورة") {
        if (pendingReviewFatwas.length > 0) {
          setCurrentFatwa(pendingReviewFatwas[0]);
        }
      }
    }
    setActiveTab(tab);
    const next = pathForTab(tab);
    if (window.location.pathname !== next) {
      window.history.pushState(null, "", next);
      setHref(next);
    }

    // Brief smooth transition to reveal loaded tab seamlessly
    transitionTimerRef.current = setTimeout(() => {
      setIsTransitioning(false);
    }, 280);
  };

  const showDiagnostics = new URLSearchParams(window.location.search).get("diag") === "1";

  if (showDiagnostics) {
    return <PWADiagnostics />;
  }

  if (!adminMode) {
    return (
      <>
        <PublicPlatform
          fatwas={fatwas}
          onOpenAdmin={handleOpenAdmin}
        />
        <InstallPromptModal isOpen={isInstallModalOpen} onClose={() => setIsInstallModalOpen(false)} />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={() => {
            setIsEditorVerified(true);
            setIsAuthenticated(true);
            window.history.pushState(null, "", "/admin");
            setHref("/admin");
            showToast("تم التحقق من كلمات السر بنجاح، مرحباً بك في لوحة المحررين", "success");
          }}
          isAuthenticated={isAuthenticated}
          onLogout={() => {
            revokeEditorAuthorization();
            setIsEditorVerified(false);
            setIsAuthenticated(false);
            showToast("تم تسجيل الخروج وقفل اللوحة", "info");
          }}
          title="الدخول إلى لوحة المحررين"
          subtitle="يُطلب إدخال كلمات السر المعتمدة للوصول إلى لوحة المحررين. تُطلب هذه الكلمات مرة واحدة فقط عند الدخول أول مرة."
        />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  // Gatekeeper: If navigating directly to admin path without verifying the two secret values
  if (adminMode && !isEditorVerified) {
    return (
      <>
        <PublicPlatform
          fatwas={fatwas}
          onOpenAdmin={() => setIsAuthModalOpen(true)}
        />
        <AuthModal
          isOpen={true}
          onClose={() => {
            window.history.pushState(null, "", "/");
            setHref("/");
          }}
          onSuccess={() => {
            setIsEditorVerified(true);
            setIsAuthenticated(true);
            showToast("تم التحقق من كلمات السر بنجاح، مرحباً بك في لوحة المحررين", "success");
          }}
          isAuthenticated={false}
          onLogout={() => {
            revokeEditorAuthorization();
            setIsEditorVerified(false);
            setIsAuthenticated(false);
          }}
          title="الدخول إلى لوحة المحررين"
          subtitle="يُطلب إدخال كلمات السر المعتمدة للوصول إلى لوحة وتفريغ الفتاوى. تُطلب هذه الكلمات مرة واحدة فقط عند الدخول أول مرة."
          showCancelReturnToPublic={true}
          onReturnToPublic={() => {
            window.history.pushState(null, "", "/");
            setHref("/");
          }}
        />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbf9f4] text-stone-900 flex flex-col font-tajawal">
      {/* Responsive Header & Sidebar */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        strictMode={strictMode}
        setStrictMode={setStrictMode}
        isAuthenticated={isAuthenticated}
        setIsAuthModalOpen={setIsAuthModalOpen}
        onNewFatwa={handleStartNewFatwa}
        pendingReviewCount={pendingReviewCount}
        pendingPublishCount={approvedPendingPublishCount}
        onOpenInstallModal={() => setIsInstallModalOpen(true)}
        showToast={showToast}
        isFirestoreConnected={isFirestoreConnected}
        syncStatus={syncStatus}
        pendingWritesCount={pendingWritesCount}
        onFetchAllUserFatwas={handleFetchAllUserFatwas}
        isFetchingAllUsersFatwas={isFetchingAllUsersFatwas}
      />

      {/* Main Content Area with desktop right margin for sidebar */}
      <div className="flex-1 flex flex-col lg:mr-64 xl:mr-72 min-h-screen">
        <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-8">
          {adminTarget === "reports" ? (
            <AdminReportsPanel />
          ) : adminTarget === "sync" ? (
            <AdminSyncPanel syncStatus={syncStatus} pendingWrites={pendingWritesCount} />
          ) : isTransitioning ? (
            <motion.div
              key="skeleton-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              <PageSkeletonLoader activeTab={activeTab} />
            </motion.div>
          ) : (
          <AnimatePresence mode="wait">
            {activeTab === "transcribe" && (
              <motion.div
                key="transcribe"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <TranscribeWorkspace
                  onTranscribeComplete={handleTranscribeComplete}
                  onBatchImportFatwas={handleBatchImportFatwas}
                  strictMode={strictMode}
                  setStrictMode={setStrictMode}
                  showToast={showToast}
                  onNavigateToCard={() => setActiveTab("card")}
                  onNavigateToReview={() => setActiveTab("review")}
                  onOpenArabicDetails={(f) => setDetailsModalFatwa(f)}
                  fatwas={fatwas}
                  onPublishAllApproved={handleBatchPublishApproved}
                  onUnpublishFatwaByNumber={handleUnpublishFatwaByNumber}
                  onUnpublishAllFatwas={handleUnpublishAllFatwas}
                  isPublishSyncing={isPublishSyncing}
                />
              </motion.div>
            )}

            {activeTab === "review" && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <ReviewModalOrTab
                  currentFatwa={currentFatwa}
                  fatwas={fatwas}
                  onSelectFatwa={(f) => setCurrentFatwa(f)}
                  onUpdateFatwa={handleUpdateFatwa}
                  onDeleteFatwa={handleDeleteFatwa}
                  onNavigateToCard={() => setActiveTab("card")}
                  onNavigateToTranscribe={() => setActiveTab("transcribe")}
                  onNavigateToAdmin={() => setActiveTab("admin")}
                  onNavigateToArchive={() => setActiveTab("archive")}
                  onUpdateTemplateSettings={handleUpdateTemplateSettings}
                  showToast={showToast}
                  onFetchAllUserFatwas={handleFetchAllUserFatwas}
                  isFetchingAllUsersFatwas={isFetchingAllUsersFatwas}
                  onOpenArabicDetails={(f) => setDetailsModalFatwa(f)}
                />
              </motion.div>
            )}

            {activeTab === "card" && (
              <motion.div
                key="card"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <ImageCardGenerator
                  currentFatwa={currentFatwa}
                  onUpdateTemplateSettings={handleUpdateTemplateSettings}
                  onUpdateFatwa={handleUpdateFatwa}
                  onDeleteFatwa={handleDeleteFatwa}
                  onNavigateToTranscribe={() => setActiveTab("transcribe")}
                  onNavigateToAdmin={() => setActiveTab("admin")}
                  showToast={showToast}
                  onOpenArabicDetails={(f) => setDetailsModalFatwa(f)}
                />
              </motion.div>
            )}

            {activeTab === "archive" && (
              <motion.div
                key="archive"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <FatwaArchive
                  fatwas={fatwas}
                  onSelectFatwa={handleSelectFatwa}
                  onDeleteFatwa={handleDeleteFatwa}
                  onUpdateStatus={handleUpdateStatus}
                  onClearAll={handleClearAllFatwas}
                  onNavigateToTranscribe={() => setActiveTab("transcribe")}
                  onBatchImportFatwas={handleBatchImportFatwas}
                  showToast={showToast}
                  onFetchAllUserFatwas={handleFetchAllUserFatwas}
                  isFetchingAllUsersFatwas={isFetchingAllUsersFatwas}
                  syncStatus={syncStatus}
                  pendingWritesCount={pendingWritesCount}
                  onOpenArabicDetails={(f) => setDetailsModalFatwa(f)}
                />
              </motion.div>
            )}

            {activeTab === "stats" && (
              <motion.div
                key="stats"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <DashboardStats
                  fatwas={fatwas}
                  onNewFatwa={handleStartNewFatwa}
                  onFilterNeedsReview={() => {
                    const firstPending = fatwas.find(f => f.status === "تحتاج مراجعة" || f.status === "مسودة" || (!f.approved && f.status !== "معتمدة" && f.status !== "منشورة"));
                    if (firstPending) {
                      setCurrentFatwa(firstPending);
                    }
                    setActiveTab("review");
                  }}
                  onOpenArchive={() => setActiveTab("archive")}
                  onOpenPublishingCenter={() => setActiveTab("publish")}
                  onPublishAllApproved={handleBatchPublishApproved}
                  onUnpublishFatwaByNumber={handleUnpublishFatwaByNumber}
                  onUnpublishAllFatwas={handleUnpublishAllFatwas}
                  isPublishSyncing={isPublishSyncing}
                  showToast={showToast}
                />
              </motion.div>
            )}

            {activeTab === "publish" && (
              <motion.div
                key="publish"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <PublishingCenter
                  fatwas={fatwas}
                  onUpdateFatwa={handleUpdateFatwa}
                  onPublishFatwa={handlePublishSingleFatwa}
                  onUnpublishFatwa={handleUnpublishFatwaByNumber}
                  onPublishAllApproved={handleBatchPublishApproved}
                  onNavigateToCard={(f) => {
                    setCurrentFatwa(f);
                    setActiveTab("card");
                  }}
                  onNavigateToReview={(f) => {
                    setCurrentFatwa(f);
                    setActiveTab("review");
                  }}
                  showToast={showToast}
                />
              </motion.div>
            )}

            {activeTab === "developer" && (
              <motion.div
                key="developer"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <DeveloperPage
                  onNavigateToTranscribe={() => setActiveTab("transcribe")}
                  onNavigateToAdmin={() => setActiveTab("admin")}
                  onRunFullSyncCampaign={handleFetchAllUserFatwas}
                  showToast={showToast}
                  fatwas={fatwas}
                />
              </motion.div>
            )}

            {activeTab === "admin" && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <AdminPortal
                  localFatwas={fatwas}
                  onNavigateToCard={(fatwa) => {
                    setCurrentFatwa(fatwa);
                    setActiveTab("card");
                  }}
                  onNavigateToArchive={() => setActiveTab("archive")}
                  showToast={showToast}
                  onFetchAllUserFatwas={handleFetchAllUserFatwas}
                  isFetchingAllUsersFatwas={isFetchingAllUsersFatwas}
                  syncStatus={syncStatus}
                  pendingWritesCount={pendingWritesCount}
                  onResequenceFatwas={(resequenced) => {
                    setFatwas(resequenced);
                    saveFatwasToStorage(resequenced);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-stone-200/80 bg-white/70 backdrop-blur py-5 text-center text-xs text-stone-500 font-tajawal hidden lg:block">
          <div className="max-w-6xl mx-auto px-4 space-y-1">
            <p className="font-bold text-stone-700 font-cairo">
              منظومة تفريغ وترتيب فتاوى فضيلة الشيخ د. عبد الباري خلة
            </p>
            <p className="text-[11px] text-stone-400">
              أمانة النقل، والتحرير الأدنى، والنشر المتقن عبر نماذج Google Gemini الذكية
            </p>
          </div>
        </footer>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
          setIsEditorVerified(true);
          setIsAuthenticated(true);
          showToast("تم التحقق من كلمات السر بنجاح كمحرر معتمد", "success");
        }}
        isAuthenticated={isAuthenticated}
        onLogout={() => {
          revokeEditorAuthorization();
          setIsEditorVerified(false);
          setIsAuthenticated(false);
          window.history.pushState(null, "", "/");
          setHref("/");
          showToast("تم تسجيل الخروج وقفل لوحة المحررين", "info");
        }}
      />

      {/* Install Prompt Modal */}
      <InstallPromptModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* Global Arabic Fatwa Details Modal (السؤال لحال والجواب بالحركات) */}
      <ArabicFatwaDetailsModal
        isOpen={!!detailsModalFatwa}
        onClose={() => setDetailsModalFatwa(null)}
        fatwa={detailsModalFatwa}
        onNavigateToCard={() => {
          if (detailsModalFatwa) {
            setCurrentFatwa(detailsModalFatwa);
            setActiveTab("card");
          }
        }}
        onUpdateFatwa={handleUpdateFatwa}
        showToast={showToast}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
