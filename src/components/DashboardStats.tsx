import React, { useState } from "react";
import {
  Layers,
  CheckCircle2,
  Clock,
  Send,
  FileAudio,
  PlusCircle,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  BookOpen,
  AlertTriangle,
  Globe,
  Loader2,
  RotateCcw,
  EyeOff,
  Hash,
  X,
} from "lucide-react";
import { Fatwa } from "../types";
import { formatDuration } from "../utils/audioHelper";

interface DashboardStatsProps {
  fatwas: Fatwa[];
  onNewFatwa: () => void;
  onFilterNeedsReview: () => void;
  onOpenArchive: () => void;
  onPublishAllApproved?: () => Promise<void>;
  onUnpublishFatwaByNumber?: (rawNumber: string | number) => Promise<boolean>;
  onUnpublishAllFatwas?: () => Promise<void>;
  isPublishSyncing?: boolean;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  fatwas,
  onNewFatwa,
  onFilterNeedsReview,
  onOpenArchive,
  onPublishAllApproved,
  onUnpublishFatwaByNumber,
  onUnpublishAllFatwas,
  isPublishSyncing = false,
  showToast,
}) => {
  const [isUnpublishModalOpen, setIsUnpublishModalOpen] = useState(false);
  const [unpublishNumberInput, setUnpublishNumberInput] = useState("");
  const [isSubmittingUnpublish, setIsSubmittingUnpublish] = useState(false);
  const [isConfirmUnpublishAllOpen, setIsConfirmUnpublishAllOpen] = useState(false);
  const [isSubmittingUnpublishAll, setIsSubmittingUnpublishAll] = useState(false);
  const [isLocalPublishSyncing, setIsLocalPublishSyncing] = useState(false);

  const activeFatwas = fatwas.filter((f) => !f.deleted);
  const totalCount = activeFatwas.length;
  const approvedCount = activeFatwas.filter(
    (f) => f.approved || f.status === "معتمدة" || f.status === "منشورة"
  ).length;
  const needsReviewCount = activeFatwas.filter(
    (f) => !f.approved && f.status !== "معتمدة" && f.status !== "منشورة"
  ).length;
  const publishedCount = activeFatwas.filter(
    (f) => f.status === "منشورة" || (f.status === "معتمدة" && (f as any).isPublic === true)
  ).length;
  const draftCount = activeFatwas.filter((f) => f.status === "مسودة" || f.status === "مراجعة").length;
  const approvedPendingPublishCount = activeFatwas.filter(
    (f) => (f.status === "معتمدة" || f.approved) && f.status !== "منشورة" && (f as any).isPublic !== true
  ).length;

  const totalAudioSeconds = activeFatwas.reduce((acc, f) => acc + (f.audio_file?.duration || 0), 0);

  const handlePublishAllApprovedAction = async () => {
    if (onPublishAllApproved) {
      await onPublishAllApproved();
      return;
    }
    setIsLocalPublishSyncing(true);
    try {
      const res = await fetch("/api/fatwas/publish-all-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fatwas }),
      });
      const data = await res.json();
      showToast?.(`تم نشر جميع الفتاوى المعتمدة (${data.count || 0} فتوى) في واجهة القراء 🌐`, "success");
    } catch {
      showToast?.("حدث خطأ أثناء الاتصال بالخادم لنشر الفتاوى المعتمدة", "error");
    } finally {
      setIsLocalPublishSyncing(false);
    }
  };

  const handleUnpublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = unpublishNumberInput.trim();
    if (!raw) return;

    setIsSubmittingUnpublish(true);
    try {
      if (onUnpublishFatwaByNumber) {
        const success = await onUnpublishFatwaByNumber(raw);
        if (success) {
          setUnpublishNumberInput("");
          setIsUnpublishModalOpen(false);
        }
      } else {
        const res = await fetch("/api/fatwas/unpublish-by-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fatwaNumber: raw }),
        });
        const data = await res.json();
        if (data.success) {
          showToast?.(`تم إلغاء نشر الفتوى رقم #${data.fatwa?.fatwaNumber || raw} وسحبها من واجهة القراء 🚫`, "info");
          setUnpublishNumberInput("");
          setIsUnpublishModalOpen(false);
        } else {
          showToast?.(data.error || `لم يتم العثور على فتوى برقم ${raw}`, "error");
        }
      }
    } catch {
      showToast?.("تعذر إلغاء نشر الفتوى، يرجى المحاولة لاحقاً", "error");
    } finally {
      setIsSubmittingUnpublish(false);
    }
  };

  const handleExecuteUnpublishAll = async () => {
    setIsSubmittingUnpublishAll(true);
    try {
      if (onUnpublishAllFatwas) {
        await onUnpublishAllFatwas();
      } else {
        const res = await fetch("/api/fatwas/unpublish-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (data.success) {
          showToast?.(`تم سحب كافة الفتاوى (${data.count || 0}) من واجهة القراء بنجاح 🚫`, "info");
        } else {
          showToast?.(data.error || "فشل إلغاء نشر الفتاوى", "error");
        }
      }
      setIsConfirmUnpublishAllOpen(false);
    } catch {
      showToast?.("حدث خطأ أثناء محاولة إلغاء نشر جميع الفتاوى", "error");
    } finally {
      setIsSubmittingUnpublishAll(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-[#0c392c] via-[#08291f] to-[#041a12] rounded-[2rem] p-8 sm:p-10 text-white border border-emerald-900/50 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pointer-events-auto">
          <div className="space-y-3 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold bg-emerald-900/60 text-emerald-200 border border-emerald-700/60 backdrop-blur-md">
              <ShieldCheck className="w-3.5 h-3.5" />
              تحديث الأمانة والتحرير الشرعي 2.0
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-cairo text-white tracking-tight">
              لوحة التحكم والإحصائيات
            </h2>
            <p className="text-sm text-emerald-100/80 leading-relaxed font-tajawal max-w-xl">
              نظرة عامة متقدمة لعمليات تفريغ وتنقيح فتاوى فضيلة الشيخ د. عبد الباري خلة، مع واجهة محسّنة ومؤشرات أداء لحظية.
            </p>
          </div>

          <button
            onClick={onNewFatwa}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-[#0c392c] font-bold font-cairo text-sm shadow-[0_8px_30px_rgb(245,158,11,0.3)] transition-all hover:-translate-y-0.5 active:translate-y-0 shrink-0 cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
            <span>تفريغ فتوى جديدة</span>
          </button>
        </div>

        {/* Ambient background ornament */}
        <div className="absolute top-0 right-0 translate-x-12 -translate-y-12 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -translate-x-12 translate-y-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Infrastructure & Readers Publishing Management Bar in Control Panel */}
      <div className="bg-gradient-to-r from-stone-900 via-[#0c392c] to-stone-900 text-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xl border border-emerald-800/40 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5">
          {/* Status info & counts */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 text-emerald-300 shadow-inner">
              <Globe className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold font-cairo text-base sm:text-lg text-white">
                  إدارة نشر الفتاوى بواجهة القراء
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  بنية تحتية لحظية
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-sm text-stone-300 font-tajawal mt-1 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-xs"></span>
                  <span>المنشورة للقراء حالياً:</span>
                  <strong className="text-white font-mono text-sm">{publishedCount}</strong>
                </span>
                <span className="text-stone-500">•</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shadow-xs"></span>
                  <span>معتمدة بانتظار النشر:</span>
                  <strong className="text-amber-200 font-mono text-sm">{approvedPendingPublishCount}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Button 1: نشر جميع الفتاوى المعتمدة */}
            <button
              type="button"
              id="dashboard-publish-all-btn"
              onClick={handlePublishAllApprovedAction}
              disabled={isPublishSyncing || isLocalPublishSyncing}
              className="flex-1 sm:flex-none px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold font-cairo text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="نشر كل الفتاوى المعتمدة غير المنشورة ومزامنة جميع فتاوى المفرغين فوراً"
            >
              {isPublishSyncing || isLocalPublishSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-200" />
                  <span>جارٍ المزامنة والنشر...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-emerald-200" />
                  <span>نشر جميع الفتاوى المعتمدة</span>
                  {approvedPendingPublishCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-white text-emerald-800 font-bold font-mono shadow-xs">
                      {approvedPendingPublishCount}
                    </span>
                  )}
                </>
              )}
            </button>

            {/* Button 2: إلغاء نشر فتوى (بحط رقمها) */}
            <button
              type="button"
              id="dashboard-unpublish-single-btn"
              onClick={() => {
                setUnpublishNumberInput("");
                setIsUnpublishModalOpen(true);
              }}
              className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/25 text-stone-100 hover:text-white border border-white/20 font-bold font-cairo text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              title="إلغاء نشر فتوى محددة برقمها وسحبها من واجهة القراء"
            >
              <EyeOff className="w-4 h-4 text-amber-300" />
              <span>إلغاء نشر فتوى</span>
            </button>

            {/* Button 3: إلغاء نشر جميع الفتاوى */}
            <button
              type="button"
              id="dashboard-unpublish-all-btn"
              onClick={() => setIsConfirmUnpublishAllOpen(true)}
              className="px-4 py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 active:bg-rose-500/40 text-rose-200 hover:text-rose-100 border border-rose-400/30 font-bold font-cairo text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              title="سحب جميع الفتاوى المنشورة من واجهة القراء مع الحفاظ عليها معتمدة في الأرشيف"
            >
              <RotateCcw className="w-4 h-4 text-rose-300" />
              <span>إلغاء نشر جميع الفتاوى</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Fatwas */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-stone-100 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-emerald-100/50 transition-colors"></div>
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500 font-cairo">إجمالي الفتاوى</span>
              <div className="w-10 h-10 rounded-2xl bg-stone-100 text-stone-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                <BookOpen className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-stone-900 tracking-tight">
              {totalCount}
            </div>
            <div className="flex items-center justify-between text-xs text-stone-500 font-medium font-tajawal flex-wrap gap-1">
              <span>مسجلة وموحدة في فايرستور</span>
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 font-mono">
                تسلسل #1 - #{totalCount}
              </span>
            </div>
          </div>
        </div>

        {/* Needs Review */}
        <div
          onClick={onFilterNeedsReview}
          className="bg-gradient-to-br from-amber-50/80 to-orange-50/80 backdrop-blur-xl p-6 rounded-3xl border border-amber-200/60 shadow-sm hover:shadow-[0_8px_30px_rgb(251,191,36,0.15)] transition-all duration-300 cursor-pointer relative overflow-hidden group hover:-translate-y-1"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/40 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-amber-300/40 transition-colors"></div>
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 font-cairo">تحتاج مراجعة</span>
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                <AlertTriangle className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-amber-900 tracking-tight flex items-baseline gap-2">
              <span>{needsReviewCount}</span>
              <span className="text-xs font-normal text-amber-700 font-tajawal">فتوى قيد المراجعة</span>
            </div>
            <div className="flex items-center justify-between text-xs text-amber-800/90 font-bold font-tajawal flex-wrap gap-1">
              <span className="flex items-center gap-1.5">
                <span>ضمن الترقيم السحابي الشامل</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              </span>
              <span className="text-[11px] font-mono bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded-md border border-amber-300/60">
                ترقيم فايرستور #{Math.max(1, totalCount - needsReviewCount + 1)} - #{totalCount}
              </span>
            </div>
          </div>
        </div>

        {/* Approved */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-stone-100 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-emerald-100/40 transition-colors"></div>
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500 font-cairo">فتاوى معتمدة</span>
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-700 tracking-tight">
              {approvedCount}
            </div>
            <span className="text-xs text-stone-400 font-medium font-tajawal">جاهزة للتصميم والنشر</span>
          </div>
        </div>

        {/* Published */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-stone-100 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:bg-teal-100/40 transition-colors"></div>
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500 font-cairo">فتاوى منشورة</span>
              <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Send className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-teal-800 tracking-tight">
              {publishedCount}
            </div>
            <span className="text-xs text-stone-400 font-medium font-tajawal">تم تعميمها عبر المنصات</span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Audio Processing Metrics */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold font-cairo text-stone-900">
            <FileAudio className="w-4 h-4 text-emerald-700" />
            <span>حجم المحتوى الصوتي المعالج</span>
          </div>
          <div className="p-4 bg-stone-50 rounded-xl space-y-2 border border-stone-100">
            <div className="flex justify-between items-center text-xs text-stone-600">
              <span>إجمالي مدة التسجيلات:</span>
              <span className="font-mono font-bold text-stone-900">
                {Math.round(totalAudioSeconds / 60)} دقيقة
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-stone-600">
              <span>متوسط زمن الفتوى:</span>
              <span className="font-mono font-bold text-stone-900">
                {formatDuration(totalCount > 0 ? totalAudioSeconds / totalCount : 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Fidelity & AI Guardrails Status */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold font-cairo text-stone-900">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>ضوابط الذكاء الاصطناعي والأمانة</span>
          </div>
          <div className="p-4 bg-emerald-50/50 rounded-xl space-y-2 border border-emerald-100 text-xs text-stone-700">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>قاعدة التعديل الأدنى (Minimal Editing) مفعلة</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>منع الاستنتاج أو توليد أحكام فقهية تلقائياً</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>تمييز المقاطع غير الواضحة للمراجعة</span>
            </div>
          </div>
        </div>

        {/* Quick Links & Shortcuts */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-3 flex flex-col justify-between">
          <div className="text-sm font-bold font-cairo text-stone-900">
            إجراءات سريعة
          </div>
          <div className="space-y-2">
            <button
              onClick={onNewFatwa}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-cairo transition-all flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>تفريغ تسجيل جديد</span>
            </button>
            <button
              onClick={onOpenArchive}
              className="w-full py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold font-cairo transition-all flex items-center justify-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              <span>استعراض الأرشيف الكامل</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal 1: إلغاء نشر فتوى برقمها */}
      {isUnpublishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-stone-200 space-y-5 text-right font-cairo"
            dir="rtl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <EyeOff className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-900">
                    إلغاء نشر فتوى من واجهة القراء
                  </h3>
                  <p className="text-xs text-stone-500 font-tajawal">
                    سحب الفتوى من المنصة مع بقائها في الأرشيف
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUnpublishModalOpen(false)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUnpublishSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="unpublish-fatwa-num-dashboard"
                  className="block text-xs font-bold text-stone-700"
                >
                  رقم الفتوى المراد إلغاء نشرها:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-stone-400">
                    <Hash className="w-4 h-4" />
                  </div>
                  <input
                    id="unpublish-fatwa-num-dashboard"
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    placeholder="مثال: 12 أو 105"
                    value={unpublishNumberInput}
                    onChange={(e) => setUnpublishNumberInput(e.target.value)}
                    className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-stone-50 border border-stone-300 focus:bg-white focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 text-stone-900 text-sm font-semibold transition-all outline-hidden text-right"
                  />
                </div>
                <p className="text-[11px] text-stone-500 font-tajawal">
                  بمجرد إدخال رقم الفتوى وتأكيد الإلغاء، ستُحجب الفتوى فوراً عن القراء وتعود لحالة معتمدة دون حذفها من الأرشيف.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!unpublishNumberInput.trim() || isSubmittingUnpublish}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSubmittingUnpublish ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جارٍ إلغاء النشر...</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-4 h-4" />
                      <span>تأكيد إلغاء النشر وسحب الفتوى</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsUnpublishModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: تأكيد إلغاء نشر جميع الفتاوى */}
      {isConfirmUnpublishAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-stone-200 space-y-5 text-right font-cairo"
            dir="rtl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-900">
                    تأكيد إلغاء نشر جميع الفتاوى
                  </h3>
                  <p className="text-xs text-stone-500 font-tajawal">
                    سحب جماعي من واجهة القراء
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmUnpublishAllOpen(false)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 font-tajawal text-sm text-stone-700 leading-relaxed bg-rose-50/70 p-4 rounded-2xl border border-rose-200/80">
              <p className="font-bold text-rose-950">
                هل أنت متأكد من رغبتك في سحب جميع الفتاوى المنشورة (عددها {publishedCount}) من واجهة القراء؟
              </p>
              <ul className="text-xs text-rose-900 space-y-1 list-disc list-inside">
                <li>ستختفي كافة الفتاوى فوراً من منصة القراء.</li>
                <li>ستبقى جميع الفتاوى محفوظة ومعتمدة بالكامل في الأرشيف والنظام بدون أي حذف.</li>
                <li>يمكنك إعادة نشرها في أي وقت بضغطة زر واحدة.</li>
              </ul>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleExecuteUnpublishAll}
                disabled={isSubmittingUnpublishAll || publishedCount === 0}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmittingUnpublishAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جارٍ سحب الفتاوى...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>نعم، إلغاء نشر جميع الفتاوى</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmUnpublishAllOpen(false)}
                className="py-2.5 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
