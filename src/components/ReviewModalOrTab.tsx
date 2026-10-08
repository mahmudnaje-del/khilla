import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Share2,
  Bookmark,
  Check,
  SplitSquareVertical,
  Layers,
  Image as ImageIcon,
  Save,
  MessageSquare,
  ShieldCheck,
  HelpCircle,
  RotateCcw,
  PlusCircle,
  ArrowDown,
  ChevronRight,
  ChevronLeft,
  FileText,
  BookOpen,
  RefreshCw,
  Trash2,
  Globe,
  EyeOff,
  User,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Fatwa, FatwaStatus, CardTemplateSettings } from "../types";
import { computeWordDiff } from "../utils/diff";
import { ImageCardGenerator } from "./ImageCardGenerator";
import {
  sanitizeQuestionGreeting,
  hasQuestionGreetingIssue,
  hasAnswerInQuestion,
  cleanQuestionAnswerBleed,
  separateQuestionAndAnswer,
} from "../utils/greetingSanitizer";
import { isFatwaDeleted } from "../utils/storage";

interface ReviewModalOrTabProps {
  currentFatwa: Fatwa | null;
  fatwas?: Fatwa[];
  onSelectFatwa?: (fatwa: Fatwa) => void;
  onUpdateFatwa: (updated: Fatwa) => void;
  onNavigateToCard: () => void;
  onNavigateToTranscribe?: () => void;
  onNavigateToAdmin?: () => void;
  onNavigateToArchive?: () => void;
  onUpdateTemplateSettings?: (settings: CardTemplateSettings) => void;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onDeleteFatwa?: (id: string) => void;
  onFetchAllUserFatwas?: () => Promise<void> | void;
  isFetchingAllUsersFatwas?: boolean;
}

