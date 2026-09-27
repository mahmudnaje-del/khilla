import React from "react";
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
  AlertTriangle
} from "lucide-react";
import { Fatwa } from "../types";
import { formatDuration } from "../utils/audioHelper";

interface DashboardStatsProps {
  fatwas: Fatwa[];
  onNewFatwa: () => void;
  onFilterNeedsReview: () => void;
  onOpenArchive: () => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  fatwas,
  onNewFatwa,
  onFilterNeedsReview,
  onOpenArchive,
}) => {
  const totalCount = fatwas.length;
  const needsReviewCount = fatwas.filter((f) => f.status === "تحتاج مراجعة").length;
  const approvedCount = fatwas.filter((f) => f.status === "معتمدة").length;
  const publishedCount = fatwas.filter((f) => f.status === "منشورة").length;
  const draftCount = fatwas.filter((f) => f.status === "مسودة" || f.status === "مراجعة").length;

  const totalAudioSeconds = fatwas.reduce((acc, f) => acc + (f.audio_file?.duration || 0), 0);

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
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-[#0c392c] font-bold font-cairo text-sm shadow-[0_8px_30px_rgb(245,158,11,0.3)] transition-all hover:-translate-y-0.5 active:translate-y-0 shrink-0"
          >
            <PlusCircle className="w-5 h-5" />
            <span>تفريغ فتوى جديدة</span>
          </button>
        </div>

        {/* Ambient background ornament */}
        <div className="absolute top-0 right-0 translate-x-12 -translate-y-12 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -translate-x-12 translate-y-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
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
            <span className="text-xs text-stone-400 font-medium font-tajawal">فتاوى مسجلة في النظام</span>
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
            <div className="text-3xl sm:text-4xl font-black font-mono text-amber-900 tracking-tight">
              {needsReviewCount}
            </div>
            <span className="text-xs text-amber-700/80 font-bold font-tajawal flex items-center gap-1.5">
              <span>تتطلب تدقيقاً بشرياً</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            </span>
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
    </div>
  );
};
