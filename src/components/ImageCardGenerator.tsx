import React, { useState, useRef, useEffect } from "react";
import { toPng, toBlob } from "html-to-image";
import {
  Download,
  Copy,
  Check,
  Share2,
  Sparkles,
  Sliders,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  FileCheck2,
  PlusCircle,
  ShieldCheck,
  Award,
  CheckCircle2,
  HelpCircle,
  Eye,
  Edit3,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { Fatwa, CardTemplateSettings } from "../types";
import { sanitizeQuestionGreeting } from "../utils/greetingSanitizer";
import { cleanTashkeelText } from "../utils/tashkeelHelper";
import { getPreferredTemplateStyle, setPreferredTemplateStyle } from "../utils/storage";

interface ImageCardGeneratorProps {
  currentFatwa: Fatwa | null;
  onUpdateTemplateSettings?: (settings: CardTemplateSettings) => void;
  onUpdateFatwa?: (updated: Fatwa) => void;
  onDeleteFatwa?: (id: string) => void;
  onNavigateToTranscribe?: () => void;
  onNavigateToAdmin?: () => void;
  onOpenArabicDetails?: (fatwa: Fatwa) => void;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  embedded?: boolean;
}

// 8-Point Islamic Geometric Star Ornament matching official card exactly
const GoldIslamicStar: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M12 1L14.2 5.5L19 3.5L18 8.5L23 10.5L19.5 14L22.5 19L17.5 18.5L15.5 23.5L12 20L8.5 23.5L6.5 18.5L1.5 19L4.5 14L1 10.5L6 8.5L5 3.5L9.8 5.5L12 1Z"
      fill="#caa24d"
      stroke="#b08832"
      strokeWidth="0.5"
    />
    <circle cx="12" cy="12" r="3" fill="#fbfaf3" stroke="#caa24d" strokeWidth="0.8" />
    <circle cx="12" cy="12" r="1.3" fill="#caa24d" />
  </svg>
);