export const ReviewModalOrTab: React.FC<ReviewModalOrTabProps> = ({
  currentFatwa,
  fatwas = [],
  onSelectFatwa,
  onUpdateFatwa,
  onNavigateToCard,
  onNavigateToTranscribe,
  onNavigateToAdmin,
  onNavigateToArchive,
  onUpdateTemplateSettings,
  showToast,
  onDeleteFatwa,
  onFetchAllUserFatwas,
  isFetchingAllUsersFatwas = false,
}) => {
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [showDiffView, setShowDiffView] = useState(true);
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);

  const [questionOriginal, setQuestionOriginal] = useState(currentFatwa?.question_original || "");
  const [questionClean, setQuestionClean] = useState(currentFatwa?.question_clean || "");
  const [rawAnswer, setRawAnswer] = useState(currentFatwa?.transcription_raw || "");
  const [cleanAnswer, setCleanAnswer] = useState(currentFatwa?.answer_clean || "");
  const [category, setCategory] = useState(currentFatwa?.category || "فتاوى عامة");
  const [status, setStatus] = useState<FatwaStatus>(currentFatwa?.status || "تحتاج مراجعة");
  const [hasWallahuAalam, setHasWallahuAalam] = useState(currentFatwa?.has_wallahu_aalam ?? true);

  // Sequential queue calculations (excluding deleted fatwas)
  const pendingFatwas = fatwas.filter(
    (f) =>
      !isFatwaDeleted(f.id, f.fatwaNumber) &&
      (f.status === "تحتاج مراجعة" ||
        f.status === "مسودة" ||
        (!f.approved && f.status !== "معتمدة" && f.status !== "منشورة"))
  );
  // Exclude approved/published and deleted fatwas from the queue navigation logic
  const queueFatwas = fatwas.filter(
    (f) => !isFatwaDeleted(f.id, f.fatwaNumber) && f.status !== "معتمدة" && f.status !== "منشورة" && !f.approved
  );
  const currentIndex = currentFatwa ? queueFatwas.findIndex((f) => f.id === currentFatwa.id) : -1;
  const isNotInQueue = currentIndex === -1;
  const hasPrevious = currentIndex > 0 || (isNotInQueue && queueFatwas.length > 0);
  const hasNext = (currentIndex >= 0 && currentIndex < queueFatwas.length - 1) || (isNotInQueue && queueFatwas.length > 0);

  const currentPendingIndex = currentFatwa ? pendingFatwas.findIndex((f) => f.id === currentFatwa.id) : -1;

  const handleGoPrevious = () => {
    if (onSelectFatwa && queueFatwas.length > 0) {
      if (isNotInQueue) {
        onSelectFatwa(queueFatwas[queueFatwas.length - 1]);
      } else if (currentIndex > 0) {
        onSelectFatwa(queueFatwas[currentIndex - 1]);
      }
    }
  };

  const handleGoNext = () => {
    if (onSelectFatwa && queueFatwas.length > 0) {
      if (isNotInQueue) {
        onSelectFatwa(queueFatwas[0]);
      } else if (currentIndex >= 0 && currentIndex < queueFatwas.length - 1) {
        onSelectFatwa(queueFatwas[currentIndex + 1]);
      }
    }
  };

  // Sync state whenever currentFatwa changes
  useEffect(() => {
    if (currentFatwa) {
      const origQ = sanitizeQuestionGreeting(currentFatwa.question_original || "");
      const cleanQ = sanitizeQuestionGreeting(currentFatwa.question_clean || origQ);
      setQuestionOriginal(origQ);
      setQuestionClean(cleanQ);
      setRawAnswer(currentFatwa.transcription_raw || "");
      setCleanAnswer(currentFatwa.answer_clean || "");
      setCategory(currentFatwa.category || "فتاوى عامة");
      setStatus(currentFatwa.status || "تحتاج مراجعة");
      setHasWallahuAalam(currentFatwa.has_wallahu_aalam ?? true);
      setIsEditing(false);
    }
  }, [currentFatwa?.id, currentFatwa?.updated_at]);

  // Copy state feedbacks
  const [copiedQuestion, setCopiedQuestion] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedBoth, setCopiedBoth] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyText = (text: string, key: string, toastMessage?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2500);
    if (toastMessage) {
      showToast(toastMessage, "info");
    }
  };

  if (!currentFatwa) {
    if (queueFatwas.length > 0) {
      return (
        <div className="max-w-4xl mx-auto space-y-6 my-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-amber-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center border border-amber-300">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold font-cairo text-stone-900">
                    فتاوى قيد المراجعة المشتركة ({queueFatwas.length} فتوى)
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-500">
                    هذه الفتاوى مفرغة ومتزامنة حياً بين جميع المستخدمين لمراجعتها والتعاون في اعتمادها
                  </p>
                </div>
              </div>
              {onNavigateToTranscribe && (
                <button
                  onClick={onNavigateToTranscribe}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-cairo text-xs shadow-xs transition-all"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>تفريغ فتوى جديدة</span>
                </button>
              )}
            </div>

            <div className="mt-6 divide-y divide-stone-100">
              {queueFatwas.map((fatwa, idx) => (
                <div
                  key={fatwa.id || idx}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-stone-50/80 p-3 rounded-2xl transition-all"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-100 text-amber-900 border border-amber-200">
                        #{fatwa.fatwaNumber || "---"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
                        {fatwa.category || "فتاوى عامة"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/50">
                        {fatwa.status || "تحتاج مراجعة"}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-stone-800 line-clamp-2">
                      {fatwa.question_clean || fatwa.question_original || "بدون عنوان سؤال"}
                    </p>
                    <p className="text-xs text-stone-500 line-clamp-1">
                      {fatwa.answer_clean || fatwa.transcription_raw || "لا يوجد نص جواب"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectFatwa && onSelectFatwa(fatwa)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold font-cairo text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all shrink-0 active:scale-95"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>مراجعة وتدقيق هذه الفتوى</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-stone-200 shadow-xs max-w-xl mx-auto my-8 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto border border-amber-200/60">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold font-cairo text-stone-800">
          لا توجد فتاوى قيد المراجعة حالياً
        </h3>
        <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
          جميع الفتاوى الحالية معتمدة، أو يمكنك تفريغ تسجيل صوتي جديد أو استيراد ملف للمراجعة والاعتماد.
        </p>
        {onNavigateToTranscribe && (
          <div className="pt-3">
            <button
              onClick={onNavigateToTranscribe}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-cairo text-sm shadow-md transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>تفريغ فتوى جديدة الآن</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Calculate diffs
  const questionDiff = computeWordDiff(questionOriginal, questionClean);
  const answerDiff = computeWordDiff(rawAnswer, cleanAnswer);

  // Save changes
  const handleSave = (newStatus?: FatwaStatus) => {
    const finalStatus = newStatus || status;
    const isApproved = finalStatus === "معتمدة" || finalStatus === "منشورة";

    let safeOrigQ = sanitizeQuestionGreeting(questionOriginal);
    let safeCleanQ = sanitizeQuestionGreeting(questionClean || safeOrigQ);
    let finalCleanAnswer = cleanAnswer;

    if (hasAnswerInQuestion(safeCleanQ)) {
      const bleed = cleanQuestionAnswerBleed(safeCleanQ);
      if (bleed.hadBleed) {
        safeCleanQ = sanitizeQuestionGreeting(bleed.cleanedQuestion);
        if (bleed.extractedAnswer) {
          const lead = bleed.extractedAnswer.substring(0, Math.min(30, bleed.extractedAnswer.length));
          if (!finalCleanAnswer.includes(lead)) {
            finalCleanAnswer = finalCleanAnswer ? `${bleed.extractedAnswer}\n\n${finalCleanAnswer}` : bleed.extractedAnswer;
          }
        }
      }
    }

    if (hasAnswerInQuestion(safeOrigQ)) {
      const bleed = cleanQuestionAnswerBleed(safeOrigQ);
      if (bleed.hadBleed) {
        safeOrigQ = sanitizeQuestionGreeting(bleed.cleanedQuestion);
      }
    }

    const updated: Fatwa = {
      ...currentFatwa,
      question_original: safeOrigQ,
      question_clean: safeCleanQ,
      question_tashkeel: safeCleanQ,
      transcription_raw: rawAnswer,
      answer_clean: finalCleanAnswer,
      answer_tashkeel: finalCleanAnswer,
      category,
      status: finalStatus,
      has_wallahu_aalam: hasWallahuAalam,
      reviewed: true,
      approved: isApproved,
      updated_at: new Date().toISOString(),
    };

    onUpdateFatwa(updated);
    setIsEditing(false);

    if (isApproved) {
      showToast(`تم اعتماد الفتوى #${updated.fatwaNumber || ""} بنجاح وتم مزامنتها مع قاعدة البيانات السحابية`, "success");
    } else {
      showToast("تم حفظ تعديلات الفتوى بنجاح.", "success");
    }
  };

  // 1. Quick Approval
  const handleApprove = () => {
    if (!currentFatwa) return;
    setStatus("معتمدة");
    let safeOrigQ = sanitizeQuestionGreeting(questionOriginal);
    let safeCleanQ = sanitizeQuestionGreeting(questionClean || safeOrigQ);

    const updated: Fatwa = {
      ...currentFatwa,
      question_original: safeOrigQ,
      question_clean: safeCleanQ,
      transcription_raw: rawAnswer,
      answer_clean: cleanAnswer,
      category,
      status: "معتمدة",
      has_wallahu_aalam: hasWallahuAalam,
      reviewed: true,
      approved: true,
      isPublic: false,
      updated_at: new Date().toISOString(),
    };

    onUpdateFatwa(updated);
    setIsEditing(false);
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
    showToast(`تم اعتماد الفتوى #${updated.fatwaNumber || ""} بنجاح. يمكنك الآن نشرها في واجهة القراء`, "success");
  };

  // 2. Unapprove Fatwa (إلغاء الاعتماد)
  const handleUnapprove = () => {
    if (!currentFatwa) return;
    setStatus("تحتاج مراجعة");
    const updated: Fatwa = {
      ...currentFatwa,
      status: "تحتاج مراجعة",
      approved: false,
      isPublic: false,
      updated_at: new Date().toISOString(),
    };

    onUpdateFatwa(updated);
    setIsEditing(false);
    showToast(`تم إلغاء اعتماد الفتوى #${updated.fatwaNumber || ""} وإعادتها لحالة تحتاج مراجعة`, "info");
  };

  // 3. Publish to Readers Platform (نشر في واجهة القراء)
  const handlePublish = () => {
    if (!currentFatwa) return;
    setStatus("منشورة");
    let safeOrigQ = sanitizeQuestionGreeting(questionOriginal);
    let safeCleanQ = sanitizeQuestionGreeting(questionClean || safeOrigQ);

    const updated: Fatwa = {
      ...currentFatwa,
      question_original: safeOrigQ,
      question_clean: safeCleanQ,
      transcription_raw: rawAnswer,
      answer_clean: cleanAnswer,
      category,
      status: "منشورة",
      has_wallahu_aalam: hasWallahuAalam,
      reviewed: true,
      approved: true,
      isPublic: true,
      updated_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    };

    onUpdateFatwa(updated);
    setIsEditing(false);
    confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.6 },
    });
    showToast(`تم نشر الفتوى #${updated.fatwaNumber || ""} بنجاح وأصبحت معروضة في واجهة القراء بشكل لحظي 🌐`, "success");
  };

  // 4. Unpublish from Readers Platform (إلغاء النشر) - direct and responsive without window.confirm
  const handleUnpublish = () => {
    if (!currentFatwa) return;
    setStatus("معتمدة");
    const updated: Fatwa = {
      ...currentFatwa,
      status: "معتمدة",
      approved: true,
      isPublic: false,
      updated_at: new Date().toISOString(),
    };

    onUpdateFatwa(updated);
    setIsEditing(false);
    showToast(`تم إلغاء نشر الفتوى #${updated.fatwaNumber || ""} وسحبها من واجهة القراء مع بقائها معتمدة بالأرشيف 🚫`, "info");
  };

  // Copy helpers
  const copyToClipboard = (text: string, type: "question" | "answer" | "both") => {
    navigator.clipboard.writeText(text);
    if (type === "question") {
      setCopiedQuestion(true);
      setTimeout(() => setCopiedQuestion(false), 2000);
      showToast("تم نسخ السؤال إلى الحافظة", "info");
    } else if (type === "answer") {
      setCopiedAnswer(true);
      setTimeout(() => setCopiedAnswer(false), 2000);
      showToast("تم نسخ جواب الشيخ إلى الحافظة", "info");
    } else {
      setCopiedBoth(true);
      setTimeout(() => setCopiedBoth(false), 2000);
      showToast("تم نسخ الفتوى كاملة بتنسيق الواتساب", "success");
    }
  };

  const getFullFormattedText = () => {
    let out = `فتوى فضيلة الشيخ د. عبد الباري خلة\n`;
    out += `رقم الفتوى: #${currentFatwa.fatwaNumber || "---"}\n`;
    out += `----------------------------------------\n\n`;
    out += `📌 السؤال:\n${questionClean}\n\n`;
    out += `🎙️ جواب فضيلة الشيخ:\n${cleanAnswer}\n\n`;
    out += `----------------------------------------\n`;
    out += `مفرّغ فتاوى الشيخ د. عبد الباري خلة`;
    return out;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Sequential Review Navigation Toolbar (especially for Word imports & queue) */}
      {queueFatwas.length > 1 && (
        <div className="bg-[#0c392c] text-white rounded-2xl p-3 sm:p-4 border border-emerald-800/80 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 overflow-hidden">
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-amber-300 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div className="text-xs sm:text-sm font-bold font-cairo text-white flex items-center gap-1.5 flex-wrap">
                <span>تصفح الفتاوى بالترتيب:</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-800 text-amber-300 text-xs font-mono font-bold">
                  {currentIndex >= 0 ? currentIndex + 1 : "-"} من {queueFatwas.length}
                </span>
              </div>
            </div>
            {currentFatwa.tags?.includes("مستورد من Word") && (
              <span className="inline-flex sm:hidden items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] border border-amber-300/30">
                <FileText className="w-3 h-3" />
                <span>Word</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              disabled={!hasPrevious}
              onClick={handleGoPrevious}
              className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold font-cairo text-white flex items-center justify-center gap-1 border border-emerald-600/50 transition-all cursor-pointer"
              title="الفتوى السابقة"
            >
              <ChevronRight className="w-4 h-4 shrink-0" />
              <span>السابق</span>
            </button>

            <button
              type="button"
              disabled={!hasNext}
              onClick={handleGoNext}
              className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold font-cairo flex items-center justify-center gap-1 shadow-sm transition-all cursor-pointer"
              title="الفتوى التالية"
            >
              <span>التالي</span>
              <ChevronLeft className="w-4 h-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setShowQueueDrawer(!showQueueDrawer)}
              className={`w-full sm:w-auto px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold font-cairo flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                showQueueDrawer
                  ? "bg-amber-400 text-emerald-950 border-amber-300"
                  : "bg-emerald-900/90 hover:bg-emerald-800 text-amber-200 border-emerald-700/60"
              }`}
              title="عرض قائمة الفتاوى قيد المراجعة للجميع"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>فتاوى المراجعة ({queueFatwas.length})</span>
            </button>

            {onFetchAllUserFatwas && (
              <button
                type="button"
                onClick={() => onFetchAllUserFatwas()}
                disabled={isFetchingAllUsersFatwas}
                className="w-full sm:w-auto px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 disabled:opacity-50 text-[11px] sm:text-xs font-bold font-cairo flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                title="مزامنة ورفع فتاوى المراجعة والأرشيف مع السحابة والخادم"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-stone-950 shrink-0 ${isFetchingAllUsersFatwas ? "animate-spin" : ""}`} />
                <span>{isFetchingAllUsersFatwas ? "جارٍ الرفع..." : "مزامنة ورفع"}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Collapsible Collaborative Pending Review Drawer */}
      {showQueueDrawer && queueFatwas.length > 0 && (
        <div className="bg-amber-50/90 border-2 border-amber-300/80 rounded-2xl p-4 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold font-cairo text-sm">
              <Layers className="w-4 h-4 text-amber-700" />
              <span>قائمة الفتاوى المزامنة قيد المراجعة المشتركة ({queueFatwas.length} فتوى):</span>
            </div>
            <button
              type="button"
              onClick={() => setShowQueueDrawer(false)}
              className="text-amber-800 hover:text-amber-950 text-xs font-bold px-2 py-1 rounded-lg hover:bg-amber-200/50 transition-colors"
            >
              إغلاق القائمة ✕
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1">
            {queueFatwas.map((f) => {
              const isSelected = f.id === currentFatwa.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    if (onSelectFatwa) onSelectFatwa(f);
                    setShowQueueDrawer(false);
                  }}
                  className={`text-right p-3 rounded-xl border text-xs transition-all flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? "bg-emerald-700 text-white border-emerald-800 shadow-xs ring-2 ring-emerald-500/40"
                      : "bg-white hover:bg-stone-50 text-stone-800 border-amber-200/80 hover:border-amber-300 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                      isSelected ? "bg-emerald-800 text-amber-300" : "bg-amber-100 text-amber-900"
                    }`}>
                      #{f.fatwaNumber || "---"}
                    </span>
                    <span className={`text-[10px] ${isSelected ? "text-emerald-100" : "text-stone-500"}`}>
                      {f.status || "تحتاج مراجعة"}
                    </span>
                  </div>
                  <p className={`font-medium line-clamp-2 ${isSelected ? "text-white" : "text-stone-800"}`}>
                    {f.question_clean || f.question_original || "بدون عنوان سؤال"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Header bar of Review */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              فتوى #{currentFatwa.fatwaNumber}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                status === "منشورة" || (status === "معتمدة" && currentFatwa.approved !== false)
                  ? "bg-teal-600 text-white ring-2 ring-teal-400/30"
                  : status === "تحتاج مراجعة"
                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                  : "bg-stone-100 text-stone-700"
              }`}
            >
              {status === "منشورة" || (status === "معتمدة" && currentFatwa.approved !== false) ? (
                <>
                  <Globe className="w-3 h-3 text-amber-300" />
                  <span>معروضة في واجهة القراء 🌐</span>
                </>
              ) : (
                <span>غير منشورة (قيد المراجعة)</span>
              )}
            </span>
            {currentFatwa.tags?.includes("مستورد من Word") && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                <FileText className="w-3 h-3 text-amber-700" />
                <span>مستوردة من Word</span>
              </span>
            )}
            {currentFatwa.audio_file?.name && (
              <span className="hidden sm:inline-block text-xs text-stone-500 bg-stone-50 px-2 py-0.5 rounded border border-stone-200 truncate max-w-[200px]">
                {currentFatwa.audio_file.name}
              </span>
            )}
            {(currentFatwa.transcriber_name || currentFatwa.transcriber_group) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-950 border border-emerald-300 shadow-2xs">
                <User className="w-3 h-3 text-emerald-700" />
                <span>المفرّغ: {currentFatwa.transcriber_name || "غير محدد"}</span>
                {currentFatwa.transcriber_group && (
                  <span className="font-mono text-amber-900 bg-amber-100/90 px-1.5 rounded">
                    مجموعة #{currentFatwa.transcriber_group}
                  </span>
                )}
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-bold font-cairo text-stone-900">
            شاشة المراجعة والتنقيح قبل النشر
          </h2>
          <p className="text-xs text-stone-500">
            قارن بين النص الأصلي والمنقح وتأكد من مطابقة كلام الشيخ قبل الاعتماد
          </p>
        </div>

        {/* Action buttons on top */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
          {onNavigateToAdmin && (
            <button
              onClick={onNavigateToAdmin}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#0c392c] hover:bg-[#14532d] text-white shadow-xs border border-emerald-700/60 transition-all active:scale-95"
              title="الرجوع إلى لوحة تحكم الإدارة المركزية"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>العودة للإدارة</span>
            </button>
          )}

          {onFetchAllUserFatwas && (
            <button
              type="button"
              onClick={() => onFetchAllUserFatwas()}
              disabled={isFetchingAllUsersFatwas}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-cairo bg-amber-400 hover:bg-amber-300 text-stone-950 border border-amber-300 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="مزامنة ورفع فتاوى المراجعة والأرشيف مع السحابة والخادم"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-stone-950 shrink-0 ${isFetchingAllUsersFatwas ? "animate-spin" : ""}`} />
              <span>{isFetchingAllUsersFatwas ? "جارٍ المزامنة..." : "مزامنة ورفع الفتاوى"}</span>
            </button>
          )}

          <button
            onClick={() => setShowDiffView(!showDiffView)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              showDiffView
                ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs"
                : "bg-stone-100 text-stone-600 border-stone-300 hover:bg-stone-200"
            }`}
          >
            <SplitSquareVertical className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>{showDiffView ? "إخفاء الفروقات" : "عرض الفروقات"}</span>
          </button>

          {/* زر تعديل الفتوى ومزامنتها مع القالب */}
          <button
            id="review-edit-fatwa-btn"
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold font-cairo border transition-all cursor-pointer ${
              isEditing
                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-300"
                : "bg-white hover:bg-amber-50 text-stone-800 border-stone-300 shadow-2xs hover:border-amber-400"
            }`}
            title={isEditing ? "إنهاء التحرير وحفظ التغييرات" : "تعديل نص الفتوى (السؤال وجواب الشيخ) ومزامنة التعديل فوراً داخل القالب"}
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>{isEditing ? "إنهاء التحرير ✕" : "تعديل الفتوى ✏️"}</span>
          </button>

          {/* زر حذف الفتوى في الصندوق المشار إليه */}
          <button
            type="button"
            id="review-delete-fatwa-btn"
            onClick={() => {
              if (
                window.confirm(
                  `هل أنت متأكد تماماً من حذف الفتوى #${currentFatwa.fatwaNumber || ""} نهائياً؟\nسيتم تسجيل الحذف سحابياً ومحلياً ولن تظهر في المراجعة أو الأرشيف.`
                )
              ) {
                if (onDeleteFatwa) {
                  onDeleteFatwa(currentFatwa.id);
                }
              }
            }}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold font-cairo bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-300 shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="حذف هذه الفتوى نهائياً ومزامنة الحذف سحابياً ومحلياً"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>حذف الفتوى</span>
          </button>

          {/* الحالة الأولى: الفتوى غير معتمدة بعد -> يظهر فقط زر اعتماد الفتوى */}
          {status !== "معتمدة" && status !== "منشورة" && !currentFatwa.approved ? (
            <button
              type="button"
              id="review-approve-btn"
              onClick={handleApprove}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold font-cairo bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>اعتماد الفتوى</span>
            </button>
          ) : (
            /* الحالة الثانية: الفتوى تم اعتمادها -> يظهر زر إلغاء الاعتماد وجنبه زر النشر أو إلغاء النشر */
            <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 flex-wrap">
              {/* زر إلغاء الاعتماد */}
              <button
                type="button"
                id="review-unapprove-btn"
                onClick={handleUnapprove}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-cairo bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 shadow-2xs transition-all active:scale-95 cursor-pointer"
                title="إلغاء اعتماد الفتوى وإعادتها لحالة تحتاج مراجعة"
              >
                <RotateCcw className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                <span>إلغاء الاعتماد</span>
              </button>

              {/* جنب زر إلغاء الاعتماد: زر النشر أو إلغاء النشر من واجهة القراء */}
              {status === "منشورة" ? (
                <button
                  type="button"
                  id="review-unpublish-btn"
                  onClick={handleUnpublish}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold font-cairo bg-amber-50 hover:bg-rose-50 text-amber-900 hover:text-rose-800 border border-amber-300 hover:border-rose-300 shadow-2xs transition-all active:scale-95 cursor-pointer"
                  title="إلغاء نشر هذه الفتوى وسحبها فوراً وبشكل لحظي من واجهة القراء"
                >
                  <EyeOff className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>إلغاء النشر 🚫</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="review-publish-btn"
                  onClick={handlePublish}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold font-cairo bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-900/20 border border-emerald-500/50 transition-all cursor-pointer active:scale-95 animate-pulse hover:animate-none"
                  title="نشر هذه الفتوى المعتمدة لتظهر فوراً في واجهة القراء والبحث العام بشكل لحظي"
                >
                  <Globe className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>نشر في واجهة القراء 🌐</span>
                </button>
              )}

              {/* معاينة في واجهة القراء إن كانت منشورة */}
              {status === "منشورة" && (
                <a
                  href={`/fatwa/${currentFatwa.id || currentFatwa.fatwaNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold font-cairo bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 shadow-2xs transition-all"
                  title="معاينة الفتوى في واجهة القراء الحية"
                >
                  <Eye className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span className="hidden md:inline">عرض عند القراء</span>
                </a>
              )}

              {onNavigateToArchive && (
                <button
                  type="button"
                  onClick={onNavigateToArchive}
                  className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white shadow-xs transition-all cursor-pointer active:scale-95"
                  title="الانتقال إلى أرشيف الفتاوى"
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>الأرشيف</span>
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => {
              const el = document.getElementById("image-card-section");
              if (el) {
                el.scrollIntoView({ behavior: "smooth" });
              } else {
                onNavigateToCard();
              }
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-teal-700 hover:bg-teal-600 text-white shadow-sm transition-all cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span>قالب الصورة</span>
            <ArrowDown className="w-3 h-3 shrink-0" />
          </button>
        </div>
      </div>

      {/* Approved Status & Archive Link Banner */}
      {(status === "معتمدة" || status === "منشورة" || currentFatwa.approved) && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-300/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold font-cairo text-sm text-emerald-950">
                الفتوى رقم #{currentFatwa.fatwaNumber} معتمدة رسمياً
              </h4>
              <p className="text-xs text-emerald-800/90 font-tajawal">
                تم تثبيت الفتوى في أرشيف الفتاوى المعتمدة ولوحة الإدارة المركزية والسيرفر بنجاح.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            {onNavigateToArchive && (
              <button
                onClick={onNavigateToArchive}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold font-cairo text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>عرض في الأرشيف</span>
              </button>
            )}
            {hasNext && (
              <button
                onClick={handleGoNext}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold font-cairo text-xs shadow-2xs transition-all active:scale-95 cursor-pointer"
              >
                <span>الفتوى التالية</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Unclear segments warning if detected */}
      {currentFatwa.unclear_segments && currentFatwa.unclear_segments.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold font-cairo text-amber-900">
                مقاطع صوتية تحتاج إلى مراجعة بشرية وتأكيد:
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                التزاماً بالأمانة العلمية وقاعدة عدم التخمين، قام النظام بتعليم المقاطع التالية للتحقق منها من التسجيل:
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {currentFatwa.unclear_segments.map((seg, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-200 text-amber-950 font-bold text-xs border border-amber-400"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-amber-800" />
                    {seg}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Review Sections: Question & Answer */}
      <div className="grid grid-cols-1 gap-6">
        {/* Section 1: Question Box */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
              <h3 className="text-base font-bold font-cairo text-stone-900">
                السؤال (سؤال السائل)
              </h3>
            </div>

            <button
              onClick={() => copyToClipboard(questionClean, "question")}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 text-stone-700 border border-stone-200 transition-colors"
            >
              {copiedQuestion ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">تم النسخ!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ السؤال</span>
                </>
              )}
            </button>
          </div>

          {hasAnswerInQuestion(questionClean) && (
            <div className="mb-3 p-3 rounded-xl bg-purple-50 border border-purple-300 text-purple-900 text-xs flex items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-purple-700 shrink-0" />
                <span>
                  <strong>تنبيه دمج السؤال والجواب:</strong> يبدو أن حقل السؤال يحتوي على جزء من كلام الشيخ أو حكمه الشرعي مدمجاً بالخطأ.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const bleed = cleanQuestionAnswerBleed(questionClean);
                  if (bleed.hadBleed) {
                    const fixedCleanQ = sanitizeQuestionGreeting(bleed.cleanedQuestion);
                    setQuestionClean(fixedCleanQ);
                    if (bleed.extractedAnswer) {
                      const lead = bleed.extractedAnswer.substring(0, Math.min(30, bleed.extractedAnswer.length));
                      if (!cleanAnswer.includes(lead)) {
                        setCleanAnswer(cleanAnswer ? `${bleed.extractedAnswer}\n\n${cleanAnswer}` : bleed.extractedAnswer);
                      }
                    }
                    showToast("تم فصل السؤال عن جواب الشيخ بنجاح وتجريد السؤال!", "success");
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold shrink-0 shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>فصل السؤال عن الجواب فوراً</span>
              </button>
            </div>
          )}

          {hasQuestionGreetingIssue(questionClean) && (
            <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  <strong>تنبيه لغوي وشرعي:</strong> صيغة السؤال تبدأ بـ (وعليكم السلام)، والصواب الشرعي أن يبدأ السائل بـ (السلام عليكم ورحمة الله وبركاته).
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const fixedClean = sanitizeQuestionGreeting(questionClean);
                  const fixedOrig = sanitizeQuestionGreeting(questionOriginal);
                  setQuestionClean(fixedClean);
                  setQuestionOriginal(fixedOrig);
                  showToast("تم تصحيح تحية السؤال إلى (السلام عليكم ورحمة الله)", "success");
                }}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 shadow-xs transition-colors"
              >
                تصحيح فوري
              </button>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                  <span>تعديل نص السؤال المنقح (ينعكس فوراً داخل القالب):</span>
                </label>
                <span className="text-[11px] text-emerald-800 font-bold bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>متزامن لحظياً مع قالب البطاقة بالأسفل ⚡</span>
                </span>
              </div>
              <textarea
                rows={3}
                value={questionClean}
                onChange={(e) => setQuestionClean(e.target.value)}
                onBlur={() => {
                  if (hasQuestionGreetingIssue(questionClean)) {
                    const fixed = sanitizeQuestionGreeting(questionClean);
                    setQuestionClean(fixed);
                    showToast("تم ضبط بداية السؤال تلقائياً إلى (السلام عليكم ورحمة الله)", "info");
                  }
                }}
                className="w-full p-3 rounded-xl border border-stone-300 bg-white text-stone-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Original Question (Box 1) */}
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-stone-200/60 pb-2">
                  <span className="text-xs font-bold font-cairo text-stone-600">
                    النص الأصلي كما كتبه السائل:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(questionOriginal, "orig_q", "تم نسخ نص السؤال الأصلي")}
                    disabled={!questionOriginal}
                    title="نسخ النص الأصلي للسؤال"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      copiedKey === "orig_q"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold"
                        : "bg-white hover:bg-stone-100 text-stone-700 hover:text-stone-900 border border-stone-200 shadow-2xs"
                    }`}
                  >
                    {copiedKey === "orig_q" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in-50" />
                        <span className="text-emerald-700 font-bold">تم النسخ!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-stone-500" />
                        <span>نسخ الأصلي</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-sm text-stone-700 leading-relaxed font-tajawal">
                  {questionOriginal || "(لا يوجد نص أصلي مدخل)"}
                </p>
              </div>

              {/* Cleaned Question (Box 2) */}
              <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                  <span className="text-xs font-bold font-cairo text-emerald-900">
                    السؤال بعد التنقيح والترقيم (دون تغيير المقصد):
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(questionClean, "clean_q", "تم نسخ السؤال المنقح")}
                    disabled={!questionClean}
                    title="نسخ الصيغة النهائية المنقحة للسؤال"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      copiedKey === "clean_q"
                        ? "bg-emerald-200 text-emerald-950 border border-emerald-400 font-bold"
                        : "bg-white hover:bg-emerald-50 text-emerald-900 hover:text-emerald-950 border border-emerald-300 shadow-2xs"
                    }`}
                  >
                    {copiedKey === "clean_q" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700 animate-in zoom-in-50" />
                        <span className="text-emerald-800 font-bold">تم النسخ!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-emerald-700" />
                        <span>نسخ المنقح</span>
                      </>
                    )}
                  </button>
                </div>
                {showDiffView ? (
                  <div className="text-sm text-stone-900 leading-relaxed font-tajawal">
                    {questionDiff.map((part, i) => (
                      <span
                        key={i}
                        className={
                          part.added
                            ? "bg-emerald-200 text-emerald-950 font-bold px-1 rounded mx-0.5"
                            : part.removed
                            ? "bg-red-100 text-red-700 line-through text-xs px-1 rounded mx-0.5"
                            : ""
                        }
                      >
                        {part.value}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-stone-900 leading-relaxed font-tajawal">
                    {questionClean}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Answer Box */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-teal-600"></span>
              <h3 className="text-base font-bold font-cairo text-stone-900">
                جواب فضيلة الشيخ د. عبد الباري خلة
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => copyToClipboard(cleanAnswer, "answer")}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 text-stone-700 border border-stone-200 transition-colors"
              >
                {copiedAnswer ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600">تم النسخ!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ جواب الشيخ</span>
                  </>
                )}
              </button>

              <button
                onClick={() => copyToClipboard(getFullFormattedText(), "both")}
                className="flex items-center gap-1 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white shadow-2xs transition-colors"
              >
                {copiedBoth ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>تم نسخ الفتوى!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>نسخ السؤال والجواب للواتساب</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                    <span>تعديل جواب الشيخ المنقح والمجهز للنشر:</span>
                  </label>
                  <span className="text-[11px] text-emerald-800 font-bold bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>يعدل داخل القالب لحظياً ومباشرة ⚡</span>
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={cleanAnswer}
                  onChange={(e) => setCleanAnswer(e.target.value)}
                  className="w-full p-4 rounded-xl border border-stone-300 bg-white text-stone-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none leading-relaxed font-tajawal"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-stone-700">حالة الفتوى:</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as FatwaStatus)}
                    className="text-xs p-2 rounded-lg border border-stone-300 bg-stone-50 font-medium"
                  >
                    <option value="مسودة">مسودة</option>
                    <option value="تحتاج مراجعة">تحتاج مراجعة</option>
                    <option value="مراجعة">مراجعة</option>
                    <option value="معتمدة">معتمدة</option>
                    <option value="منشورة">منشورة</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleSave()}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm cursor-pointer transition-all active:scale-95"
                >
                  <Save className="w-4 h-4 text-emerald-200" />
                  <span>حفظ وتثبيت التعديلات بالقالب والأرشيف ✓</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Diff View / Side-by-Side comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Raw Spoken Transcript (Box 3) */}
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-stone-200/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-cairo text-stone-600">
                        التفريغ الصوتي الحرفي المباشر:
                      </span>
                      <span className="text-[10px] text-stone-500 bg-white px-2 py-0.5 rounded border border-stone-200">
                        كما نطق به الشيخ
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyText(rawAnswer, "raw_ans", "تم نسخ التفريغ الحرفي")}
                      disabled={!rawAnswer}
                      title="نسخ التفريغ الصوتي الحرفي"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                        copiedKey === "raw_ans"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold"
                          : "bg-white hover:bg-stone-100 text-stone-700 hover:text-stone-900 border border-stone-200 shadow-2xs"
                      }`}
                    >
                      {copiedKey === "raw_ans" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in-50" />
                          <span className="text-emerald-700 font-bold">تم النسخ!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-stone-500" />
                          <span>نسخ التفريغ</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-stone-800 leading-relaxed font-tajawal whitespace-pre-line">
                    {rawAnswer || "(لم يتم العثور على نص تفريغ)"}
                  </p>
                </div>

                {/* Cleaned & Formatted Output (Box 4) */}
                <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-cairo text-emerald-950">
                        النص المنقح والمجهز للنشر (قاعدة التعديل الأدنى):
                      </span>
                      <span className="text-[10px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 font-semibold">
                        محافظ على الأسلوب
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyText(cleanAnswer, "clean_ans", "تم نسخ جواب الشيخ المنقح")}
                      disabled={!cleanAnswer}
                      title="نسخ الصيغة النهائية المنقحة لجواب الشيخ"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                        copiedKey === "clean_ans"
                          ? "bg-emerald-200 text-emerald-950 border border-emerald-400 font-bold"
                          : "bg-white hover:bg-emerald-50 text-emerald-900 hover:text-emerald-950 border border-emerald-300 shadow-2xs"
                      }`}
                    >
                      {copiedKey === "clean_ans" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700 animate-in zoom-in-50" />
                          <span className="text-emerald-800 font-bold">تم النسخ!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-emerald-700" />
                          <span>نسخ المنقح</span>
                        </>
                      )}
                    </button>
                  </div>

                  {showDiffView ? (
                    <div className="text-sm text-stone-900 leading-relaxed font-tajawal whitespace-pre-line">
                      {answerDiff.map((part, i) => (
                        <span
                          key={i}
                          className={
                            part.added
                              ? "bg-emerald-200 text-emerald-950 font-medium px-0.5 rounded"
                              : part.removed
                              ? "bg-red-100 text-red-700 line-through text-xs px-0.5 rounded mx-0.5"
                              : ""
                          }
                        >
                          {part.value}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-stone-900 leading-relaxed font-tajawal whitespace-pre-line">
                      {cleanAnswer}
                    </div>
                  )}
                </div>
              </div>

              {/* Editing Notes List (Box 5) */}
              {currentFatwa.editing_notes && currentFatwa.editing_notes.length > 0 && (
                <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-stone-200/60 pb-1.5">
                    <span className="text-xs font-bold font-cairo text-stone-700">
                      ملاحظات التحرير والتنسيق الآلي:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          currentFatwa.editing_notes?.map((n, i) => `${i + 1}. ${n}`).join("\n") || "",
                          "notes",
                          "تم نسخ ملاحظات التحرير"
                        )
                      }
                      title="نسخ قائمة ملاحظات التحرير والتنسيق"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                        copiedKey === "notes"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold"
                          : "bg-white hover:bg-stone-100 text-stone-700 hover:text-stone-900 border border-stone-200 shadow-2xs"
                      }`}
                    >
                      {copiedKey === "notes" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in-50" />
                          <span className="text-emerald-700 font-bold">تم النسخ!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-stone-500" />
                          <span>نسخ الملاحظات</span>
                        </>
                      )}
                    </button>
                  </div>
                  <ul className="text-xs text-stone-600 space-y-1 list-disc list-inside">
                    {currentFatwa.editing_notes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Embedded Live Image Card Generator & Download Section */}
      <div className="pt-2">
        <ImageCardGenerator
          currentFatwa={{
            ...currentFatwa,
            question_clean: questionClean,
            question_original: questionClean,
            question_tashkeel: questionClean,
            answer_clean: cleanAnswer,
            answer_tashkeel: cleanAnswer,
            category: category,
            status: status,
            approved: status === "معتمدة" || status === "منشورة" || currentFatwa.approved,
            has_wallahu_aalam: hasWallahuAalam,
            updated_at: new Date().toISOString(),
          }}
          onUpdateFatwa={onUpdateFatwa}
          onDeleteFatwa={onDeleteFatwa}
          onUpdateTemplateSettings={onUpdateTemplateSettings || (() => {})}
          onNavigateToTranscribe={onNavigateToTranscribe}
          onNavigateToAdmin={onNavigateToAdmin}
          showToast={showToast}
          embedded={true}
        />
      </div>
    </div>
  );
};
