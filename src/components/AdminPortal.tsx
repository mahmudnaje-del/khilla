import React, { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck,
  Lock,
  Unlock,
  Search,
  Filter,
  Download,
  Trash2,
  Edit3,
  Copy,
  Eye,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  BookOpen,
  Calendar,
  Layers,
  FileSpreadsheet,
  FileCode,
  LogOut,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Volume2,
  Share2,
  Save,
  X,
  PlusCircle,
  Tag,
  ArrowUpDown,
  Check,
  CloudDownload,
  Wand2,
  ListOrdered,
  Activity,
} from "lucide-react";
import { Fatwa, FatwaStatus } from "../types";
import {
  loginAdmin,
  getAdminSession,
  setAdminSession,
  deleteApprovedFatwaFromServer,
  updateApprovedFatwaOnServer,
  syncApprovedFatwa,
  bulkSyncFatwasToServer,
  resequenceAllFatwasOnServer,
  fixQuestionGreetingsOnServer,
  verifyAndRepairServerSync,
  checkServerHealth,
  AdminSession
} from "../utils/adminApi";
import {
  saveFatwaToFirestore,
  deleteFatwaFromFirestore,
  batchSaveFatwasToFirestore,
  fetchAllUserFatwasFromFirestore,
  resequenceCanonicalFirestoreFatwas,
  StaleWriteError,
} from "../lib/firebase";
import {
  loadFatwasFromStorage,
  saveFatwasToStorage,
  SEED_FATWAS,
  resequenceAllFatwasStrictly,
  recordDeletedFatwa,
  reconcileFatwasWithCloud,
  mergeWithServerFatwas,
} from "../utils/storage";
import {
  sanitizeQuestionGreeting,
  hasQuestionGreetingIssue,
  hasAnswerInQuestion,
  cleanQuestionAnswerBleed,
  separateQuestionAndAnswer,
} from "../utils/greetingSanitizer";