export const ImageCardGenerator: React.FC<ImageCardGeneratorProps> = ({
  currentFatwa,
  onUpdateTemplateSettings,
  onUpdateFatwa,
  onDeleteFatwa,
  onNavigateToTranscribe,
  onNavigateToAdmin,
  onOpenArabicDetails,
  showToast,
  embedded = false,
}) => {
  // Direct text editing on the card itself so transcribers can modify text and see it in the card immediately!
  const [isEditingFatwa, setIsEditingFatwa] = useState(false);
  const [editQuestionText, setEditQuestionText] = useState(
    currentFatwa?.question_clean || currentFatwa?.question_original || ""
  );
  const [editAnswerText, setEditAnswerText] = useState(
    currentFatwa?.answer_clean || currentFatwa?.transcription_raw || ""
  );

  useEffect(() => {
    if (currentFatwa) {
      setEditQuestionText(currentFatwa.question_clean || currentFatwa.question_original || "");
      setEditAnswerText(currentFatwa.answer_clean || currentFatwa.transcription_raw || "");
    }
  }, [
    currentFatwa?.id,
    currentFatwa?.question_clean,
    currentFatwa?.answer_clean,
    currentFatwa?.answer_tashkeel,
    currentFatwa?.updated_at,
  ]);

  const handleSaveCardEdit = () => {
    if (!currentFatwa) return;
    const safeQ = sanitizeQuestionGreeting(editQuestionText);
    const updated: Fatwa = {
      ...currentFatwa,
      question_clean: safeQ,
      question_original: sanitizeQuestionGreeting(currentFatwa.question_original || safeQ),
      question_tashkeel: safeQ,
      answer_clean: editAnswerText,
      answer_tashkeel: editAnswerText,
      reviewed: true,
      updated_at: new Date().toISOString(),
    };
    if (onUpdateFatwa) {
      onUpdateFatwa(updated);
    }
    setIsEditingFatwa(false);
    showToast("تم تحديث نص الفتوى داخل القالب ومزامنة التعديلات بنجاح! ✓", "success");
  };

  // Preferred default template across application (defaults to official_khalla)
  const [preferredDefault, setPreferredDefault] = useState<"official_khalla" | "classic" | "uthmanic">(
    () => getPreferredTemplateStyle()
  );

  // 1. Template style
  const [templateStyle, setTemplateStyle] = useState<"official_khalla" | "classic" | "uthmanic">(
    currentFatwa?.template_settings?.templateStyle || getPreferredTemplateStyle()
  );

  useEffect(() => {
    const handleTemplateChanged = (e: any) => {
      const newStyle = e.detail || getPreferredTemplateStyle();
      setPreferredDefault(newStyle);
    };
    window.addEventListener("default-template-changed", handleTemplateChanged);
    return () => window.removeEventListener("default-template-changed", handleTemplateChanged);
  }, []);

  // Check if answer_tashkeel is out of sync with answer_clean (due to manual editing)
  const bareTashkeel = (currentFatwa?.answer_tashkeel || "").replace(/[\u064B-\u065F\u0670\s]/g, "");
  const bareClean = (currentFatwa?.answer_clean || "").replace(/[\u064B-\u065F\u0670\s]/g, "");
  const hasStaleTashkeel = bareTashkeel.length > 0 && bareClean.length > 0 && bareTashkeel !== bareClean;

  const [useTashkeelText, setUseTashkeelText] = useState<boolean>(
    !!currentFatwa?.answer_tashkeel && !hasStaleTashkeel
  );

  // 2. Aspect ratio / sizing (defaults to square 1:1 for perfect social and print card)
  const [aspectRatio, setAspectRatio] = useState<"auto" | "1:1" | "4:5" | "9:16">(
    currentFatwa?.template_settings?.aspectRatio && currentFatwa.template_settings.aspectRatio !== "auto"
      ? currentFatwa.template_settings.aspectRatio
      : "1:1"
  );

  // 3. Theme selector (for classic template only)
  const [theme, setTheme] = useState<"emerald" | "warm-sand" | "navy" | "monochrome" | "olive">(
    currentFatwa?.template_settings?.theme || "emerald"
  );

  // 4. Font size scaling
  const [fontSize, setFontSize] = useState<"auto" | "sm" | "md" | "lg">(
    currentFatwa?.template_settings?.fontSize || "auto"
  );

  // 5. Toggles
  const [showWallahuAalam, setShowWallahuAalam] = useState<boolean>(true);
  const [showFatwaNumber, setShowFatwaNumber] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"preview" | "settings">("preview");

  // Pagination for classic template
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);

  // Sync state when currentFatwa changes
  useEffect(() => {
    if (currentFatwa) {
      setTemplateStyle(
        currentFatwa.template_settings?.templateStyle || getPreferredTemplateStyle()
      );
      setUseTashkeelText(!!currentFatwa.answer_tashkeel && !hasStaleTashkeel);
      setAspectRatio(currentFatwa.template_settings?.aspectRatio || "auto");
      setTheme(currentFatwa.template_settings?.theme || "emerald");
      setFontSize(currentFatwa.template_settings?.fontSize || "auto");
      setShowWallahuAalam(true);
      setCurrentPage(1);
    }
  }, [
    currentFatwa?.id,
    currentFatwa?.question_clean,
    currentFatwa?.answer_clean,
    currentFatwa?.answer_tashkeel,
    currentFatwa?.fatwaType,
    currentFatwa?.updated_at,
    hasStaleTashkeel,
  ]);

  const handleSetAsDefault = (style: "official_khalla" | "classic" | "uthmanic", label: string) => {
    setPreferredTemplateStyle(style);
    setPreferredDefault(style);
    setTemplateStyle(style);
    triggerSaveSettings({ templateStyle: style });
    showToast(`تم ضبط ${label} كقالب افتراضي بعد التفريغ بنجاح!`, "success");
  };

  // Persist template settings change
  const triggerSaveSettings = (updates: Partial<CardTemplateSettings>) => {
    if (onUpdateTemplateSettings && currentFatwa) {
      onUpdateTemplateSettings({
        ...currentFatwa.template_settings,
        templateStyle,
        aspectRatio,
        theme,
        fontSize,
        showWallahuAalam,
        showFatwaNumber,
        ...updates,
      });
    }
  };

  if (!currentFatwa) {
    return (
      <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-stone-200 shadow-xs max-w-xl mx-auto my-8 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto border border-teal-200/60">
          <BookOpen className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold font-cairo text-stone-800">
          اختر فتوى لتصميم بطاقة النشر
        </h3>
        <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
          يرجى تفريغ فتوى جديدة أو اختيار فتوى من الأرشيف لإنشاء وتخصيص بطاقات صور مصممة للنشر.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
          {onNavigateToAdmin && (
            <button
              onClick={onNavigateToAdmin}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#0c3a2d] hover:bg-[#14532d] text-white font-bold font-cairo text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300" />
              <span>العودة إلى لوحة الإدارة</span>
            </button>
          )}
          {onNavigateToTranscribe && (
            <button
              onClick={onNavigateToTranscribe}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-cairo text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>تفريغ فتوى جديدة الآن</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Question & Answer texts (Instant live synchronization during edit)
  const cleanQ = sanitizeQuestionGreeting(
    isEditingFatwa
      ? editQuestionText
      : currentFatwa.question_clean || currentFatwa.question_original || ""
  );

  const activeAnswerText = isEditingFatwa
    ? editAnswerText
    : currentFatwa.answer_clean || currentFatwa.transcription_raw || "";

  const rawAnswer =
    !isEditingFatwa &&
    !hasStaleTashkeel &&
    (useTashkeelText || templateStyle === "uthmanic") &&
    currentFatwa.answer_tashkeel
      ? currentFatwa.answer_tashkeel
      : activeAnswerText;

  // Smart Adaptive Typography calculation matching original image proportions
  const getAdaptiveFont = (textLength: number) => {
    if (fontSize === "sm") {
      return {
        answerText: "text-[13px] sm:text-[14px]",
        answerLeading: "leading-6 sm:leading-7",
        qText: "text-[13px] sm:text-[14px]",
        label: "صغير (مدمج)",
      };
    }
    if (fontSize === "md") {
      return {
        answerText: "text-[15px] sm:text-[16.5px]",
        answerLeading: "leading-7 sm:leading-8",
        qText: "text-[14px] sm:text-[15.5px]",
        label: "متوسط (قياسي كالأصل)",
      };
    }
    if (fontSize === "lg") {
      return {
        answerText: "text-base sm:text-[18px]",
        answerLeading: "leading-8 sm:leading-9",
        qText: "text-[15px] sm:text-[17px]",
        label: "كبير وبارز",
      };
    }

    // "auto" Smart Adaptive mode:
    if (textLength < 160) {
      return {
        answerText: "text-base sm:text-[18px] font-normal",
        answerLeading: "leading-8 sm:leading-9",
        qText: "text-[15px] sm:text-[17px] font-medium",
        label: "تلقائي ذكي (كبير)",
      };
    }
    if (textLength < 450) {
      return {
        answerText: "text-[14.5px] sm:text-[16px] font-normal",
        answerLeading: "leading-7 sm:leading-8",
        qText: "text-[14px] sm:text-[15px] font-medium",
        label: "تلقائي ذكي (قياسي كالأصل)",
      };
    }
    if (textLength < 800) {
      return {
        answerText: "text-[13.5px] sm:text-[14.5px] font-normal",
        answerLeading: "leading-6 sm:leading-7",
        qText: "text-[13px] sm:text-[14px] font-medium",
        label: "تلقائي ذكي (مدمج)",
      };
    }
    return {
      answerText: "text-[12px] sm:text-[13px] font-normal",
      answerLeading: "leading-5 sm:leading-6",
      qText: "text-[12px] sm:text-[12.5px] font-medium",
      label: "تلقائي ذكي (مكثف لطول الفتوى)",
    };
  };

  const adaptive = getAdaptiveFont(rawAnswer.length);

  // Pagination logic (only used for classic template)
  const paragraphs = rawAnswer.split("\n\n").filter(Boolean);
  const maxCharsPerPage =
    aspectRatio === "9:16" ? 650 : aspectRatio === "4:5" ? 500 : 380;

  const pages: string[] = [];
  let currentAccumulator = "";

  for (const p of paragraphs) {
    if ((currentAccumulator + "\n\n" + p).length > maxCharsPerPage && currentAccumulator.length > 0) {
      pages.push(currentAccumulator.trim());
      currentAccumulator = p;
    } else {
      currentAccumulator = currentAccumulator ? currentAccumulator + "\n\n" + p : p;
    }
  }
  if (currentAccumulator.trim().length > 0) {
    pages.push(currentAccumulator.trim());
  }

  const totalPages =
    templateStyle === "official_khalla" || templateStyle === "uthmanic"
      ? 1
      : Math.max(1, pages.length);
  const activePageText =
    templateStyle === "official_khalla" || templateStyle === "uthmanic"
      ? rawAnswer
      : pages[currentPage - 1] || rawAnswer;

  // Classic Theme Palettes
  const getThemeStyles = () => {
    switch (theme) {
      case "warm-sand":
        return {
          bg: "bg-[#fbf7ee]",
          border: "border-[#e0d6c3]",
          accentBg: "bg-[#8b5a2b]",
          accentText: "text-[#8b5a2b]",
          badgeBg: "bg-[#e8dec8]",
          badgeText: "text-[#5a3818]",
          questionBox: "bg-[#f4ebd9] border-[#decbb0]",
          answerText: "text-[#2e261d]",
          goldDecor: "border-[#b37d47]",
        };
      case "navy":
        return {
          bg: "bg-[#0f172a]",
          border: "border-[#1e293b]",
          accentBg: "bg-[#38bdf8]",
          accentText: "text-[#38bdf8]",
          badgeBg: "bg-[#1e293b]",
          badgeText: "text-[#7dd3fc]",
          questionBox: "bg-[#1e293b]/90 border-[#334155]",
          answerText: "text-[#f1f5f9]",
          goldDecor: "border-[#38bdf8]",
        };
      case "monochrome":
        return {
          bg: "bg-[#18181b]",
          border: "border-[#27272a]",
          accentBg: "bg-[#e4e4e7]",
          accentText: "text-[#fafafa]",
          badgeBg: "bg-[#27272a]",
          badgeText: "text-[#d4d4d8]",
          questionBox: "bg-[#27272a]/90 border-[#3f3f46]",
          answerText: "text-[#f4f4f5]",
          goldDecor: "border-[#71717a]",
        };
      case "olive":
        return {
          bg: "bg-[#f7f9f4]",
          border: "border-[#dce5d0]",
          accentBg: "bg-[#4d6b38]",
          accentText: "text-[#4d6b38]",
          badgeBg: "bg-[#e2eccf]",
          badgeText: "text-[#2f4420]",
          questionBox: "bg-[#ecf4de] border-[#cbdcb5]",
          answerText: "text-[#243319]",
          goldDecor: "border-[#84a95a]",
        };
      case "emerald":
      default:
        return {
          bg: "bg-[#f6faf8]",
          border: "border-[#cce5dc]",
          accentBg: "bg-[#065f46]",
          accentText: "text-[#065f46]",
          badgeBg: "bg-[#d1fae5]",
          badgeText: "text-[#065f46]",
          questionBox: "bg-[#e6f4ee] border-[#b6e2d3]",
          answerText: "text-[#132a22]",
          goldDecor: "border-[#d97706]",
        };
    }
  };

  const themeStyle = getThemeStyles();

  // Export options for crisp, high-definition Arabic typography (exact scale)
  const exportOptions = {
    cacheBust: true,
    pixelRatio: 2.5,
    skipFonts: true,
  };

  // Export as PNG
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, exportOptions);
      const link = document.createElement("a");
      link.download = `فتوى_${currentFatwa.fatwaNumber || "الشيخ_عبد_الباري"}_${
        templateStyle === "official_khalla"
          ? "رسمية"
          : templateStyle === "uthmanic"
          ? "خط_عثماني"
          : `صفحة_${currentPage}`
      }.png`;
      link.href = dataUrl;
      link.click();
      showToast("تم تنزيل بطاقة الفتوى بدقة عالية بنجاح!", "success");
    } catch (err) {
      console.error("Export error:", err);
      showToast("حدث خطأ أثناء تصدير الصورة.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // Copy to Clipboard
  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      const blob = await toBlob(cardRef.current, exportOptions);
      if (blob && navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ "image/png": blob }),
        ]);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
        showToast("تم نسخ صورة الفتوى إلى الحافظة بنجاح!", "success");
      } else {
        handleDownloadImage();
      }
    } catch (err) {
      console.error(err);
      handleDownloadImage();
    } finally {
      setIsExporting(false);
    }
  };

  // Web Share API
  const handleShare = async () => {
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      const blob = await toBlob(cardRef.current, exportOptions);
      if (blob && navigator.canShare && navigator.share) {
        const file = new File([blob], `فتوى_الشيخ_عبد_الباري_${currentFatwa.fatwaNumber || ""}.png`, {
          type: "image/png",
        });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "فتوى فضيلة الشيخ د. عبد الباري خلة",
            text: cleanQ,
            files: [file],
          });
          showToast("تم فتح خيارات المشاركة بنجاح!", "success");
          return;
        }
      }
      handleCopyImage();
    } catch (err) {
      console.warn("Share failed or cancelled:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div id="image-card-section" className="space-y-5 max-w-7xl mx-auto scroll-mt-6">
      {/* Top Header Controls Bar */}
      <div
        className={`bg-white rounded-2xl p-4 sm:p-5 border ${
          embedded ? "border-emerald-200 shadow-sm" : "border-stone-200 shadow-xs"
        } flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4`}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#0c3a2d] text-amber-300 flex items-center gap-1 shadow-2xs">
              <Award className="w-3.5 h-3.5 text-amber-300" />
              <span>القالب الرسمي المعتمد طبق الأصل</span>
            </span>
            <span className="text-xs text-stone-500 font-medium hidden sm:inline">
              دقة عالية وتطابق 100% مع النموذج الأصلي
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold font-cairo text-stone-900">
            {embedded ? "بطاقة الفتوى المصممة (معاينة وتحميل)" : "بطاقة الفتوى الرسمية للنشر"}
          </h2>
        </div>

        {/* Action Export Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
          {onNavigateToAdmin && (
            <button
              onClick={onNavigateToAdmin}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#0c3a2d] hover:bg-[#14532d] text-white shadow-xs border border-emerald-700/60 transition-all active:scale-95 cursor-pointer"
              title="الرجوع إلى لوحة تحكم الإدارة المركزية"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
              <span>لوحة الإدارة</span>
            </button>
          )}

          <button
            onClick={handleShare}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 transition-all cursor-pointer disabled:opacity-50"
            title="مشاركة الصورة"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden sm:inline">مشاركة</span>
          </button>

          <button
            onClick={handleCopyImage}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 transition-all cursor-pointer disabled:opacity-50"
          >
            {copiedImage ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>تم النسخ!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الصورة</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsEditingFatwa(!isEditingFatwa)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-cairo border transition-all cursor-pointer ${
              isEditingFatwa
                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm"
                : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shadow-2xs"
            }`}
            title="تعديل نصوص الفتوى وملاحظة التحديث الفوري داخل القالب"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>{isEditingFatwa ? "إغلاق التحرير ✕" : "تعديل نص الفتوى ✏️"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `هل أنت متأكد تماماً من حذف الفتوى #${currentFatwa.fatwaNumber || ""} نهائياً؟\nسيتم تسجيل الحذف سحابياً ومحلياً ولن تظهر في البطاقات أو الأرشيف.`
                )
              ) {
                if (onDeleteFatwa) {
                  onDeleteFatwa(currentFatwa.id);
                } else {
                  showToast("تعذر استدعاء دالة الحذف", "error");
                }
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-cairo bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-300 shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="حذف هذه الفتوى نهائياً ومزامنة الحذف"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>حذف الفتوى</span>
          </button>

          <button
            onClick={handleDownloadImage}
            disabled={isExporting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0c3a2d] hover:bg-[#14532d] text-white shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-amber-300" />
            <span>{isExporting ? "جارٍ التصدير..." : "تحميل البطاقة (PNG)"}</span>
          </button>
        </div>
      </div>

      {/* Inline Fatwa Content Editor (Updates the card in real-time) */}
      {isEditingFatwa && (
        <div className="bg-gradient-to-r from-amber-50 via-white to-amber-50 rounded-2xl p-5 border-2 border-amber-300 shadow-md space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-amber-200 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Edit3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-cairo text-stone-900">
                  تعديل نص الفتوى وملاحظة التحديث الفوري داخل القالب
                </h3>
                <p className="text-[11px] text-stone-500">
                  أي تعديل تكتبه هنا ينعكس مباشرة ولحظياً على بطاقة القالب الرسمية بالأسفل
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingFatwa(false)}
              className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 flex items-center justify-between">
                <span>نص السؤال:</span>
                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                  معاينة حية في القالب ⚡
                </span>
              </label>
              <textarea
                rows={3}
                value={editQuestionText}
                onChange={(e) => setEditQuestionText(e.target.value)}
                className="w-full p-3 rounded-xl border border-stone-300 bg-white text-stone-900 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="اكتب أو عدل نص السؤال..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 flex items-center justify-between">
                <span>نص جواب فضيلة الشيخ:</span>
                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                  تحديث فوري بالبطاقة ⚡
                </span>
              </label>
              <textarea
                rows={6}
                value={editAnswerText}
                onChange={(e) => setEditAnswerText(e.target.value)}
                className="w-full p-3 rounded-xl border border-stone-300 bg-white text-stone-900 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none leading-relaxed font-tajawal"
                placeholder="اكتب أو عدل نص جواب الشيخ..."
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/80">
            <button
              type="button"
              onClick={() => setIsEditingFatwa(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 border border-stone-300 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSaveCardEdit}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0c3a2d] hover:bg-[#14532d] text-white shadow-sm cursor-pointer active:scale-95"
            >
              <Save className="w-3.5 h-3.5 text-amber-300" />
              <span>حفظ وتثبيت التعديل في القالب والبيانات ✓</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile-Friendly Toggle Bar (Preview vs Settings) */}
      <div className="lg:hidden flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
        <button
          type="button"
          onClick={() => setActiveTab("preview")}
          className={`flex-1 py-2 text-xs font-bold font-cairo rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "preview" ? "bg-white text-emerald-900 shadow-2xs" : "text-stone-600"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>معاينة البطاقة الحية</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`flex-1 py-2 text-xs font-bold font-cairo rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "settings" ? "bg-white text-emerald-900 shadow-2xs" : "text-stone-600"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>تخصيص القالب والخط</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Settings Column (4 cols on desktop) */}
        <div
          className={`lg:col-span-4 bg-white rounded-2xl p-5 border border-stone-200 shadow-xs space-y-4 ${
            activeTab === "settings" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
            <Sliders className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold font-cairo text-stone-900">
              خيارات وتخصيص القالب
            </h3>
          </div>

          {/* 1. Template Style Switcher */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-700 block">
              نمط القالب:
            </label>
            <div className="grid grid-cols-1 gap-2">
              <div
                role="button"
                tabIndex={0}
                id="template-style-official-btn"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setTemplateStyle("official_khalla");
                    triggerSaveSettings({ templateStyle: "official_khalla" });
                    if (preferredDefault !== "official_khalla") {
                      handleSetAsDefault("official_khalla", "قالب الصفحة الرسمية");
                    }
                  }
                }}
                onClick={() => {
                  setTemplateStyle("official_khalla");
                  triggerSaveSettings({ templateStyle: "official_khalla" });
                  if (preferredDefault !== "official_khalla") {
                    handleSetAsDefault("official_khalla", "قالب الصفحة الرسمية");
                  }
                }}
                className={`p-3 rounded-2xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  templateStyle === "official_khalla"
                    ? "bg-emerald-50/80 border-[#0c3a2d] ring-2 ring-[#0c3a2d]/20 shadow-xs"
                    : "bg-stone-50 border-stone-200 hover:bg-stone-100/70"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    templateStyle === "official_khalla"
                      ? "bg-[#0c3a2d] text-amber-300"
                      : "border border-stone-300 bg-white"
                  }`}
                >
                  {templateStyle === "official_khalla" && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs font-cairo text-stone-900">
                      قالب الصفحة الرسمية (المعتمد الأصلي)
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300/80">
                      طبق الأصل
                    </span>
                    {preferredDefault === "official_khalla" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0c3a2d] text-amber-300 border border-[#0c3a2d] flex items-center gap-1 shadow-2xs">
                        <CheckCircle2 className="w-3 h-3 text-amber-300" />
                        <span>القالب الافتراضي بعد التفريغ</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                    إطار أخضر رفيع مع إطار داخلي مذهب، ترويسات الصناديق خضراء ملكية، والتذييل الأندلسي المعتمد.
                  </p>
                  <div className="mt-2.5 pt-2 border-t border-stone-200/80 flex items-center justify-between flex-wrap gap-1.5">
                    {preferredDefault === "official_khalla" ? (
                      <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        <span>معتمد تلقائياً كقالب افتراضي لجميع الفتاوى المفرغة</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetAsDefault("official_khalla", "قالب الصفحة الرسمية");
                        }}
                        className="text-[11px] font-bold text-[#0c3a2d] bg-amber-100/90 hover:bg-amber-200 text-amber-950 px-2.5 py-1 rounded-lg border border-amber-300 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      >
                        <Sparkles className="w-3 h-3 text-amber-700" />
                        <span>ضبط كقالب افتراضي بعد التفريغ</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setTemplateStyle("classic");
                    triggerSaveSettings({ templateStyle: "classic" });
                  }
                }}
                onClick={() => {
                  setTemplateStyle("classic");
                  triggerSaveSettings({ templateStyle: "classic" });
                }}
                className={`p-3 rounded-2xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  templateStyle === "classic"
                    ? "bg-emerald-50/80 border-emerald-600 ring-2 ring-emerald-600/20 shadow-xs"
                    : "bg-stone-50 border-stone-200 hover:bg-stone-100/70"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    templateStyle === "classic"
                      ? "bg-emerald-600 text-white"
                      : "border border-stone-300 bg-white"
                  }`}
                >
                  {templateStyle === "classic" && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs font-cairo text-stone-900 block">
                      القالب الكلاسيكي الملون
                    </span>
                    {preferredDefault === "classic" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-700 text-white flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>القالب الافتراضي بعد التفريغ</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                    أنماط لونية متعددة مع إمكانية تقسيم الإجابات الطويلة إلى صفحات متعاقبة.
                  </p>
                  <div className="mt-2.5 pt-2 border-t border-stone-200/80 flex items-center justify-between flex-wrap gap-1.5">
                    {preferredDefault === "classic" ? (
                      <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        <span>معتمد تلقائياً كقالب افتراضي بعد التفريغ</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetAsDefault("classic", "القالب الكلاسيكي");
                        }}
                        className="text-[10px] font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded-md border border-stone-300 transition-all cursor-pointer"
                      >
                        تعيين كافتراضي بعد التفريغ
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* بطاقة الخط العثماني (مصحف شريف / تشكيل كامل) */}
              <div
                role="button"
                tabIndex={0}
                id="template-style-uthmanic-btn"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setTemplateStyle("uthmanic");
                    setAspectRatio("1:1");
                    triggerSaveSettings({ templateStyle: "uthmanic", aspectRatio: "1:1" });
                  }
                }}
                onClick={() => {
                  setTemplateStyle("uthmanic");
                  setAspectRatio("1:1");
                  triggerSaveSettings({ templateStyle: "uthmanic", aspectRatio: "1:1" });
                }}
                className={`p-3 rounded-2xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  templateStyle === "uthmanic"
                    ? "bg-amber-50/90 border-[#996515] ring-2 ring-[#996515]/20 shadow-xs"
                    : "bg-stone-50 border-stone-200 hover:bg-stone-100/70"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    templateStyle === "uthmanic"
                      ? "bg-[#996515] text-amber-100"
                      : "border border-stone-300 bg-white"
                  }`}
                >
                  {templateStyle === "uthmanic" && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs font-cairo text-stone-900">
                      بطاقة الخط العثماني (مصحف شريف / تشكيل كامل)
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200/90 text-amber-950 border border-amber-400">
                      رسم عثماني 📜
                    </span>
                    {preferredDefault === "uthmanic" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#996515] text-amber-100 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>القالب الافتراضي بعد التفريغ</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                    خط قرآني عثماني مذهب ومضبوط، بسملة خطية ﷽، تشكيل كامل وصحيح للأدلة والآيات ﴿ ﴾، وإطار مصحفي فاخر.
                  </p>
                  <div className="mt-2.5 pt-2 border-t border-stone-200/80 flex items-center justify-between flex-wrap gap-1.5">
                    {preferredDefault === "uthmanic" ? (
                      <span className="text-[11px] font-bold text-[#996515] flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-[#996515]" />
                        <span>معتمد تلقائياً كقالب افتراضي بعد التفريغ</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetAsDefault("uthmanic", "بطاقة الخط العثماني");
                        }}
                        className="text-[10px] font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded-md border border-stone-300 transition-all cursor-pointer"
                      >
                        تعيين كافتراضي بعد التفريغ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tashkeel text toggle when available */}
            {currentFatwa.answer_tashkeel && (
              <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-300 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold font-cairo text-amber-950 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>نص مشكول متوفر:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setUseTashkeelText(!useTashkeelText)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] font-cairo transition-all cursor-pointer ${
                      useTashkeelText
                        ? "bg-amber-600 text-white shadow-2xs"
                        : "bg-white text-stone-600 border border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {useTashkeelText ? "مفعّل: نص مشكول ✓" : "تفعيل التشكيل"}
                  </button>
                </div>
                <p className="text-[11px] text-amber-900/80 font-tajawal">
                  يعرض النص المشكول والمضبوط لغوياً وفقهياً داخل البطاقة.
                </p>
              </div>
            )}
          </div>

          {/* 2. Aspect Ratio */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-700 block">
              مقاس وشكل البطاقة:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAspectRatio("auto");
                  triggerSaveSettings({ aspectRatio: "auto" });
                }}
                className={`p-2.5 rounded-xl text-xs font-semibold border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  aspectRatio === "auto"
                    ? "bg-emerald-50 text-emerald-900 border-emerald-500 shadow-2xs font-bold ring-1 ring-emerald-400"
                    : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                }`}
              >
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>تلقائي متناسق (الأصل)</span>
                </span>
                <span className="text-[10px] text-stone-400">حسب طول الفتوى</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAspectRatio("4:5");
                  triggerSaveSettings({ aspectRatio: "4:5" });
                }}
                className={`p-2.5 rounded-xl text-xs font-semibold border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  aspectRatio === "4:5"
                    ? "bg-emerald-50 text-emerald-900 border-emerald-500 shadow-2xs font-bold"
                    : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                }`}
              >
                <span className="font-bold font-mono">4:5 طولي</span>
                <span className="text-[10px] text-stone-400">إنستغرام وفيسبوك</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAspectRatio("9:16");
                  triggerSaveSettings({ aspectRatio: "9:16" });
                }}
                className={`p-2.5 rounded-xl text-xs font-semibold border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  aspectRatio === "9:16"
                    ? "bg-emerald-50 text-emerald-900 border-emerald-500 shadow-2xs font-bold"
                    : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                }`}
              >
                <span className="font-bold font-mono">9:16 ستوري</span>
                <span className="text-[10px] text-stone-400">حالات وقصص</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAspectRatio("1:1");
                  triggerSaveSettings({ aspectRatio: "1:1" });
                }}
                className={`p-2.5 rounded-xl text-xs font-semibold border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  aspectRatio === "1:1"
                    ? "bg-emerald-50 text-emerald-900 border-emerald-500 shadow-2xs font-bold"
                    : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                }`}
              >
                <span className="font-bold font-mono">1:1 مربع</span>
                <span className="text-[10px] text-stone-400">منشور مربع</span>
              </button>
            </div>
          </div>

          {/* 3. Typography & Smart Scaling */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-700 block">
                حجم خط الفتوى:
              </label>
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {adaptive.label}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(["auto", "sm", "md", "lg"] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => {
                    setFontSize(sz);
                    triggerSaveSettings({ fontSize: sz });
                  }}
                  className={`py-2 px-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    fontSize === sz
                      ? "bg-emerald-50 text-emerald-900 border-emerald-500 font-bold shadow-2xs ring-1 ring-emerald-400"
                      : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                  }`}
                >
                  <span>{sz === "auto" ? "✨ ذكي" : sz === "sm" ? "صغير" : sz === "md" ? "متوسط" : "كبير"}</span>
                  <span className="text-[9px] text-stone-400">
                    {sz === "auto" ? "تلقائي" : sz === "sm" ? "مكثف" : sz === "md" ? "قياسي" : "موسع"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Classic Theme Colors (only if classic template is chosen) */}
          {templateStyle === "classic" && (
            <div className="space-y-2 animate-fadeIn">
              <label className="text-xs font-bold text-stone-700 block">
                النمط اللوني:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("emerald")}
                  className={`p-2 rounded-xl text-xs font-medium border text-right flex items-center gap-2 cursor-pointer ${
                    theme === "emerald" ? "border-emerald-600 bg-emerald-50 font-bold" : "border-stone-200 bg-stone-50"
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-700 shrink-0"></span>
                  <span>الزمردي الكلاسيكي</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("warm-sand")}
                  className={`p-2 rounded-xl text-xs font-medium border text-right flex items-center gap-2 cursor-pointer ${
                    theme === "warm-sand" ? "border-amber-700 bg-amber-50 font-bold" : "border-stone-200 bg-stone-50"
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-700 shrink-0"></span>
                  <span>الرملي الأندلسي</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("navy")}
                  className={`p-2 rounded-xl text-xs font-medium border text-right flex items-center gap-2 cursor-pointer ${
                    theme === "navy" ? "border-blue-700 bg-blue-50 font-bold" : "border-stone-200 bg-stone-50"
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-blue-950 shrink-0"></span>
                  <span>الكحلي الملكي</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("olive")}
                  className={`p-2 rounded-xl text-xs font-medium border text-right flex items-center gap-2 cursor-pointer ${
                    theme === "olive" ? "border-lime-800 bg-lime-50 font-bold" : "border-stone-200 bg-stone-50"
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#4d6b38] shrink-0"></span>
                  <span>الزيتوني المذهب</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. Toggles */}
          <div className="pt-2 border-t border-stone-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-stone-800 block">
                  إظهار خاتمة "والله تعالى أعلم":
                </span>
                <span className="text-[10px] text-stone-500">
                  ختام أدبي شرعي موثوق
                </span>
              </div>
              <input
                type="checkbox"
                checked={showWallahuAalam}
                onChange={(e) => {
                  setShowWallahuAalam(e.target.checked);
                  triggerSaveSettings({ showWallahuAalam: e.target.checked });
                }}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800">
                إظهار رقم الفتوى والتاريخ:
              </span>
              <input
                type="checkbox"
                checked={showFatwaNumber}
                onChange={(e) => {
                  setShowFatwaNumber(e.target.checked);
                  triggerSaveSettings({ showFatwaNumber: e.target.checked });
                }}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* 5. Pagination selector (Classic template only) */}
          {templateStyle === "classic" && totalPages > 1 && (
            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-cairo text-stone-800">
                  تقسيم الصفحات للجواب الطويل:
                </span>
                <span className="text-xs font-bold text-emerald-700">
                  صفحة {currentPage} من {totalPages}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg bg-white border border-stone-300 disabled:opacity-40 text-stone-700 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold cursor-pointer ${
                        currentPage === p
                          ? "bg-emerald-600 text-white"
                          : "bg-white border border-stone-200 text-stone-700"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg bg-white border border-stone-300 disabled:opacity-40 text-stone-700 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {templateStyle === "official_khalla" && (
            <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/80 text-[11px] text-emerald-950 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>القالب المعتمد نشط:</strong> الفتوى تظهر كاملة في بطاقة واحدة مستمرة طبق الأصل بنسب دقيقة ومريحة للعين.
              </span>
            </div>
          )}

          {/* Action button inside mobile settings tab */}
          <div className="lg:hidden pt-2">
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className="w-full py-2.5 bg-[#0c3a2d] text-white rounded-xl font-bold font-cairo text-xs flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4 text-amber-300" />
              <span>العودة لمعاينة البطاقة</span>
            </button>
          </div>
        </div>

        {/* Live Card Canvas (8 cols on desktop) */}
        <div
          className={`lg:col-span-8 flex flex-col items-center justify-center ${
            activeTab === "preview" ? "block" : "hidden lg:block"
          }`}
        >
          {/* Card Viewer Canvas Container */}
          <div className="p-2 sm:p-6 bg-stone-100/90 rounded-3xl border border-stone-300/80 shadow-inner w-full flex items-center justify-center overflow-x-auto">
            {/* TEMPLATE 1: OFFICIAL SHEIKH ABDUL BARI KHALLA TEMPLATE (EXACT REPLICA) */}
            {templateStyle === "official_khalla" ? (
              <div
                ref={cardRef}
                dir="rtl"
                style={{
                  width:
                    aspectRatio === "9:16"
                      ? "480px"
                      : aspectRatio === "4:5"
                      ? "520px"
                      : aspectRatio === "1:1"
                      ? "520px"
                      : "530px",
                  minHeight:
                    aspectRatio === "9:16"
                      ? "850px"
                      : aspectRatio === "4:5"
                      ? "650px"
                      : aspectRatio === "1:1"
                      ? "520px"
                      : "auto",
                }}
                className="bg-[#fbfaf3] border-[3px] border-[#0c3a2d] rounded-[22px] p-[7px] sm:p-[9px] relative shadow-2xl transition-all select-none flex flex-col justify-between"
              >
                {/* Inner Gold Border Frame with identical proportions */}
                <div className="bg-[#fbfaf3] border-[1.6px] border-[#caa24d] rounded-[15px] p-4 sm:p-6 flex-1 flex flex-col justify-between relative overflow-hidden">
                  {/* Optional Number and Date bar */}
                  {showFatwaNumber && (
                    <div className="flex items-center justify-between text-[11px] font-mono text-stone-600 pb-2 mb-2 border-b border-[#caa24d]/30">
                      <span className="font-bold text-[#0c3a2d] bg-[#caa24d]/20 px-2 py-0.5 rounded-md">
                        فتوى رقم: #{currentFatwa.fatwaNumber || "عامة"}
                      </span>
                      <span>
                        {new Date(currentFatwa.created_at || Date.now()).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                  )}

                  {/* Top Circular Emblem (100% Complete Circle) */}
                  <div className="flex flex-col items-center justify-center pt-1 pb-2 sm:pb-3">
                    <div className="relative flex items-center justify-center">
                      <img
                        src="/sheikh-emblem-complete.png"
                        alt="فضيلة الدكتور عبد الباري محمد خلة - الصفحة الرسمية للفتاوى"
                        className="w-44 h-44 sm:w-48 sm:h-48 object-contain drop-shadow-2xs select-none"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/sheikh-emblem-perfect.png";
                        }}
                      />
                    </div>
                  </div>

                  {/* Question and Answer Boxes Stack */}
                  <div className="space-y-4 sm:space-y-5 flex-1 flex flex-col justify-start">
                    {/* 1. Question Box (Identical to original) */}
                    <div className="rounded-xl overflow-hidden shadow-2xs">
                      {/* Question Dark Emerald Header */}
                      <div className="bg-[#0c3a2d] text-white font-bold text-center py-2 px-4 text-sm sm:text-base font-cairo flex items-center justify-center">
                        <span>السؤال:</span>
                      </div>
                      {/* Question Text Body */}
                      <div className="bg-white border-x-[1.8px] border-b-[1.8px] border-[#caa24d] rounded-b-xl p-4 sm:p-5 text-right">
                        <p className={`font-tajawal text-stone-900 leading-relaxed font-semibold ${adaptive.qText}`}>
                          {cleanQ}
                        </p>
                      </div>
                    </div>

                    {/* 2. Answer Box (Identical to original) */}
                    <div className="rounded-xl overflow-hidden shadow-2xs flex-1 flex flex-col">
                      {/* Answer Dark Emerald Header */}
                      <div className="bg-[#0c3a2d] text-white font-bold text-center py-2 px-4 text-sm sm:text-base font-cairo flex items-center justify-center">
                        <span>جواب فضيلة الشيخ د. عبد الباري محمد خلة:</span>
                      </div>
                      {/* Answer Text Body */}
                      <div className="bg-white border-x-[1.8px] border-b-[1.8px] border-[#caa24d] rounded-b-xl p-4 sm:p-6 text-right flex-1 flex flex-col justify-between">
                        <div
                          className={`font-tajawal text-stone-900 whitespace-pre-line leading-relaxed ${adaptive.answerText} ${adaptive.answerLeading}`}
                        >
                          {rawAnswer}
                        </div>

                        {showWallahuAalam &&
                          !rawAnswer.includes("والله أعلم") &&
                          !rawAnswer.includes("والله تعالى أعلم") && (
                            <div className="text-left font-amiri font-bold text-[#0c3a2d] text-sm sm:text-base mt-4 pt-2 border-t border-stone-200/60">
                              والله تعالى أعلم
                            </div>
                          )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Footer Ribbon with Gold Stars */}
                  <div className="pt-4 sm:pt-5 mt-4 sm:mt-5 flex items-center justify-center gap-2 sm:gap-3 text-[#0c3a2d] text-xs sm:text-sm font-bold font-cairo select-none">
                    <div className="h-[1px] bg-gradient-to-r from-transparent via-[#caa24d] to-[#caa24d] flex-1 max-w-[60px] sm:max-w-[80px]" />
                    <GoldIslamicStar className="w-4 h-4 text-[#caa24d]" />
                    <span className="tracking-wide font-bold">الصفحة الرسمية للفتاوى</span>
                    <GoldIslamicStar className="w-4 h-4 text-[#caa24d]" />
                    <div className="h-[1px] bg-gradient-to-l from-transparent via-[#caa24d] to-[#caa24d] flex-1 max-w-[60px] sm:max-w-[80px]" />
                  </div>
                </div>
              </div>
            ) : templateStyle === "uthmanic" ? (
              /* TEMPLATE 3: MAJESTIC UTHMANIC QURANIC SCRIPT CARD (SQUARE 1:1) */
              <div
                ref={cardRef}
                dir="rtl"
                style={{
                  width:
                    aspectRatio === "9:16"
                      ? "480px"
                      : aspectRatio === "4:5"
                      ? "520px"
                      : aspectRatio === "auto"
                      ? "540px"
                      : "540px",
                  height:
                    aspectRatio === "9:16"
                      ? "853px"
                      : aspectRatio === "4:5"
                      ? "650px"
                      : aspectRatio === "1:1"
                      ? "540px"
                      : "auto",
                  aspectRatio:
                    aspectRatio === "9:16"
                      ? "9 / 16"
                      : aspectRatio === "4:5"
                      ? "4 / 5"
                      : aspectRatio === "1:1"
                      ? "1 / 1"
                      : undefined,
                  maxWidth: "100%",
                }}
                className="bg-[#fffdf9] border-[3.5px] border-[#0c392c] rounded-[22px] p-[7px] sm:p-[9px] relative shadow-2xl transition-all select-none flex flex-col"
              >
                {/* Inner Gold Quranic Frame */}
                <div className="bg-[#fffdf9] border-[1.8px] border-[#caa24d] rounded-[15px] p-3.5 sm:p-4.5 flex-1 flex flex-col justify-between relative overflow-hidden min-h-0">
                  {/* Header with Calligraphic Bismillah & Quranic Verse */}
                  <div className="border-b-[1.5px] border-[#caa24d]/40 pb-2 mb-2 text-center relative shrink-0">
                    {/* Quranic Bismillah */}
                    <div className="font-uthmanic text-xl sm:text-2xl text-[#0c392c] font-bold tracking-wide select-none drop-shadow-2xs leading-snug py-0.5">
                      بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
                    </div>

                    <div className="my-1.5 flex justify-center">
                      <div className="inline-block px-3.5 py-0.5 rounded-full bg-[#fbf6ec] border border-[#caa24d]/60 text-[11px] sm:text-xs font-cairo text-[#7a5316] font-bold shadow-2xs">
                        ﴿ فَاسْأَلُوا أَهْلَ الذِّكْرِ إِن كُنتُمْ لَا تَعْلَمُونَ ﴾
                      </div>
                    </div>

                    <div className="pt-1">
                      <h1 className="text-sm sm:text-base font-bold font-cairo text-[#0c392c] leading-tight">
                        فتاوى فضيلة الشيخ الدكتور عبد الباري خلة
                      </h1>
                    </div>
                  </div>

                  {/* Question and Answer Boxes Stack */}
                  <div className="space-y-2.5 sm:space-y-3 flex-1 flex flex-col justify-start min-h-0">
                    {/* 1. Question Box in Uthmanic Style */}
                    <div className="rounded-xl overflow-hidden shadow-2xs border border-[#caa24d]/60 bg-[#fbf8f0] shrink-0">
                      <div className="bg-[#0c392c] text-white px-3 py-1 flex items-center justify-between text-xs font-bold font-cairo">
                        <span className="text-xs sm:text-sm text-amber-200">السؤال:</span>
                        {showFatwaNumber && currentFatwa.fatwaNumber && (
                          <span className="text-[10px] font-mono text-emerald-200">
                            #{currentFatwa.fatwaNumber}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 sm:p-3 text-right">
                        <p className="font-uthmanic text-xs sm:text-[13px] text-stone-900 leading-snug sm:leading-relaxed font-semibold">
                          {cleanQ}
                        </p>
                      </div>
                    </div>

                    {/* 2. Answer Box with Full Tashkeel and Othmani Script */}
                    <div className="rounded-xl overflow-hidden shadow-2xs border border-[#caa24d] bg-white flex-1 flex flex-col min-h-0">
                      <div className="bg-[#caa24d] text-[#0c392c] px-3.5 py-1 text-xs font-bold font-cairo flex items-center justify-between shrink-0">
                        <span className="text-xs sm:text-sm font-bold">الجواب:</span>
                        {currentFatwa.fatwaType === "moasala" && (
                          <span className="px-2 py-0.5 rounded bg-[#0c392c] text-white text-[10px] font-bold font-cairo">
                            فتوى مؤصلة
                          </span>
                        )}
                      </div>
                      <div className="p-3 sm:p-3.5 text-right flex-1 flex flex-col justify-between overflow-y-auto">
                        <div
                          className={`font-uthmanic text-stone-950 whitespace-pre-wrap selection:bg-amber-100 ${
                            rawAnswer.length < 180
                              ? "text-sm sm:text-[15px] leading-relaxed sm:leading-7"
                              : rawAnswer.length < 400
                              ? "text-xs sm:text-[13px] leading-relaxed sm:leading-6"
                              : "text-[11px] sm:text-[12px] leading-normal sm:leading-5"
                          }`}
                        >
                          {rawAnswer}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Ribbon with Calligraphic Seal */}
                  <div className="pt-2 mt-2 border-t border-[#caa24d]/40 flex items-center justify-between text-[11px] sm:text-xs text-[#0c392c] font-cairo select-none shrink-0">
                    <span className="font-bold text-xs sm:text-sm">
                      {showWallahuAalam ? "والله تعالى أعلم" : ""}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-stone-600 font-semibold">
                      الصفحة الرسمية للفتاوى • د. عبد الباري خلة
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* TEMPLATE 2: CLASSIC TEMPLATE */
              <div
                ref={cardRef}
                dir="rtl"
                style={{
                  width: aspectRatio === "9:16" ? "420px" : aspectRatio === "4:5" ? "460px" : "480px",
                  minHeight: aspectRatio === "9:16" ? "746px" : aspectRatio === "4:5" ? "575px" : "480px",
                }}
                className={`${themeStyle.bg} ${themeStyle.border} border-2 rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative shadow-xl transition-all select-none`}
              >
                {/* Decorative Corners */}
                <div className={`absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 ${themeStyle.goldDecor} rounded-tr-lg opacity-80`} />
                <div className={`absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 ${themeStyle.goldDecor} rounded-tl-lg opacity-80`} />
                <div className={`absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 ${themeStyle.goldDecor} rounded-br-lg opacity-80`} />
                <div className={`absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 ${themeStyle.goldDecor} rounded-bl-lg opacity-80`} />

                {/* Card Header */}
                <div className="border-b pb-4 mb-4 border-stone-300/40 text-center space-y-1">
                  {(showFatwaNumber || totalPages > 1) && (
                    <div className="flex items-center justify-between text-[11px] font-mono px-1">
                      {showFatwaNumber ? (
                        <span className={`px-2 py-0.5 rounded-full font-bold ${themeStyle.badgeBg} ${themeStyle.badgeText}`}>
                          فتوى #{currentFatwa.fatwaNumber}
                        </span>
                      ) : (
                        <span />
                      )}
                      {totalPages > 1 && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${themeStyle.badgeBg} ${themeStyle.badgeText}`}>
                          صفحة {currentPage} / {totalPages}
                        </span>
                      )}
                      {showFatwaNumber ? (
                        <span className="text-[10px] text-stone-400 font-sans">
                          {new Date(currentFatwa.created_at || Date.now()).toLocaleDateString("ar-EG")}
                        </span>
                      ) : (
                        <span />
                      )}
                    </div>
                  )}

                  <div className="pt-2">
                    <div className={`text-xs uppercase tracking-wide font-bold ${themeStyle.accentText} font-cairo`}>
                      ✍🏻 اطرح سؤالك والشيخ يجيب 📚
                    </div>
                    <h1 className={`text-lg sm:text-xl font-bold font-amiri ${theme === "navy" || theme === "monochrome" ? "text-white" : "text-stone-900"} mt-0.5`}>
                      فضيلة الشيخ د. عبد الباري خلة
                    </h1>
                  </div>
                </div>

                {/* Card Body: Question & Answer */}
                <div className="flex-1 space-y-4">
                  {currentPage === 1 ? (
                    <div className={`p-4 rounded-2xl border ${themeStyle.questionBox} space-y-1`}>
                      <div className="flex items-center gap-1.5 text-xs font-bold font-cairo text-stone-700">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>السؤال:</span>
                      </div>
                      <p className={`text-xs sm:text-sm font-semibold font-tajawal leading-relaxed ${theme === "navy" || theme === "monochrome" ? "text-stone-100" : "text-stone-900"}`}>
                        {cleanQ}
                      </p>
                    </div>
                  ) : (
                    <div className="text-[11px] text-stone-400 bg-black/10 px-3 py-1.5 rounded-xl truncate">
                      تابع إجابة: {cleanQ}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold font-cairo text-stone-700">
                      <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>الجواب:</span>
                    </div>

                    <div
                      className={`font-tajawal whitespace-pre-line leading-relaxed ${themeStyle.answerText} ${adaptive.answerText} ${adaptive.answerLeading}`}
                    >
                      {activePageText}
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-4 mt-4 border-t border-stone-300/40 flex items-center justify-between text-[10px] text-stone-400">
                  <div>
                    {showWallahuAalam && (
                      <span className={`font-amiri text-xs font-bold ${themeStyle.accentText}`}>
                        والله تعالى أعلم
                      </span>
                    )}
                  </div>
                  <div className="font-tajawal font-medium">
                    فتاوى الشيخ د. عبد الباري خلة
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 w-full mt-3 px-2 text-xs text-stone-500">
            <span>
              💡 دقة التصدير فائقة (2.5x Pixel Ratio) لضمان وضوح كامل للخطوط والزخارف على منصات التواصل.
            </span>
            <span className="font-bold text-stone-700 font-mono">
              طول الفتوى: {rawAnswer.length} حرف
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
