import React, { useState, useMemo } from "react";
import {
  Send,
  Globe,
  Clock,
  AlertCircle,
  CheckCircle2,
  Edit3,
  X,
  Search,
  ExternalLink,
  Copy,
  Check,
  ImageIcon,
  Sparkles,
  ArrowRight,
  Filter,
  Eye,
  RefreshCw,
  Share2,
  Tag,
  BookOpen,
  SlidersHorizontal,
  Flame,
  Undo2,
} from "lucide-react";
import { Fatwa } from "../types";
import confetti from "canvas-confetti";

interface PublishingCenterProps {
  fatwas: Fatwa[];
  onUpdateFatwa: (updated: Fatwa) => Promise<void> | void;
  onPublishFatwa?: (fatwaId: string) => Promise<void> | void;
  onUnpublishFatwa?: (fatwaId: string) => Promise<void> | void;
  onPublishAllApproved?: () => Promise<void> | void;
  onNavigateToCard?: (fatwa: Fatwa) => void;
  onNavigateToReview?: (fatwa: Fatwa) => void;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
}

type PublishSection = "published" | "pending_publish" | "needs_approval";

export const PublishingCenter: React.FC<PublishingCenterProps> = ({
  fatwas,
  onUpdateFatwa,
  onPublishFatwa,
  onUnpublishFatwa,
  onPublishAllApproved,
  onNavigateToCard,
  onNavigateToReview,
  showToast,
}) => {
  const [activeSection, setActiveSection] = useState<PublishSection>("pending_publish");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [editingFatwa, setEditingFatwa] = useState<Fatwa | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isBatchPublishing, setIsBatchPublishing] = useState(false);

  // Filter non-deleted fatwas
  const activeFatwas = useMemo(() => fatwas.filter((f) => !f.deleted), [fatwas]);

  // Section 1: Published Fatwas (الفتاوى المنشورة)
  const publishedFatwas = useMemo(() => {
    return activeFatwas.filter(
      (f) => f.status === "منشورة" || (f.status === "معتمدة" && (f as any).isPublic === true)
    );
  }, [activeFatwas]);

  // Section 2: Approved Awaiting Publishing (الفتاوى المعتمدة بانتظار النشر)
  const pendingPublishFatwas = useMemo(() => {
    return activeFatwas.filter(
      (f) =>
        (f.status === "معتمدة" || f.approved) &&
        f.status !== "منشورة" &&
        (f as any).isPublic !== true
    );
  }, [activeFatwas]);

  // Section 3: Needs Approval / In Review (فتاوى بحاجة للاعتماد)
  const needsApprovalFatwas = useMemo(() => {
    return activeFatwas.filter(
      (f) =>
        f.status === "تحتاج مراجعة" ||
        f.status === "مسودة" ||
        f.status === "مراجعة" ||
        (!f.approved && f.status !== "معتمدة" && f.status !== "منشورة")
    );
  }, [activeFatwas]);

  // List for the currently active section
  const currentSectionList = useMemo(() => {
    if (activeSection === "published") return publishedFatwas;
    if (activeSection === "pending_publish") return pendingPublishFatwas;
    return needsApprovalFatwas;
  }, [activeSection, publishedFatwas, pendingPublishFatwas, needsApprovalFatwas]);

  // All categories in current section
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    currentSectionList.forEach((f) => {
      if (f.category) set.add(f.category);
    });
    return Array.from(set);
  }, [currentSectionList]);

  // Filtered list by search & category
  const filteredList = useMemo(() => {
    return currentSectionList.filter((f) => {
      const q = searchQuery.trim().toLowerCase();
      const matchCategory = selectedCategory === "all" || f.category === selectedCategory;
      if (!matchCategory) return false;
      if (!q) return true;

      const numStr = String(f.fatwaNumber || "");
      const qText = (f.question_clean || f.question_original || "").toLowerCase();
      const aText = (f.answer_clean || "").toLowerCase();
      const cat = (f.category || "").toLowerCase();
      const tags = (f.tags || []).join(" ").toLowerCase();

      return (
        numStr.includes(q) ||
        qText.includes(q) ||
        aText.includes(q) ||
        cat.includes(q) ||
        tags.includes(q)
      );
    });
  }, [currentSectionList, searchQuery, selectedCategory]);

  // Copy shareable link
  const handleCopyLink = (fatwa: Fatwa) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/?fatwa=${fatwa.fatwaNumber || fatwa.id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(fatwa.id);
    showToast?.(`تم نسخ رابط الفتوى #${fatwa.fatwaNumber || ""} للمشاركة بنجاح 📋`, "success");
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Publish a single fatwa
  const handlePublishSingle = async (fatwa: Fatwa) => {
    setActionLoadingId(fatwa.id);
    try {
      if (onPublishFatwa) {
        await onPublishFatwa(fatwa.id);
      } else {
        const now = new Date().toISOString();
        const updated: Fatwa = {
          ...fatwa,
          status: "منشورة",
          approved: true,
          isPublic: true,
          published_at: fatwa.published_at || now,
          updated_at: now,
        };
        await onUpdateFatwa(updated);
      }
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
      showToast?.(`تم نشر الفتوى رقم #${fatwa.fatwaNumber} بنجاح في المنصة العامة 🌐`, "success");
    } catch (e: any) {
      showToast?.("فشل نشر الفتوى: " + (e?.message || e), "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Unpublish a single fatwa
  const handleUnpublishSingle = async (fatwa: Fatwa) => {
    setActionLoadingId(fatwa.id);
    try {
      if (onUnpublishFatwa) {
        await onUnpublishFatwa(fatwa.id);
      } else {
        const now = new Date().toISOString();
        const updated: Fatwa = {
          ...fatwa,
          status: "معتمدة",
          approved: true,
          isPublic: false,
          updated_at: now,
        };
        await onUpdateFatwa(updated);
      }
      showToast?.(`تم إلغاء نشر الفتوى رقم #${fatwa.fatwaNumber} وإعادتها لقائمة انتظار النشر 🚫`, "info");
    } catch (e: any) {
      showToast?.("فشل إلغاء النشر: " + (e?.message || e), "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Approve a single fatwa (move from needs_approval to pending_publish)
  const handleApproveSingle = async (fatwa: Fatwa) => {
    setActionLoadingId(fatwa.id);
    try {
      const now = new Date().toISOString();
      const updated: Fatwa = {
        ...fatwa,
        status: "معتمدة",
        approved: true,
        reviewed: true,
        approved_at: now,
        isPublic: false,
        updated_at: now,
      };
      await onUpdateFatwa(updated);
      showToast?.(`تم اعتماد الفتوى رقم #${fatwa.fatwaNumber} ونقلها لقائمة انتظار النشر ✅`, "success");
    } catch (e: any) {
      showToast?.("فشل اعتماد الفتوى: " + (e?.message || e), "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Batch publish all approved fatwas
  const handlePublishAllApprovedClick = async () => {
    if (pendingPublishFatwas.length === 0) {
      showToast?.("لا توجد فتاوى معتمدة بانتظار النشر حالياً", "info");
      return;
    }
    setIsBatchPublishing(true);
    try {
      if (onPublishAllApproved) {
        await onPublishAllApproved();
      } else {
        const now = new Date().toISOString();
        for (const f of pendingPublishFatwas) {
          const updated: Fatwa = {
            ...f,
            status: "منشورة",
            approved: true,
            isPublic: true,
            published_at: f.published_at || now,
            updated_at: now,
          };
          await onUpdateFatwa(updated);
        }
        showToast?.(`تم نشر جميع الفتاوى المعتمدة (${pendingPublishFatwas.length} فتوى) بنجاح 🌐`, "success");
      }
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
    } catch (e: any) {
      showToast?.("فشل النشر الجماعي: " + (e?.message || e), "error");
    } finally {
      setIsBatchPublishing(false);
    }
  };

  // Save changes from Publisher Edit Modal
  const handleSaveEdit = async (andPublish = false, andApprove = false) => {
    if (!editingFatwa) return;
    setIsSavingEdit(true);
    try {
      const now = new Date().toISOString();
      let newStatus = editingFatwa.status;
      let newApproved = editingFatwa.approved;
      let newIsPublic = editingFatwa.isPublic;
      let newPublishedAt = editingFatwa.published_at;

      if (andPublish) {
        newStatus = "منشورة";
        newApproved = true;
        newIsPublic = true;
        newPublishedAt = newPublishedAt || now;
      } else if (andApprove) {
        newStatus = "معتمدة";
        newApproved = true;
        newIsPublic = false;
      }

      const updated: Fatwa = {
        ...editingFatwa,
        status: newStatus,
        approved: newApproved,
        isPublic: newIsPublic,
        published_at: newPublishedAt,
        updated_at: now,
        version: (editingFatwa.version || 1) + 1,
      };

      await onUpdateFatwa(updated);
      setEditingFatwa(null);

      if (andPublish) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 } });
        showToast?.(`تم حفظ ونشر الفتوى رقم #${updated.fatwaNumber} بنجاح 🌐`, "success");
      } else if (andApprove) {
        showToast?.(`تم حفظ واعتماد الفتوى رقم #${updated.fatwaNumber} ونقلها لقائمة النشر ✅`, "success");
      } else {
        showToast?.(`تم حفظ تعديلات الفتوى رقم #${updated.fatwaNumber} بنجاح 💾`, "success");
      }
    } catch (e: any) {
      showToast?.("فشل حفظ التعديلات: " + (e?.message || e), "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="space-y-3 max-w-6xl mx-auto pb-16 font-tajawal animate-in fade-in duration-200">
      {/* 3 Simple, Compact Tabs Side-by-Side (مبسط وعملي ومريح للجوال بدون استهلاك للشاشة) */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2 p-1 sm:p-1.5 bg-white rounded-xl sm:rounded-2xl border border-stone-200/90 shadow-xs">
        {/* زر 1: المنشورة */}
        <button
          onClick={() => {
            setActiveSection("published");
            setSelectedCategory("all");
          }}
          className={`flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-1 sm:px-2.5 rounded-lg sm:rounded-xl font-bold font-cairo text-[11px] sm:text-sm transition-all cursor-pointer active:scale-98 ${
            activeSection === "published"
              ? "bg-[#0c392c] text-amber-300 shadow-xs"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          }`}
        >
          <Globe className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
          <span className="truncate">المنشورة</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              activeSection === "published"
                ? "bg-emerald-800 text-amber-200"
                : "bg-stone-200 text-stone-700"
            }`}
          >
            {publishedFatwas.length}
          </span>
        </button>

        {/* زر 2: بانتظار النشر */}
        <button
          onClick={() => {
            setActiveSection("pending_publish");
            setSelectedCategory("all");
          }}
          className={`flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-1 sm:px-2.5 rounded-lg sm:rounded-xl font-bold font-cairo text-[11px] sm:text-sm transition-all cursor-pointer active:scale-98 ${
            activeSection === "pending_publish"
              ? "bg-amber-500 text-stone-950 shadow-xs"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          }`}
        >
          <Clock className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
          <span className="truncate">بانتظار النشر</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              activeSection === "pending_publish"
                ? "bg-amber-600 text-white"
                : "bg-stone-200 text-stone-700"
            }`}
          >
            {pendingPublishFatwas.length}
          </span>
        </button>

        {/* زر 3: بحاجة للاعتماد */}
        <button
          onClick={() => {
            setActiveSection("needs_approval");
            setSelectedCategory("all");
          }}
          className={`flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-1 sm:px-2.5 rounded-lg sm:rounded-xl font-bold font-cairo text-[11px] sm:text-sm transition-all cursor-pointer active:scale-98 ${
            activeSection === "needs_approval"
              ? "bg-rose-700 text-white shadow-xs"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
          <span className="truncate">بحاجة للاعتماد</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              activeSection === "needs_approval"
                ? "bg-rose-800 text-white"
                : "bg-stone-200 text-stone-700"
            }`}
          >
            {needsApprovalFatwas.length}
          </span>
        </button>
      </div>

      {/* شريط أدوات مصغر مدمج: نشر الكل عند الحاجة */}
      {activeSection === "pending_publish" && pendingPublishFatwas.length > 0 && (
        <div className="flex items-center justify-between p-2.5 px-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-cairo text-amber-950">
          <span className="font-bold">
            يوجد {pendingPublishFatwas.length} فتوى معتمدة بانتظار إطلاقها للعامة
          </span>
          <button
            onClick={handlePublishAllApprovedClick}
            disabled={isBatchPublishing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Flame className={`w-3.5 h-3.5 ${isBatchPublishing ? "animate-spin" : ""}`} />
            <span>{isBatchPublishing ? "جارٍ النشر..." : "نشر الكل دفعة واحدة"}</span>
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الفتوى، السؤال، الجواب، أو الكلمات المفتاحية..."
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-stone-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-3 text-stone-400 hover:text-stone-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {availableCategories.length > 0 && (
          <div className="flex items-center gap-2 sm:w-64">
            <Filter className="w-4 h-4 text-stone-400 shrink-0" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full py-2.5 px-3 bg-white border border-stone-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs font-cairo"
            >
              <option value="all">كل التصنيفات ({currentSectionList.length})</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Content List */}
      {filteredList.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-stone-200 shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
            {activeSection === "published" ? (
              <Globe className="w-7 h-7" />
            ) : activeSection === "pending_publish" ? (
              <CheckCircle2 className="w-7 h-7" />
            ) : (
              <AlertCircle className="w-7 h-7" />
            )}
          </div>
          <h3 className="text-lg font-bold font-cairo text-stone-800">
            {searchQuery || selectedCategory !== "all"
              ? "لا توجد فتاوى مطابقة لبحثك"
              : activeSection === "published"
              ? "لا توجد فتاوى منشورة حالياً"
              : activeSection === "pending_publish"
              ? "لا توجد فتاوى بانتظار النشر (جميع المعتمدة منشورة)"
              : "لا توجد فتاوى بحاجة للاعتماد، عمل متقن!"}
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            {searchQuery || selectedCategory !== "all"
              ? "جرّب تغيير كلمات البحث أو اختيار تصنيف آخر."
              : activeSection === "pending_publish"
              ? "يمكنك اعتماد المزيد من الفتاوى من قسم 'فتاوى بحاجة للاعتماد' لنشرها هنا."
              : "يمكنك تفريغ فتاوى جديدة أو مراجعة الأقسام الأخرى."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredList.map((fatwa) => {
            const isLoading = actionLoadingId === fatwa.id;
            const isPublished =
              fatwa.status === "منشورة" || (fatwa.status === "معتمدة" && (fatwa as any).isPublic === true);
            const isApproved = fatwa.status === "معتمدة" || fatwa.approved;
            const needsApproval = !isApproved && fatwa.status !== "منشورة";

            return (
              <div
                key={fatwa.id}
                className="bg-white rounded-2xl p-5 border border-stone-200 hover:border-emerald-300 shadow-xs hover:shadow-md transition-all space-y-4"
              >
                {/* Header of Fatwa Item */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-200 font-mono font-bold text-xs">
                      #{fatwa.fatwaNumber || "بدون رقم"}
                    </span>

                    {fatwa.category && (
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-xs font-cairo">
                        {fatwa.category}
                      </span>
                    )}

                    {isPublished ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                        <Globe className="w-3 h-3" />
                        منشورة للعامة
                      </span>
                    ) : isApproved ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-bold">
                        <Clock className="w-3 h-3" />
                        معتمدة بانتظار النشر
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[11px] font-bold">
                        <AlertCircle className="w-3 h-3" />
                        بحاجة للاعتماد
                      </span>
                    )}
                  </div>

                  {/* Date & Version */}
                  <div className="text-[11px] text-stone-400 font-mono">
                    {fatwa.updated_at
                      ? new Date(fatwa.updated_at).toLocaleDateString("ar-EG", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "تاريخ غير محدد"}
                  </div>
                </div>

                {/* Content Preview */}
                <div className="space-y-2">
                  <div>
                    <h4 className="text-xs font-bold text-stone-500 font-cairo mb-1">
                      نص السؤال:
                    </h4>
                    <p className="text-sm font-bold text-stone-800 leading-relaxed">
                      {fatwa.question_clean || fatwa.question_original || "بدون نص سؤال"}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-stone-500 font-cairo mb-1">
                      جواب فضيلة الشيخ د. عبد الباري خلة:
                    </h4>
                    <p className="text-xs sm:text-sm text-stone-600 leading-relaxed line-clamp-3">
                      {fatwa.answer_clean || "لم يُسجل جواب بعد"}
                    </p>
                  </div>
                </div>

                {/* Tags */}
                {fatwa.tags && fatwa.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {fatwa.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-100">
                  {/* Left: Functional Primary Action */}
                  <div className="flex flex-wrap items-center gap-2">
                    {needsApproval ? (
                      <button
                        onClick={() => handleApproveSingle(fatwa)}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold font-cairo text-xs shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>اعتماد الفتوى ونقلها للنشر</span>
                      </button>
                    ) : isPublished ? (
                      <button
                        onClick={() => handleUnpublishSingle(fatwa)}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-rose-50 text-stone-700 hover:text-rose-700 font-bold font-cairo text-xs border border-stone-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>إلغاء النشر</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePublishSingle(fatwa)}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold font-cairo text-xs shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>نشر الفتوى الآن 🌐</span>
                      </button>
                    )}

                    {/* Dedicated Edit Button */}
                    <button
                      onClick={() => setEditingFatwa({ ...fatwa })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold font-cairo text-xs border border-stone-200/80 transition-all active:scale-95 cursor-pointer"
                      title="تعديل السؤال، الجواب، التصنيف قبل النشر"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>تعديل الفتوى</span>
                    </button>
                  </div>

                  {/* Right: Supplementary Tools */}
                  <div className="flex items-center gap-1.5">
                    {/* Share / Copy Link (for published or pending) */}
                    <button
                      onClick={() => handleCopyLink(fatwa)}
                      className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
                      title="نسخ رابط المشاركة"
                    >
                      {copiedId === fatwa.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    {/* Design Image Card */}
                    {onNavigateToCard && (
                      <button
                        onClick={() => onNavigateToCard(fatwa)}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
                        title="تصميم قالب صورة للفتوى"
                      >
                        <ImageIcon className="w-4 h-4 text-amber-600" />
                      </button>
                    )}

                    {/* Full Review Editor */}
                    {onNavigateToReview && (
                      <button
                        onClick={() => onNavigateToReview(fatwa)}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
                        title="فتح في شاشة المراجعة والتنقيح الكاملة"
                      >
                        <BookOpen className="w-4 h-4 text-emerald-600" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Publisher Edit Modal (نافذة التعديل السريع للناشر) */}
      {editingFatwa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-stone-200 max-h-[90vh] flex flex-col space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Edit3 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-cairo text-stone-900">
                    تعديل وتدقيق الفتوى #{editingFatwa.fatwaNumber}
                  </h3>
                  <p className="text-xs text-stone-500">
                    يمكن للناشر تعديل السؤال والجواب والبيانات قبل إطلاق الفتوى
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEditingFatwa(null)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 pl-1">
              {/* Question Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 font-cairo block">
                  نص السؤال (question_clean):
                </label>
                <textarea
                  rows={3}
                  value={editingFatwa.question_clean || ""}
                  onChange={(e) =>
                    setEditingFatwa({ ...editingFatwa, question_clean: e.target.value })
                  }
                  className="w-full p-3 rounded-xl border border-stone-300 text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="اكتب أو عدّل نص السؤال هنا..."
                />
              </div>

              {/* Answer Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 font-cairo block">
                  جواب فضيلة الشيخ د. عبد الباري خلة (answer_clean):
                </label>
                <textarea
                  rows={6}
                  value={editingFatwa.answer_clean || ""}
                  onChange={(e) =>
                    setEditingFatwa({ ...editingFatwa, answer_clean: e.target.value })
                  }
                  className="w-full p-3 rounded-xl border border-stone-300 text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500 font-tajawal"
                  placeholder="اكتب أو عدّل نص جواب الشيخ..."
                />
              </div>

              {/* Category & Tags Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 font-cairo block">
                    التصنيف الفقهي:
                  </label>
                  <input
                    type="text"
                    value={editingFatwa.category || ""}
                    onChange={(e) =>
                      setEditingFatwa({ ...editingFatwa, category: e.target.value })
                    }
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-cairo"
                    placeholder="مثال: فتاوى الصلاة، فتاوى المعاملات..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 font-cairo block">
                    الوسوم (مفصولة بفواصل):
                  </label>
                  <input
                    type="text"
                    value={(editingFatwa.tags || []).join("، ")}
                    onChange={(e) => {
                      const tags = e.target.value
                        .split(/[,،]/)
                        .map((t) => t.trim())
                        .filter(Boolean);
                      setEditingFatwa({ ...editingFatwa, tags });
                    }}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="صلاة, طهارة, سجود السهو..."
                  />
                </div>
              </div>

              {/* Quick Wallahu Aalam Checkbox */}
              <div className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200">
                <input
                  type="checkbox"
                  id="has_wallahu_aalam"
                  checked={editingFatwa.has_wallahu_aalam !== false}
                  onChange={(e) =>
                    setEditingFatwa({ ...editingFatwa, has_wallahu_aalam: e.target.checked })
                  }
                  className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500"
                />
                <label
                  htmlFor="has_wallahu_aalam"
                  className="text-xs text-stone-700 font-medium cursor-pointer"
                >
                  ختام الفتوى بعبارة "والله تعالى أعلم"
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingFatwa(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <div className="flex items-center gap-2">
                {/* Secondary: Just Save */}
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => handleSaveEdit(false, false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  حفظ التعديلات
                </button>

                {/* Primary Action Depending on Section */}
                {editingFatwa.status !== "منشورة" && !(editingFatwa as any).isPublic ? (
                  <button
                    type="button"
                    disabled={isSavingEdit}
                    onClick={() => handleSaveEdit(true, false)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>حفظ ونشر فوراً</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSavingEdit}
                    onClick={() => handleSaveEdit(false, false)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>حفظ التحديث</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