interface AdminPortalProps {
  onNavigateToCard?: (fatwa: Fatwa) => void;
  onNavigateToTranscribe?: () => void;
  onNavigateToArchive?: () => void;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  localFatwas?: Fatwa[];
  onFetchAllUserFatwas?: () => Promise<void>;
  isFetchingAllUsersFatwas?: boolean;
  onResequenceFatwas?: (resequenced: Fatwa[]) => void;
  syncStatus?: "initializing" | "connecting" | "synced" | "offline" | "error" | "permission-denied" | "quota-exceeded";
  pendingWritesCount?: number;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  onNavigateToCard,
  onNavigateToTranscribe,
  onNavigateToArchive,
  showToast,
  localFatwas = [],
  onFetchAllUserFatwas,
  isFetchingAllUsersFatwas = false,
  onResequenceFatwas,
  syncStatus,
  pendingWritesCount = 0,
}) => {
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Server Fatwas state - initializes with full authoritative dataset (all 314+ fatwas)
  const [serverFatwas, setServerFatwas] = useState<Fatwa[]>(() => {
    if (localFatwas && localFatwas.length >= SEED_FATWAS.length) {
      return localFatwas;
    }
    const cached = loadFatwasFromStorage();
    if (cached && cached.length >= SEED_FATWAS.length) {
      return cached;
    }
    return SEED_FATWAS;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [viewScope, setViewScope] = useState<"all" | "approved" | "pending">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "number">("newest");
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Modal inspection & Edit state
  const [viewingFatwa, setViewingFatwa] = useState<Fatwa | null>(null);
  const [editingFatwa, setEditingFatwa] = useState<Fatwa | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editStatus, setEditStatus] = useState<FatwaStatus>("معتمدة");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Copied feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Automatically load and synchronize all fatwas into Admin Portal using Firestore as sole authority
  const loadApprovedFatwas = async () => {
    setIsLoading(true);

    try {
      const firestoreResult = await fetchAllUserFatwasFromFirestore(10000);

      if (firestoreResult.success && firestoreResult.fatwas && firestoreResult.fatwas.length > 0) {
        // 1. Process tombstones from Firestore
        const cloudDeletedIds = new Set<string>(firestoreResult.deletedIds || []);
        cloudDeletedIds.forEach((id) => {
          recordDeletedFatwa(id);
        });

        // 2. Authoritative reconciliation with Cloud Firestore
        const baseDataset = localFatwas && localFatwas.length > 0 ? localFatwas : serverFatwas;
        const reconciled = reconcileFatwasWithCloud(baseDataset, firestoreResult.fatwas);

        setServerFatwas(reconciled);
        saveFatwasToStorage(reconciled);
        setLastRefreshed(new Date());
      } else {
        // Fallback to central server API to guarantee all fatwas display even if Firestore is unseeded or offline
        try {
          const res = await fetch("/api/fatwas");
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.fatwas) && data.fatwas.length > 0) {
              const baseDataset = localFatwas && localFatwas.length > 0 ? localFatwas : serverFatwas;
              const merged = mergeWithServerFatwas(baseDataset, data.fatwas);
              setServerFatwas(merged);
              saveFatwasToStorage(merged);
              setLastRefreshed(new Date());
            }
          }
        } catch (serverErr) {
          console.warn("Could not fetch /api/fatwas in Admin Portal fallback:", serverErr);
        }
      }
    } catch (err) {
      console.warn("Error fetching authoritative fatwas for Admin Portal:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Immediate approval of any user-submitted fatwa directly from Admin Portal with OCC
  const handleQuickApprove = async (fatwa: Fatwa) => {
    const updated: Fatwa = {
      ...fatwa,
      status: "معتمدة",
      approved: true,
      reviewed: true,
      version: (fatwa.version || 1) + 1,
      updated_at: new Date().toISOString(),
      approved_by: "الشيخ د. عبد الباري خلة (المشرف العام)",
    };

    setServerFatwas((prev) => prev.map((f) => (f.id === fatwa.id ? updated : f)));

    try {
      const res = await saveFatwaToFirestore(updated);
      const synced = { ...updated, version: res.version, updated_at: res.updated_at };
      setServerFatwas((prev) => prev.map((f) => (f.id === fatwa.id ? synced : f)));
      syncApprovedFatwa(synced).catch(() => {});
      showToast(`تم اعتماد الفتوى رقم ${updated.fatwaNumber || ""} بنجاح ومزامنتها سحابياً`, "success");
    } catch (err: any) {
      if (err instanceof StaleWriteError && err.remoteData) {
        showToast("تنبيه: تم اعتماد النسخة الأحدث من السحابة", "info");
        setServerFatwas((prev) => prev.map((f) => (f.id === fatwa.id ? err.remoteData : f)));
      } else {
        syncApprovedFatwa(updated).catch(() => {});
        showToast(`تم اعتماد الفتوى رقم ${updated.fatwaNumber || ""} محلياً وجدولتها للسحابة`, "info");
      }
    }
  };

  // Manual trigger for fetching all user fatwas from cloud and server - locks and stays fixed permanently
  const handleManualFetchAll = async () => {
    setIsLoading(true);
    try {
      if (onFetchAllUserFatwas) {
        await onFetchAllUserFatwas();
      }
      await loadApprovedFatwas();
      showToast(`تم تثبيت ومزامنة كافة الفتاوى بشكل دائم في لوحة الإدارة وقاعدة البيانات المركزية`, "success");
    } catch (err) {
      console.warn("Manual fetch all notice:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      loadApprovedFatwas();
    }
  }, [session?.token]);

  // Real-time synchronization whenever localFatwas updates
  useEffect(() => {
    if (!session || !localFatwas || localFatwas.length === 0) return;
    setServerFatwas((prev) => {
      const map = new Map<string, Fatwa>();
      prev.forEach((f) => map.set(f.id || `num-${f.fatwaNumber}`, f));
      let hasChanges = false;
      localFatwas.forEach((lf) => {
        const key = lf.id || `num-${lf.fatwaNumber}`;
        if (!map.has(key)) {
          map.set(key, lf);
          hasChanges = true;
        } else {
          const existing = map.get(key)!;
          if (lf.status !== existing.status || lf.question_clean !== existing.question_clean || lf.answer_clean !== existing.answer_clean) {
            map.set(key, { ...existing, ...lf });
            hasChanges = true;
          }
        }
      });
      if (!hasChanges) return prev;
      const combined = Array.from(map.values());
      combined.sort((a, b) => {
        const numA = Number(a.fatwaNumber) || 0;
        const numB = Number(b.fatwaNumber) || 0;
        if (numA !== numB) return numB - numA;
        return 0;
      });
      saveFatwasToStorage(combined);
      return combined;
    });
  }, [localFatwas, session]);

  // Handle Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const res = await loginAdmin(usernameInput.trim(), passwordInput.trim());
    if (res.success && res.user && res.token) {
      const newSession: AdminSession = {
        user: res.user,
        token: res.token,
        timestamp: Date.now()
      };
      setSession(newSession);
      showToast(`أهلاً بك فضيلة الشيخ د. عبد الباري خلة في لوحة الإدارة المركزية`, "success");
    } else {
      setLoginError(res.error || "اسم المستخدم أو كلمة المرور غير صحيحة");
    }
    setIsLoggingIn(false);
  };

  // Handle Logout
  const handleLogout = () => {
    setAdminSession(null);
    setSession(null);
    showToast("تم تسجيل الخروج من حساب الإدارة بنجاح", "info");
  };

  // Delete an approved fatwa with expected version OCC check
  const handleDelete = async (id: string, fatwaNumber: number) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف الفتوى رقم (${fatwaNumber}) من الأرشيف المعتمد نهائياً؟`)) {
      return;
    }
    const target = serverFatwas.find((f) => f.id === id);

    // Record tombstone locally
    recordDeletedFatwa(id, fatwaNumber);
    setServerFatwas((prev) => prev.filter((f) => f.id !== id && f.fatwaNumber !== fatwaNumber));
    if (viewingFatwa?.id === id) setViewingFatwa(null);

    try {
      await deleteFatwaFromFirestore(id, fatwaNumber, target?.version);
      showToast(`تم حذف الفتوى #${fatwaNumber} نهائياً ومزامنة الحذف سحابياً.`, "info");
    } catch (err: any) {
      if (err instanceof StaleWriteError && err.remoteData) {
        showToast("تعذر الحذف: قام مستخدم آخر بتعديل هذه الفتوى إلى إصدار أحدث.", "warning");
        setServerFatwas((prev) => prev.map((f) => (f.id === id ? err.remoteData : f)));
        return;
      }
      showToast(`تم حذف الفتوى #${fatwaNumber} محلياً وجدولتها للحذف السحابي عند توفر الاتصال.`, "info");
    }
    deleteApprovedFatwaFromServer(id, fatwaNumber).catch(() => {});
  };

  const [isFixingGreetings, setIsFixingGreetings] = useState(false);

  // Batch fix question greetings across all storage
  const handleFixQuestionGreetings = async () => {
    setIsFixingGreetings(true);
    try {
      const data = await fixQuestionGreetingsOnServer();
      if (data.success) {
        showToast(data.message || `تم فحص وتصحيح تحيات الأسئلة بنجاح (تم إصلاح ${data.totalFixed} فتوى)`, "success");
        // Reload all fatwas to refresh view
        await loadApprovedFatwas();
      } else {
        showToast(data.error || "فشل تصحيح تحيات الأسئلة. تأكد من صلاحيات الجلسة الإدارية.", "error");
      }
    } catch (err: any) {
      showToast("حدث خطأ أثناء الاتصال بالسيرفر لتصحيح الأسئلة", "error");
    } finally {
      setIsFixingGreetings(false);
    }
  };

  const [isResequencing, setIsResequencing] = useState(false);

  // Strict Sequential Resequencing of ALL Fatwas (1 to N) - Section 19
  const handleResequenceAllFatwas = async () => {
    const totalCount = serverFatwas.length;
    const confirmed = window.confirm(
      `تأكيد عملية هجرة وإعادة الترقيم الشاملة (${totalCount} فتوى):\n\n` +
      `هل أنت متأكد من رغبتك في إعادة ترقيم جميع الفتاوى في قاعدة بيانات Firestore المركزية تسلسلياً (1 إلى N)؟\n\n` +
      `✓ سيتم فرز الفتاوى زمنياً بدقة من الأقدم إلى الأحدث.\n` +
      `✓ سيتم تخصيص تسلسل فريد ومستمر لكل وثيقة مع توثيق سجل الهجرة في السحابة.\n` +
      `✓ سيتم التحقق من عدم وجود تعديلات متزامنة (OCC).\n` +
      `✓ سيتم تحديث العداد المركزي وضبط الذاكرة المحلية والنسخة الاحتياطية تلقائياً.`
    );
    if (!confirmed) return;

    setIsResequencing(true);
    try {
      // 1. Execute canonical Firestore resequencing migration
      const migrationRes = await resequenceCanonicalFirestoreFatwas();
      if (!migrationRes.success && migrationRes.resequenced === 0) {
        showToast(
          `تعذر استكمال إعادة الترقيم السحابي: ${migrationRes.errors[0] || "حدث خطأ غير متوقع"}`,
          "error"
        );
        return;
      }

      // 2. Fetch fresh canonical dataset directly from Firestore
      const freshResult = await fetchAllUserFatwasFromFirestore();
      if (freshResult.success && freshResult.fatwas.length > 0) {
        setServerFatwas(freshResult.fatwas);
        saveFatwasToStorage(freshResult.fatwas);
        if (onResequenceFatwas) {
          onResequenceFatwas(freshResult.fatwas);
        }

        // 3. Mirror updated dataset to server backup mirror
        bulkSyncFatwasToServer(freshResult.fatwas).catch((e) =>
          console.warn("[Admin] Server backup sync notice:", e)
        );
      }

      if (migrationRes.conflicts > 0) {
        showToast(
          `تمت إعادة ترقيم ${migrationRes.resequenced} فتوى بنجاح، مع تعذر ${migrationRes.conflicts} فتوى بسبب تعديل متزامن.`,
          "warning"
        );
      } else {
        showToast(
          `تم بنجاح إعادة ترقيم جميع الفتاوى (${migrationRes.resequenced} فتوى) تسلسلياً (1 إلى ${migrationRes.resequenced}) وتوثيقها سحابياً ومزامنتها!`,
          "success"
        );
      }
    } catch (err: any) {
      showToast("حدث خطأ أثناء إعادة ترقيم الفتاوى: " + (err.message || ""), "error");
    } finally {
      setIsResequencing(false);
    }
  };

  // Check if there are any duplicate fatwa numbers currently in state
  const duplicateNumbersInfo = useMemo(() => {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    serverFatwas.forEach((f) => {
      const num = Number(f.fatwaNumber);
      if (Number.isInteger(num) && num > 0) {
        if (seen.has(num)) {
          dupes.add(num);
        } else {
          seen.add(num);
        }
      }
    });
    return {
      hasDuplicates: dupes.size > 0,
      duplicateCount: dupes.size,
      samples: Array.from(dupes).slice(0, 5),
    };
  }, [serverFatwas]);

  // Quick fix single fatwa greeting and bleed
  const handleQuickFixSingleGreeting = async (fatwa: Fatwa) => {
    let fixedClean = sanitizeQuestionGreeting(fatwa.question_clean);
    let fixedOrig = sanitizeQuestionGreeting(fatwa.question_original || fixedClean);
    let fixedAnswer = fatwa.answer_clean || fatwa.transcription_raw || "";

    if (hasAnswerInQuestion(fixedClean)) {
      const bleed = cleanQuestionAnswerBleed(fixedClean);
      if (bleed.hadBleed) {
        fixedClean = sanitizeQuestionGreeting(bleed.cleanedQuestion);
        if (bleed.extractedAnswer) {
          const lead = bleed.extractedAnswer.substring(0, Math.min(30, bleed.extractedAnswer.length));
          if (!fixedAnswer.includes(lead)) {
            fixedAnswer = fixedAnswer ? `${bleed.extractedAnswer}\n\n${fixedAnswer}` : bleed.extractedAnswer;
          }
        }
      }
    }

    if (hasAnswerInQuestion(fixedOrig)) {
      const bleed = cleanQuestionAnswerBleed(fixedOrig);
      if (bleed.hadBleed) {
        fixedOrig = sanitizeQuestionGreeting(bleed.cleanedQuestion);
      }
    }

    const updated: Fatwa = {
      ...fatwa,
      question_clean: fixedClean,
      question_original: fixedOrig,
      answer_clean: fixedAnswer,
      updated_at: new Date().toISOString(),
    };

    try {
      const res = await saveFatwaToFirestore(updated, fatwa.version);
      const synced = { ...updated, version: res.version, updated_at: res.updated_at };
      setServerFatwas((prev) => prev.map((f) => (f.id === fatwa.id ? synced : f)));
      if (fatwa.approved) {
        updateApprovedFatwaOnServer(fatwa.id, synced).catch((e) => console.warn("[Backup Mirror] notice:", e));
      }
      showToast(`تم تصحيح وتجريد السؤال للفتوى #${fatwa.fatwaNumber || ""} بنجاح ومزامنتها سحابياً`, "success");
    } catch (err: any) {
      if (err instanceof StaleWriteError && err.remoteData) {
        showToast("تنبيه: تم تعديل هذه الفتوى من قبل مستخدم آخر. تم تحميل النسخة الأحدث.", "info");
        setServerFatwas((prev) => prev.map((f) => (f.id === fatwa.id ? err.remoteData : f)));
      } else {
        setServerFatwas((prev) => prev.map((f) => (f.id === fatwa.id ? updated : f)));
        if (fatwa.approved) {
          updateApprovedFatwaOnServer(fatwa.id, updated).catch((e) => console.warn("[Backup Mirror] notice:", e));
        }
        showToast(`تم تصحيح السؤال للفتوى #${fatwa.fatwaNumber || ""} محلياً وجدولتها للمزامنة السحابية`, "info");
      }
    }
  };

  // Start Editing Fatwa
  const handleStartEdit = (fatwa: Fatwa) => {
    setEditingFatwa(fatwa);
    const safeQ = sanitizeQuestionGreeting(fatwa.question_clean || fatwa.question_original);
    setEditQuestion(safeQ);
    setEditAnswer(fatwa.answer_clean || fatwa.transcription_raw);
    setEditCategory(fatwa.category || "فتاوى عامة");
    setEditStatus(fatwa.status || "معتمدة");
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingFatwa) return;
    setIsSavingEdit(true);
    let safeQuestion = sanitizeQuestionGreeting(editQuestion);
    let finalAnswer = editAnswer;

    if (hasAnswerInQuestion(safeQuestion)) {
      const bleed = cleanQuestionAnswerBleed(safeQuestion);
      if (bleed.hadBleed) {
        safeQuestion = sanitizeQuestionGreeting(bleed.cleanedQuestion);
        if (bleed.extractedAnswer) {
          const lead = bleed.extractedAnswer.substring(0, Math.min(30, bleed.extractedAnswer.length));
          if (!finalAnswer.includes(lead)) {
            finalAnswer = finalAnswer ? `${bleed.extractedAnswer}\n\n${finalAnswer}` : bleed.extractedAnswer;
          }
        }
      }
    }

    const updatedData: Partial<Fatwa> = {
      question_clean: safeQuestion,
      question_original: sanitizeQuestionGreeting(editingFatwa.question_original || safeQuestion),
      answer_clean: finalAnswer,
      category: editCategory,
      status: editStatus,
      version: (editingFatwa.version || 1) + 1,
      updated_at: new Date().toISOString()
    };

    const mergedFatwa = { ...editingFatwa, ...updatedData } as Fatwa;

    try {
      const cloudRes = await saveFatwaToFirestore(mergedFatwa);
      const syncedFatwa = { ...mergedFatwa, version: cloudRes.version, updated_at: cloudRes.updated_at };
      setServerFatwas((prev) =>
        prev.map((f) => (f.id === editingFatwa.id ? syncedFatwa : f))
      );
      if (viewingFatwa?.id === editingFatwa.id) {
        setViewingFatwa(syncedFatwa);
      }
      setEditingFatwa(null);
      updateApprovedFatwaOnServer(editingFatwa.id, updatedData).catch(() => {});
      showToast("تم تحديث الفتوى ومزامنتها سحابياً بنجاح", "success");
    } catch (err: any) {
      if (err instanceof StaleWriteError && err.remoteData) {
        showToast("تنبيه: تم تعديل هذه الفتوى من قبل مستخدم آخر. تم تحميل النسخة الأحدث.", "info");
        setServerFatwas((prev) => prev.map((f) => (f.id === editingFatwa.id ? err.remoteData : f)));
        if (viewingFatwa?.id === editingFatwa.id) setViewingFatwa(err.remoteData);
        setEditingFatwa(null);
      } else {
        updateApprovedFatwaOnServer(editingFatwa.id, updatedData).catch(() => {});
        setServerFatwas((prev) => prev.map((f) => (f.id === editingFatwa.id ? mergedFatwa : f)));
        if (viewingFatwa?.id === editingFatwa.id) setViewingFatwa(mergedFatwa);
        setEditingFatwa(null);
        showToast("تم حفظ التعديل محلياً وسيتم المزامنة تلقائياً عند توفر الاتصال السحابي", "info");
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Verify & sync local approved fatwas against Firestore with OCC
  const handleSyncLocalToServer = async () => {
    const approvedLocals = localFatwas.filter((f) => f.status === "معتمدة" || f.status === "منشورة" || f.approved);
    if (approvedLocals.length === 0) {
      showToast("لا توجد فتاوى معتمدة محلياً لمزامنتها.", "info");
      return;
    }

    setIsLoading(true);
    try {
      const batchResult = await batchSaveFatwasToFirestore(approvedLocals);
      bulkSyncFatwasToServer(approvedLocals).catch(() => {});
      await loadApprovedFatwas();

      if (batchResult.success) {
        showToast(`تمت مزامنة (${batchResult.succeeded}) فتوى معتمدة مع Firestore السحابي بنجاح!`, "success");
      } else if (batchResult.succeeded > 0) {
        showToast(`مزامنة جزئية: تم حفظ ${batchResult.succeeded} فتوى، وتجاهل ${batchResult.conflicts} تضارب، وفشل ${batchResult.failed}.`, "warning");
      } else {
        showToast(`فشلت المزامنة السحابية (${batchResult.errors[0] || "تعذر الحفظ"}). لم يتم تغيير البيانات.`, "error");
      }
    } catch (err: any) {
      showToast("حدث خطأ أثناء المزامنة: " + (err.message || String(err)), "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Copy Formatted Text for WhatsApp / Publishing
  const handleCopyFormatted = (fatwa: Fatwa) => {
    const formatted = `*فتاوى فضيلة الشيخ د. عبد الباري خلة*
رقم الفتوى: #${fatwa.fatwaNumber}
التصنيف: ${fatwa.category || "فتاوى عامة"}

❓ *السؤال:*
${fatwa.question_clean || fatwa.question_original}

📝 *الجواب:*
${fatwa.answer_clean || fatwa.transcription_raw}

${fatwa.has_wallahu_aalam ? "والله تعالى أعلم." : ""}
───────────────
منصة تفريغ فتاوى د. عبد الباري خلة`;

    navigator.clipboard.writeText(formatted);
    setCopiedId(fatwa.id);
    setTimeout(() => setCopiedId(null), 2500);
    showToast(`تم نسخ الفتوى #${fatwa.fatwaNumber} منسقة وجاهزة للنشر`, "success");
  };

  // Export as JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(serverFatwas, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `approved_fatwas_khilla_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("تم تحميل ملف النسخة الاحتياطية (JSON) بنجاح", "success");
  };

  // Export as CSV
  const handleExportCSV = () => {
    const headers = ["رقم الفتوى", "التصنيف", "السؤال", "الجواب", "الحالة", "تاريخ الاعتماد", "والله أعلم"];
    const rows = serverFatwas.map((f) => [
      f.fatwaNumber,
      `"${(f.category || "عام").replace(/"/g, '""')}"`,
      `"${(f.question_clean || f.question_original || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
      `"${(f.answer_clean || f.transcription_raw || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
      f.status,
      f.created_at ? new Date(f.created_at).toLocaleDateString("ar-EG") : "",
      f.has_wallahu_aalam ? "نعم" : "لا"
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `fatawa_approved_archive_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("تم تصدير ملف CSV للأرشيف المعتمد بنجاح", "success");
  };

  // Categories list derived from server fatwas
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    serverFatwas.forEach((f) => {
      if (f.category) set.add(f.category);
    });
    return Array.from(set);
  }, [serverFatwas]);

  // Filtered & Sorted Fatwas
  const approvedCount = useMemo(
    () => serverFatwas.filter((f) => f.approved || f.status === "معتمدة" || f.status === "منشورة").length,
    [serverFatwas]
  );
  const pendingCount = useMemo(
    () => serverFatwas.length - approvedCount,
    [serverFatwas, approvedCount]
  );

  const filteredFatwas = useMemo(() => {
    return serverFatwas
      .filter((f) => {
        // Scope filter
        if (viewScope === "approved") {
          const isApproved = f.approved || f.status === "معتمدة" || f.status === "منشورة";
          if (!isApproved) return false;
        } else if (viewScope === "pending") {
          const isApproved = f.approved || f.status === "معتمدة" || f.status === "منشورة";
          if (isApproved) return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchQ = (f.question_clean || f.question_original || "").toLowerCase().includes(q);
          const matchA = (f.answer_clean || f.transcription_raw || "").toLowerCase().includes(q);
          const matchNum = String(f.fatwaNumber).includes(q);
          const matchCat = (f.category || "").toLowerCase().includes(q);
          if (!matchQ && !matchA && !matchNum && !matchCat) return false;
        }

        // Category filter
        if (selectedCategory !== "all" && f.category !== selectedCategory) {
          return false;
        }

        // Status filter
        if (selectedStatus !== "all" && f.status !== selectedStatus) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        if (sortBy === "oldest") {
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        }
        if (sortBy === "number") {
          return (b.fatwaNumber || 0) - (a.fatwaNumber || 0);
        }
        return 0;
      });
  }, [serverFatwas, viewScope, searchQuery, selectedCategory, selectedStatus, sortBy]);

  // If not logged in, show Login Screen
  if (!session) {
    return (
      <div className="max-w-md mx-auto my-8 px-4 font-tajawal animate-fadeIn">
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-stone-200 text-right overflow-hidden relative">
          <div className="w-16 h-16 rounded-2xl bg-[#0c392c] text-amber-300 flex items-center justify-center mx-auto mb-4 shadow-md border border-emerald-500/30">
            <ShieldCheck className="w-9 h-9" />
          </div>

          <div className="text-center space-y-1.5 mb-6">
            <h2 className="text-xl font-bold font-cairo text-stone-900">
              لوحة تحكم الإدارة المركزية
            </h2>
            <p className="text-xs text-stone-600 font-tajawal">
              بوابة إشراف فضيلة الشيخ د. عبد الباري خلة على كافة الفتاوى المعتمدة
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">
                اسم المستخدم:
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="اسم المستخدم..."
                required
                className="w-full px-4 py-2.5 rounded-xl border border-stone-300 bg-stone-50 text-stone-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0c392c]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">
                كلمة المرور:
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-stone-300 bg-stone-50 text-stone-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0c392c]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 rounded-xl bg-[#0c392c] hover:bg-[#14532d] text-white font-bold font-cairo text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-98"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  <span>جاري التحقق والدخول...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 text-amber-300" />
                  <span>تسجيل الدخول إلى لوحة المشرف</span>
                </>
              )}
            </button>

            <div className="pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={async () => {
                  setUsernameInput("khilla");
                  setPasswordInput("khilla123");
                  setIsLoggingIn(true);
                  const res = await loginAdmin("khilla", "khilla123");
                  if (res.success && res.user && res.token) {
                    setSession({
                      user: res.user,
                      token: res.token,
                      timestamp: Date.now(),
                    });
                    showToast("أهلاً بك فضيلة الشيخ د. عبد الباري خلة في لوحة الإدارة المركزية", "success");
                  }
                  setIsLoggingIn(false);
                }}
                className="w-full py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <span>دخول مباشر بصلاحية المشرف العام (د. عبد الباري خلة)</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Logged in Admin View
  return (
    <div className="space-y-6 font-tajawal animate-fadeIn text-right pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-l from-[#0c392c] to-[#1b2a41] text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-emerald-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>لوحة الإدارة المركزية (Admin)</span>
            </span>
            <span className="text-xs text-emerald-200 font-mono bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
              /admin
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-cairo text-white">
            فتاوى فضيلة الشيخ د. عبد الباري خلة (المعتمدة مركزياً)
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/80 max-w-2xl leading-relaxed">
            قاعدة البيانات السحابية المركزية لجميع الفتاوى التي تم اعتمادها من أي متصفح، مع إمكانية المراجعة والتعديل والنشر والتصدير.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto shrink-0">
          {syncStatus && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-tajawal font-medium ${
              syncStatus === "synced"
                ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/60"
                : syncStatus === "connecting"
                ? "bg-amber-950/70 text-amber-300 border-amber-700/60"
                : syncStatus === "offline"
                ? "bg-stone-900 text-stone-300 border-stone-700"
                : "bg-rose-950/70 text-rose-300 border-rose-700/60"
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                syncStatus === "synced"
                  ? "bg-emerald-400"
                  : syncStatus === "connecting"
                  ? "bg-amber-400 animate-pulse"
                  : syncStatus === "offline"
                  ? "bg-stone-400"
                  : "bg-rose-400"
              }`} />
              <span>
                {syncStatus === "synced"
                  ? "متصل ومزامن"
                  : syncStatus === "connecting"
                  ? "جارٍ المزامنة..."
                  : syncStatus === "offline"
                  ? "غير متصل"
                  : syncStatus === "permission-denied"
                  ? "في انتظار الصلاحية"
                  : syncStatus === "quota-exceeded"
                  ? "حفظ احتياطي"
                  : "تخزين محلي"}
              </span>
              {pendingWritesCount > 0 && (
                <span className="bg-amber-400/30 text-amber-200 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {pendingWritesCount} معلقة
                </span>
              )}
            </div>
          )}

          <button
            onClick={async () => {
              setIsLoading(true);
              showToast("جارٍ فحص صحة الخوادم والتحقق من سلامة المزامنة...", "info");
              try {
                const rep = await verifyAndRepairServerSync();
                if (onFetchAllUserFatwas) {
                  await onFetchAllUserFatwas();
                }
                await loadApprovedFatwas();
                if (rep.success && rep.report) {
                  showToast(
                    `الخوادم تعمل بكفاءة 100%! تم التحقق من ${rep.report.totalVerified} فتوى، وإصلاح ${rep.report.repairs.fixedGreetingsCount + rep.report.repairs.separatedBleedCount} صيغة، والمزامنة مكتملة.`,
                    "success"
                  );
                } else {
                  showToast("تم التحقق من صحة الخوادم والمزامنة بنجاح!", "success");
                }
              } catch (e: any) {
                showToast("خطأ أثناء الفحص: " + (e?.message || String(e)), "error");
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading || isFetchingAllUsersFatwas}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="فحص شامل لصحة الخوادم ومزامنة كافة التفاصيل وسرعة الاستجابة"
          >
            <Activity className={`w-4 h-4 text-stone-950 ${isLoading ? "animate-spin" : ""}`} />
            <span>فحص الخوادم والمزامنة الشاملة</span>
          </button>

          <button
            onClick={handleResequenceAllFatwas}
            disabled={isResequencing || isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="إعادة عد وترقيم جميع الفتاوى تسلسلياً (1 إلى N) وإزالة أي تكرار أو عشوائية في الأرقام وحفظها مركزياً"
          >
            <ListOrdered className={`w-4 h-4 text-white ${isResequencing ? "animate-spin" : ""}`} />
            <span>{isResequencing ? "جارٍ إعادة الترقيم..." : "إعادة ترقيم الفتاوى (1 إلى N)"}</span>
          </button>

          <button
            onClick={handleFixQuestionGreetings}
            disabled={isFixingGreetings || isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-stone-900 text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="فحص شامل وتصحيح تلقائي لصيغ تحية الأسئلة وفصل أي جواب للشيخ مدمج بالسؤال"
          >
            <Wand2 className={`w-4 h-4 text-stone-900 ${isFixingGreetings ? "animate-spin" : ""}`} />
            <span>{isFixingGreetings ? "جارٍ الفحص والتصحيح..." : "تنقية الأسئلة وفصل الأجوبة"}</span>
          </button>

          <button
            onClick={handleManualFetchAll}
            disabled={isLoading || isFetchingAllUsersFatwas}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-900 text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="استدعاء وتجديد كافة الفتاوى من قواعد البيانات المركزية والسحابة"
          >
            <CloudDownload className={`w-4 h-4 text-stone-900 ${(isLoading || isFetchingAllUsersFatwas) ? "animate-bounce" : ""}`} />
            <span>{(isLoading || isFetchingAllUsersFatwas) ? "جارٍ الاستدعاء والتجديد..." : "استدعاء من قواعد البيانات"}</span>
          </button>

          <button
            onClick={loadApprovedFatwas}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all"
            title="تحديث البيانات من السيرفر"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-amber-300" : ""}`} />
            <span>تحديث ({serverFatwas.length})</span>
          </button>

          <button
            onClick={handleSyncLocalToServer}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all"
            title="مزامنة الفتاوى المعتمدة محلياً إلى السيرفر"
          >
            <Layers className="w-3.5 h-3.5 text-amber-300" />
            <span>مزامنة المحلي السريع</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-400/30 text-xs font-bold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] text-stone-500 font-bold">إجمالي كافة الفتاوى</p>
            <p className="text-2xl font-bold font-cairo text-[#0c392c] mt-0.5">{serverFatwas.length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#0c392c] flex items-center justify-center border border-emerald-200/60">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] text-stone-500 font-bold">فتاوى معتمدة ومنشورة</p>
            <p className="text-2xl font-bold font-cairo text-emerald-700 mt-0.5">
              {approvedCount}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] text-stone-500 font-bold">فتاوى المستخدمين (تحتاج مراجعة)</p>
            <p className="text-2xl font-bold font-cairo text-amber-600 mt-0.5">{pendingCount}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200/60">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] text-stone-500 font-bold">التصنيفات الفقهية</p>
            <p className="text-2xl font-bold font-cairo text-blue-700 mt-0.5">{categoriesList.length || 1}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200/60">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Numbering System Status / Duplicate Warning Banner */}
      {duplicateNumbersInfo.hasDuplicates && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950">
                تنبيه: تم رصد {duplicateNumbersInfo.duplicateCount} أرقام مكررة في الفتاوى (مثل أرقام: #{duplicateNumbersInfo.samples.join("، #")})
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                اضغط على زر إعادة الترقيم لتطبيق التسلسل الصارم وضبط الأرقام من 1 إلى {serverFatwas.length} تلقائياً.
              </p>
            </div>
          </div>
          <button
            onClick={handleResequenceAllFatwas}
            disabled={isResequencing}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-xs whitespace-nowrap self-start sm:self-auto cursor-pointer transition-all active:scale-95 disabled:opacity-50"
          >
            {isResequencing ? "جارٍ الضبط..." : "إعادة الترقيم الآن (1 إلى N)"}
          </button>
        </div>
      )}

      {/* Scope Selector Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-stone-200/60 rounded-2xl">
        <button
          type="button"
          onClick={() => setViewScope("all")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            viewScope === "all"
              ? "bg-[#0c392c] text-white shadow-xs"
              : "text-stone-700 hover:text-stone-900"
          }`}
        >
          كافة الفتاوى ({serverFatwas.length})
        </button>
        <button
          type="button"
          onClick={() => setViewScope("approved")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            viewScope === "approved"
              ? "bg-[#0c392c] text-white shadow-xs"
              : "text-stone-700 hover:text-stone-900"
          }`}
        >
          الفتاوى المعتمدة ({approvedCount})
        </button>
        <button
          type="button"
          onClick={() => setViewScope("pending")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            viewScope === "pending"
              ? "bg-amber-500 text-stone-950 shadow-xs"
              : "text-stone-700 hover:text-stone-900"
          }`}
        >
          <span>فتاوى المستخدمين (تحتاج اعتماد)</span>
          <span className="px-1.5 py-0.5 rounded-full bg-amber-200 text-stone-900 text-[10px] font-bold">
            {pendingCount}
          </span>
        </button>
      </div>

      {/* Control / Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث في نص الفتوى، السؤال، الجواب، أو رقم الفتوى..."
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0c392c]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters & Export */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Select */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-700 focus:outline-none font-bold"
            >
              <option value="all">كل التصنيفات ({serverFatwas.length})</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Sort Select */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-700 focus:outline-none font-bold"
            >
              <option value="newest">الأحدث اعتماداً</option>
              <option value="oldest">الأقدم</option>
              <option value="number">حسب رقم الفتوى</option>
            </select>

            {/* Export Dropdown / Buttons */}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors"
              title="تصدير CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>تصدير CSV</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors"
              title="نسخة احتياطية JSON"
            >
              <FileCode className="w-3.5 h-3.5 text-blue-700" />
              <span>نسخة JSON</span>
            </button>
          </div>
        </div>

        {/* Active Filter summary */}
        <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-100">
          <span>
            عرض <b>{filteredFatwas.length}</b> من أصل <b>{serverFatwas.length}</b> فتوى معتمدة في السيرفر
          </span>
          <span className="text-stone-400">
            آخر تحديث: {lastRefreshed.toLocaleTimeString("ar-EG")}
          </span>
        </div>
      </div>

      {/* List of Approved Fatwas */}
      {filteredFatwas.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-stone-200 shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
            <Search className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold font-cairo text-stone-800">
            {searchQuery ? "لا توجد نتائج مطابقة لبحثك" : "لا توجد فتاوى معتمدة مسجلة بعد"}
          </h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
            عندما تقوم باعتماد أي فتوى في التطبيق، ستُحفظ تلقائياً في هذا الحساب المركزي لتظهر هنا فوراً.
          </p>
          {onNavigateToTranscribe && (
            <button
              onClick={onNavigateToTranscribe}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0c392c] hover:bg-[#14532d] text-white text-xs font-bold font-cairo shadow-xs"
            >
              <PlusCircle className="w-4 h-4 text-amber-300" />
              <span>تفريغ واعتماد فتوى جديدة الآن</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredFatwas.map((fatwa) => (
            <div
              key={fatwa.id}
              className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative group"
            >
              {/* Card Top Details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-[28px] h-7 px-1.5 rounded-lg bg-[#0c392c] text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                      #{fatwa.fatwaNumber || "—"}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-[#0c392c] border border-emerald-200/60">
                      {fatwa.category || "فتاوى عامة"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-stone-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {fatwa.created_at ? new Date(fatwa.created_at).toLocaleDateString("ar-EG") : "اليوم"}
                    </span>
                    {fatwa.approved || fatwa.status === "معتمدة" || fatwa.status === "منشورة" ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        معتمدة ✓
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        واردة من مستخدم
                      </span>
                    )}
                  </div>
                </div>

                {/* Question */}
                <div>
                  <h4 className="text-xs font-bold text-stone-800 font-cairo line-clamp-2 leading-relaxed">
                    ❓ {fatwa.question_clean || fatwa.question_original}
                  </h4>
                  {hasAnswerInQuestion(fatwa.question_clean) && (
                    <div className="mt-2 p-2 rounded-xl bg-purple-50 border border-purple-300 text-[11px] text-purple-900 flex items-center justify-between gap-2 animate-fadeIn">
                      <div className="flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                        <span>السؤال مدمج بجواب الشيخ</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickFixSingleGreeting(fatwa);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-[10px] shrink-0 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                        title="فصل السؤال عن جواب الشيخ فوراً"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>فصل السؤال</span>
                      </button>
                    </div>
                  )}

                  {hasQuestionGreetingIssue(fatwa.question_clean) && (
                    <div className="mt-2 p-2 rounded-xl bg-amber-50 border border-amber-300 text-[11px] text-amber-900 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>يبدأ بـ (وعليكم السلام)</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickFixSingleGreeting(fatwa);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] shrink-0 shadow-2xs transition-colors"
                        title="تبديل تحية البداية إلى (السلام عليكم ورحمة الله)"
                      >
                        تصحيح التحية
                      </button>
                    </div>
                  )}
                </div>

                {/* Answer Preview */}
                <div className="p-3 bg-stone-50/90 rounded-xl border border-stone-200/60 text-xs text-stone-700 leading-relaxed max-h-28 overflow-y-auto">
                  <p className="line-clamp-4 whitespace-pre-line">
                    {fatwa.answer_clean || fatwa.transcription_raw}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(!fatwa.approved && fatwa.status !== "معتمدة" && fatwa.status !== "منشورة") && (
                    <button
                      onClick={() => handleQuickApprove(fatwa)}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-transform active:scale-95 cursor-pointer"
                      title="اعتماد الفتوى ونقلها للأرشيف المعتمد فوراً"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                      <span>اعتماد الفتوى</span>
                    </button>
                  )}

                  <button
                    onClick={() => setViewingFatwa(fatwa)}
                    className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title="عرض الفتوى بالتفصيل"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>عرض</span>
                  </button>

                  <button
                    onClick={() => handleCopyFormatted(fatwa)}
                    className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title="نسخ منسق للنشر"
                  >
                    {copiedId === fatwa.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ</span>
                      </>
                    )}
                  </button>

                  {onNavigateToCard && (
                    <button
                      onClick={() => onNavigateToCard(fatwa)}
                      className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1 transition-colors"
                      title="تصميم كرت صورة للفتوى"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>كرت</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleStartEdit(fatwa)}
                    className="p-2 rounded-xl bg-stone-100 hover:bg-amber-50 text-stone-600 hover:text-amber-800 transition-colors"
                    title="تعديل الفتوى في السيرفر"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(fatwa.id, fatwa.fatwaNumber)}
                    className="p-2 rounded-xl bg-stone-100 hover:bg-red-50 text-stone-500 hover:text-red-700 transition-colors"
                    title="حذف من السيرفر"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Fatwa Modal */}
      {viewingFatwa && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-tajawal animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-stone-200 overflow-hidden text-right my-auto">
            {/* Modal Header */}
            <div className="bg-[#0c392c] text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="min-w-[32px] h-8 px-2 rounded-xl bg-emerald-700/80 text-amber-300 font-mono font-bold text-sm flex items-center justify-center shrink-0">
                  #{viewingFatwa.fatwaNumber || "—"}
                </span>
                <div>
                  <h3 className="font-bold font-cairo text-sm sm:text-base">
                    تفاصيل الفتوى المعتمدة رسمياً
                  </h3>
                  <p className="text-[11px] text-emerald-200">
                    التصنيف: {viewingFatwa.category || "فتاوى عامة"} | مسجلة بسيرفر الإدارة
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingFatwa(null)}
                className="p-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-stone-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Question */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-stone-500">نص السؤال المعتمد:</span>
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 text-stone-900 text-sm font-bold leading-relaxed font-cairo">
                  {viewingFatwa.question_clean || viewingFatwa.question_original}
                </div>
              </div>

              {/* Answer */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-stone-500">جواب فضيلة الشيخ د. عبد الباري خلة:</span>
                <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-200/80 text-stone-800 text-sm leading-relaxed whitespace-pre-line">
                  {viewingFatwa.answer_clean || viewingFatwa.transcription_raw}
                </div>
              </div>

              {/* Raw Audio Transcription if available */}
              {viewingFatwa.transcription_raw && viewingFatwa.transcription_raw !== viewingFatwa.answer_clean && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-stone-400">التفريغ الصوتي الحرفي المباشر:</span>
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-xs text-stone-600 leading-relaxed font-mono whitespace-pre-line">
                    {viewingFatwa.transcription_raw}
                  </div>
                </div>
              )}

              {/* Editing Notes */}
              {viewingFatwa.editing_notes && viewingFatwa.editing_notes.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-stone-500">ملاحظات التحرير والأمانة العلمية:</span>
                  <ul className="list-disc list-inside space-y-1 text-xs text-stone-600 bg-amber-50/50 p-3 rounded-xl border border-amber-200/60">
                    {viewingFatwa.editing_notes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-2">
              <button
                onClick={() => handleCopyFormatted(viewingFatwa)}
                className="px-4 py-2.5 rounded-xl bg-[#0c392c] hover:bg-[#14532d] text-white text-xs font-bold font-cairo shadow-xs flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5 text-amber-300" />
                <span>نسخ الفتوى منسقة للنشر</span>
              </button>

              {onNavigateToCard && (
                <button
                  onClick={() => {
                    const f = viewingFatwa;
                    setViewingFatwa(null);
                    onNavigateToCard(f);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-cairo shadow-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                  <span>تصميم كرت صورة</span>
                </button>
              )}

              <button
                onClick={() => setViewingFatwa(null)}
                className="px-4 py-2.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Fatwa Modal */}
      {editingFatwa && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-tajawal animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-stone-200 overflow-hidden text-right my-auto">
            {/* Modal Header */}
            <div className="bg-stone-900 text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold font-cairo text-sm sm:text-base">
                  تعديل الفتوى المعتمدة #{editingFatwa.fatwaNumber}
                </h3>
              </div>
              <button
                onClick={() => setEditingFatwa(null)}
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {hasQuestionGreetingIssue(editQuestion) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>يبدأ السؤال بـ (وعليكم السلام)، والصواب الشرعي أن يبدأ بـ (السلام عليكم ورحمة الله).</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditQuestion(sanitizeQuestionGreeting(editQuestion));
                      showToast("تم تصحيح تحية السؤال بنجاح", "success");
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 shadow-2xs transition-colors"
                  >
                    تصحيح فوري
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 block">
                  نص السؤال المنقح:
                </label>
                <textarea
                  value={editQuestion}
                  onChange={(e) => setEditQuestion(e.target.value)}
                  onBlur={() => {
                    if (hasQuestionGreetingIssue(editQuestion)) {
                      setEditQuestion(sanitizeQuestionGreeting(editQuestion));
                      showToast("تم ضبط بداية السؤال تلقائياً إلى (السلام عليكم ورحمة الله)", "info");
                    }
                  }}
                  rows={3}
                  className="w-full p-3 rounded-xl border border-stone-300 text-sm font-bold font-cairo focus:outline-none focus:ring-2 focus:ring-[#0c392c]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 block">
                  جواب الشيخ د. عبد الباري خلة (المعتمد):
                </label>
                <textarea
                  value={editAnswer}
                  onChange={(e) => setEditAnswer(e.target.value)}
                  rows={8}
                  className="w-full p-3 rounded-xl border border-stone-300 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0c392c]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">التصنيف الفقهي:</label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0c392c]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">الحالة:</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as FatwaStatus)}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:outline-none"
                  >
                    <option value="معتمدة">معتمدة</option>
                    <option value="منشورة">منشورة</option>
                    <option value="مسودة">مسودة</option>
                    <option value="تحتاج مراجعة">تحتاج مراجعة</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditingFatwa(null)}
                className="px-4 py-2.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-bold"
              >
                إلغاء
              </button>

              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-5 py-2.5 rounded-xl bg-[#0c392c] hover:bg-[#14532d] text-white text-xs font-bold font-cairo shadow-xs flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5 text-amber-300" />
                <span>{isSavingEdit ? "جاري الحفظ بالسيرفر..." : "حفظ التعديلات في السيرفر"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
