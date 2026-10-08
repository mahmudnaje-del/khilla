import React, { useState, useRef } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  Search,
  Filter,
  Eye,
  Edit3,
  Image as ImageIcon,
  Copy,
  Trash2,
  Calendar,
  CheckCircle2,
  Clock,
  BookOpen,
  Download,
  Share2,
  FileAudio,
  Check,
  PlusCircle,
  AlertOctagon,
  FileText,
  Sparkles,
  X,
  Layers,
  Loader2,
  Sliders,
  Palette,
  RotateCcw,
  Save,
  CheckSquare,
  Type,
  ChevronDown,
  ChevronUp,
  CloudDownload,
  RefreshCw,
  Globe,
  EyeOff,
  User,
} from "lucide-react";
import { Fatwa, FatwaStatus } from "../types";
import { WordImportModal } from "./WordImportModal";
import { sanitizeQuestionGreeting } from "../utils/greetingSanitizer";
import { isFatwaDeleted } from "../utils/storage";

export interface PdfTemplateConfig {
  headerTitle: string;
  headerSubtitle: string;
  questionLabel: string;
  answerLabel: string;
  answerBadge: string;
  footerDuaa: string;
  footerSignature: string;
  colorTheme: "emerald" | "navy" | "amber" | "slate" | "burgundy";
  fontScale: "compact" | "normal" | "large";
  showFatwaNumber: boolean;
  showCategory: boolean;
  showDate: boolean;
  showFooterDuaa: boolean;
  showSignature: boolean;
}

const DEFAULT_PDF_TEMPLATE: PdfTemplateConfig = {
  headerTitle: "موسوعة فتاوى فضيلة الشيخ الدكتور عبد الباري خلة",
  headerSubtitle: "الأرشيف المعتمد للفتاوى المفرغة والمنقحة",
  questionLabel: "السؤال:",
  answerLabel: "جواب فضيلة الشيخ د. عبد الباري خلة:",
  answerBadge: "موثق من التسجيل",
  footerDuaa: "والله تعالى أعلم",
  footerSignature: "فضيلة الشيخ د. عبد الباري خلة حفظه الله",
  colorTheme: "emerald",
  fontScale: "normal",
  showFatwaNumber: true,
  showCategory: true,
  showDate: true,
  showFooterDuaa: true,
  showSignature: true,
};

interface FatwaArchiveProps {
  fatwas: Fatwa[];
  onSelectFatwa: (fatwa: Fatwa, targetTab?: "review" | "card") => void;
  onDeleteFatwa: (id: string) => void;
  onUpdateStatus: (id: string, status: FatwaStatus) => void;
  onClearAll?: () => void;
  onNavigateToTranscribe?: () => void;
  onBatchImportFatwas?: (fatwas: Partial<Fatwa>[], openFirstForReview?: boolean) => void;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onFetchAllUserFatwas?: () => Promise<void>;
  isFetchingAllUsersFatwas?: boolean;
  syncStatus?: "initializing" | "connecting" | "synced" | "offline" | "error" | "permission-denied" | "quota-exceeded";
  pendingWritesCount?: number;
}

export const FatwaArchive: React.FC<FatwaArchiveProps> = ({
  fatwas,
  onSelectFatwa,
  onDeleteFatwa,
  onUpdateStatus,
  onClearAll,
  onNavigateToTranscribe,
  onBatchImportFatwas,
  showToast,
  onFetchAllUserFatwas,
  isFetchingAllUsersFatwas = false,
  syncStatus,
  pendingWritesCount = 0,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isWordModalOpen, setIsWordModalOpen] = useState(false);

  // Custom in-app confirmation & PDF dialog states
  const [fatwaToDelete, setFatwaToDelete] = useState<Fatwa | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [pdfScope, setPdfScope] = useState<"all" | "filtered">("all");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [templateEditorTab, setTemplateEditorTab] = useState<"texts" | "style" | "preview">("texts");

  // Template configuration state with localStorage persistence
  const [templateConfig, setTemplateConfig] = useState<PdfTemplateConfig>(() => {
    try {
      const saved = localStorage.getItem("fatwa_pdf_template_config");
      if (saved) {
        return { ...DEFAULT_PDF_TEMPLATE, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn("Failed to load PDF template config:", e);
    }
    return DEFAULT_PDF_TEMPLATE;
  });

  const pdfRenderContainerRef = useRef<HTMLDivElement | null>(null);

  // Save template customizations
  const handleSaveTemplateConfig = (silent = false) => {
    try {
      localStorage.setItem("fatwa_pdf_template_config", JSON.stringify(templateConfig));
      if (!silent) {
        showToast("تم حفظ تعديلات القالب بنجاح!", "success");
      }
    } catch (e) {
      console.error(e);
      if (!silent) {
        showToast("حدث خطأ أثناء حفظ القالب", "error");
      }
    }
  };

  const handleResetTemplateConfig = () => {
    setTemplateConfig(DEFAULT_PDF_TEMPLATE);
    try {
      localStorage.removeItem("fatwa_pdf_template_config");
      showToast("تمت استعادة إعدادات القالب الافتراضية.", "info");
    } catch (e) {
      console.error(e);
    }
  };

  // Filter fatwas - allow searching and viewing all fatwas with correct status matching
  const filteredFatwas = fatwas.filter((f) => {
    if (isFatwaDeleted(f.id, f.fatwaNumber)) return false;
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      (f.question_clean && f.question_clean.toLowerCase().includes(query)) ||
      (f.question_original && f.question_original.toLowerCase().includes(query)) ||
      (f.answer_clean && f.answer_clean.toLowerCase().includes(query)) ||
      (f.fatwaNumber && f.fatwaNumber.toString().includes(query)) ||
      (f.transcriber_name && f.transcriber_name.toLowerCase().includes(query)) ||
      (f.transcriber_group && f.transcriber_group.toString().toLowerCase().includes(query)) ||
      (f.tags && f.tags.some((t) => t.toLowerCase().includes(query)));

    const matchesStatus =
      selectedStatus === "all"
        ? true
        : selectedStatus === "معتمدة"
        ? (f.status === "معتمدة" || f.status === "منشورة" || f.approved)
        : f.status === selectedStatus;

    const matchesCategory = selectedCategory === "all" || f.category === selectedCategory;

    return matchesQuery && matchesStatus && matchesCategory;
  });

  const archiveFatwas = fatwas.filter(
    (f) => !isFatwaDeleted(f.id, f.fatwaNumber) && (f.status === "معتمدة" || f.status === "منشورة" || f.approved)
  );
  const targetFatwasForPdf = pdfScope === "filtered" ? filteredFatwas : archiveFatwas;
  const categories = Array.from(new Set(fatwas.map((f) => f.category).filter(Boolean)));

  // Helper theme classes mapping
  const getThemeStyles = (theme: PdfTemplateConfig["colorTheme"]) => {
    switch (theme) {
      case "navy":
        return {
          cardBorder: "border-blue-900",
          headerBg: "bg-gradient-to-r from-blue-950 to-blue-900",
          headerText: "text-blue-100",
          badgeBg: "bg-blue-50 text-blue-900 border-blue-200",
          questionBg: "bg-slate-50 border-blue-600",
          questionTitle: "text-blue-950",
          answerBg: "bg-blue-50/50 border-blue-800",
          answerTitle: "text-blue-950",
          answerBadge: "bg-blue-100 text-blue-800",
          footerText: "text-blue-900",
          accentColor: "#1e3a8a",
        };
      case "amber":
        return {
          cardBorder: "border-amber-700",
          headerBg: "bg-gradient-to-r from-amber-950 to-amber-900",
          headerText: "text-amber-100",
          badgeBg: "bg-amber-50 text-amber-950 border-amber-300",
          questionBg: "bg-orange-50/60 border-amber-600",
          questionTitle: "text-amber-950",
          answerBg: "bg-amber-50/50 border-amber-700",
          answerTitle: "text-amber-950",
          answerBadge: "bg-amber-200/80 text-amber-900",
          footerText: "text-amber-950",
          accentColor: "#78350f",
        };
      case "slate":
        return {
          cardBorder: "border-stone-700",
          headerBg: "bg-gradient-to-r from-stone-900 to-stone-800",
          headerText: "text-stone-200",
          badgeBg: "bg-stone-100 text-stone-900 border-stone-300",
          questionBg: "bg-stone-100/70 border-stone-600",
          questionTitle: "text-stone-900",
          answerBg: "bg-stone-50 border-stone-800",
          answerTitle: "text-stone-900",
          answerBadge: "bg-stone-200 text-stone-800",
          footerText: "text-stone-900",
          accentColor: "#292524",
        };
      case "burgundy":
        return {
          cardBorder: "border-rose-900",
          headerBg: "bg-gradient-to-r from-rose-950 to-rose-900",
          headerText: "text-rose-100",
          badgeBg: "bg-rose-50 text-rose-950 border-rose-200",
          questionBg: "bg-amber-50/60 border-rose-600",
          questionTitle: "text-rose-950",
          answerBg: "bg-rose-50/40 border-rose-900",
          answerTitle: "text-rose-950",
          answerBadge: "bg-rose-100 text-rose-900",
          footerText: "text-rose-950",
          accentColor: "#881337",
        };
      case "emerald":
      default:
        return {
          cardBorder: "border-emerald-700",
          headerBg: "bg-gradient-to-r from-emerald-900 to-emerald-800",
          headerText: "text-emerald-100",
          badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
          questionBg: "bg-amber-50/80 border-amber-500",
          questionTitle: "text-amber-900",
          answerBg: "bg-emerald-50/50 border-emerald-600",
          answerTitle: "text-emerald-900",
          answerBadge: "bg-emerald-100 text-emerald-700",
          footerText: "text-emerald-900",
          accentColor: "#047857",
        };
    }
  };

  const currentTheme = getThemeStyles(templateConfig.colorTheme);

  const handleCopyFatwa = (fatwa: Fatwa) => {
    const safeQ = sanitizeQuestionGreeting(fatwa.question_clean || fatwa.question_original);
    let out = `فتوى فضيلة الشيخ د. عبد الباري خلة\n`;
    out += `رقم الفتوى: #${fatwa.fatwaNumber || "---"}\n\n`;
    out += `📌 السؤال:\n${safeQ}\n\n`;
    out += `🎙️ جواب فضيلة الشيخ:\n${fatwa.answer_clean}\n\n`;
    out += `----------------------------------------\n`;
    out += `مفرّغ فتاوى الشيخ د. عبد الباري خلة`;

    navigator.clipboard.writeText(out);
    setCopiedId(fatwa.id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast("تم نسخ نص الفتوى للواتساب بنجاح!", "info");
  };

  // A5 Format PDF Generator (148mm x 210mm)
  const handleDownloadPdf = async (customList?: Fatwa[]) => {
    const listToDownload = customList || targetFatwasForPdf;
    if (listToDownload.length === 0) {
      showToast("لا توجد فتاوى محددة لتنزيلها كملف PDF.", "info");
      return;
    }

    setIsGeneratingPdf(true);
    showToast(`جارٍ تجميع وتجهيز ملف PDF بتنسيق A5 (${listToDownload.length} فتوى)...`, "info");

    try {
      // Save any pending template edits automatically before export
      handleSaveTemplateConfig();

      // Give DOM time to ensure render container is active
      await new Promise((r) => setTimeout(r, 120));

      const container = pdfRenderContainerRef.current;
      if (!container) {
        throw new Error("تعذر تجهيز قوالب الفتاوى");
      }

      const cardNodes = Array.from(container.querySelectorAll(".pdf-export-card")) as HTMLElement[];
      if (cardNodes.length === 0) {
        throw new Error("لم يتم العثور على بطاقات الفتاوى للتصدير");
      }

      // Initialize jsPDF in A5 format (148 x 210 mm)
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a5",
      });

      const pageWidth = 148;
      const pageHeight = 210;
      const margin = 8;
      const contentWidth = pageWidth - margin * 2; // 132mm
      let currentY = margin;

      // Add Header banner on first page
      const headerNode = container.querySelector(".pdf-export-header") as HTMLElement;
      if (headerNode) {
        const headerDataUrl = await toPng(headerNode, {
          pixelRatio: 2,
          quality: 0.95,
          backgroundColor: "#ffffff",
          cacheBust: true,
        });
        const headerHeightMm = (headerNode.offsetHeight * contentWidth) / headerNode.offsetWidth;
        pdf.addImage(headerDataUrl, "PNG", margin, currentY, contentWidth, headerHeightMm);
        currentY += headerHeightMm + 5;
      }

      for (let i = 0; i < cardNodes.length; i++) {
        const card = cardNodes[i];
        if (!card) continue;

        const dataUrl = await toPng(card, {
          pixelRatio: 2,
          quality: 0.95,
          backgroundColor: "#ffffff",
          cacheBust: true,
        });

        const cardWidthPx = card.offsetWidth || 560;
        const cardHeightPx = card.offsetHeight || 300;
        const cardHeightMm = (cardHeightPx * contentWidth) / cardWidthPx;

        // In A5, if card exceeds available height on current page, start new page
        if (currentY + cardHeightMm > pageHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }

        pdf.addImage(dataUrl, "PNG", margin, currentY, contentWidth, cardHeightMm);
        currentY += cardHeightMm + 5; // spacing between cards
      }

      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `فتاوى_الشيخ_عبد_الباري_خلة_A5_${dateStr}.pdf`;
      pdf.save(filename);
      showToast("تم تحميل ملف PDF (بتنسيق A5) بنجاح!", "success");
      setShowPdfModal(false);
    } catch (err: any) {
      console.error("PDF Download error:", err);
      showToast("حدث خطأ أثناء تحميل ملف PDF: " + (err?.message || err), "error");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Controls */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-cairo text-stone-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            <span>أرشيف الفتاوى المنظمة</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
              {fatwas.length} فتوى
            </span>
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            سجل الفتاوى المحفوظة والمنقحة الخاصة بفضيلة الشيخ د. عبد الباري خلة
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
          {syncStatus && (
            <div className={`hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-tajawal font-medium ${
              syncStatus === "synced"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : syncStatus === "connecting"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : syncStatus === "offline"
                ? "bg-stone-100 text-stone-700 border-stone-300"
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                syncStatus === "synced"
                  ? "bg-emerald-500"
                  : syncStatus === "connecting"
                  ? "bg-amber-500 animate-pulse"
                  : syncStatus === "offline"
                  ? "bg-stone-400"
                  : "bg-rose-500"
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
                <span className="bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {pendingWritesCount} معلقة
                </span>
              )}
            </div>
          )}

          {onFetchAllUserFatwas && (
            <button
              type="button"
              onClick={() => onFetchAllUserFatwas()}
              disabled={isFetchingAllUsersFatwas}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold font-cairo bg-amber-400 hover:bg-amber-300 text-stone-900 shadow-2xs transition-all cursor-pointer min-h-[42px] active:scale-95 disabled:opacity-50"
              title="مزامنة ورفع كافة فتاوى الأرشيف والمراجعة سحابياً ومحلياً"
            >
              <RefreshCw className={`w-4 h-4 text-stone-900 ${isFetchingAllUsersFatwas ? "animate-spin" : ""}`} />
              <span>{isFetchingAllUsersFatwas ? "جارٍ المزامنة والرفع..." : "مزامنة ورفع الفتاوى"}</span>
            </button>
          )}

          {fatwas.length > 0 && onClearAll && (
            <button
              onClick={() => setShowClearAllModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all cursor-pointer min-h-[42px] active:scale-95"
              title="تصفير الأرشيف"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>تصفير</span>
            </button>
          )}

          {fatwas.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setIsWordModalOpen(true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold font-cairo bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs transition-all cursor-pointer min-h-[42px] active:scale-95"
                title="تفريغ واستيراد حزمة فتاوى من ملف Word"
              >
                <FileText className="w-3.5 h-3.5 text-amber-700" />
                <span>استيراد ملف Word</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowTemplateModal(true);
                }}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold font-cairo bg-white hover:bg-stone-50 text-emerald-800 border border-emerald-300 shadow-2xs transition-all cursor-pointer min-h-[42px] active:scale-95"
                title="تخصيص وتعديل مظهر قالب ملفات الـ PDF"
              >
                <Sliders className="w-3.5 h-3.5 text-emerald-700" />
                <span>تعديل القالب</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                disabled={isGeneratingPdf}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-cairo bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 min-h-[42px] active:scale-95"
                title="تحميل جميع الفتاوى في ملف PDF منظم بتنسيق A5"
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-200" />
                    <span>جارٍ تجهيز PDF (A5)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-emerald-200" />
                    <span>تحميل PDF (A5)</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>


      {/* When Archive is completely empty */}
      {fatwas.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-10 sm:p-16 text-center border border-stone-200 shadow-sm max-w-xl mx-auto space-y-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/50 rounded-full blur-3xl -translate-y-12 translate-x-12"></div>
          <div className="relative z-10 space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200/60 shadow-[0_8px_30px_rgb(4,120,87,0.1)] group-hover:scale-110 transition-transform">
              <BookOpen className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold font-cairo text-stone-800">
              أرشيف الفتاوى فارغ ونظيف
            </h3>
            <p className="text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
              لم يتم تسجيل أي فتاوى بعد. ابدأ برفع تسجيل صوتي أو كتابة سؤال لتفريغ أول فتوى وحفظها في الأرشيف المعتمد.
            </p>
          </div>
          <div className="relative z-10 pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            {onNavigateToTranscribe && (
              <button
                onClick={onNavigateToTranscribe}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold font-cairo text-sm shadow-[0_8px_20px_rgba(5,150,105,0.25)] transition-all hover:-translate-y-0.5 active:translate-y-0 border border-emerald-400/30"
              >
                <PlusCircle className="w-4.5 h-4.5" />
                <span>تفريغ أول فتوى الآن</span>
              </button>
            )}

            <button
              onClick={() => setIsWordModalOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white hover:bg-stone-50 text-stone-700 font-bold font-cairo text-sm border border-stone-200 shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <FileText className="w-4.5 h-4.5 text-stone-500" />
              <span>تفريغ ملف Word (.docx)</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search & Filter Bar */}
          <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search input */}
            <div className="md:col-span-6 relative">
              <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في نص السؤال، الجواب، الكلمات المفتاحية، أو رقم الفتوى..."
                className="w-full pr-10 pl-4 py-2 rounded-xl border border-stone-200 bg-stone-50/50 text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Status Filter */}
            <div className="md:col-span-3">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-stone-200 bg-stone-50/50 text-xs sm:text-sm focus:bg-white focus:outline-none"
              >
                <option value="all">جميع الحالات ({fatwas.length})</option>
                <option value="تحتاج مراجعة">تحتاج مراجعة</option>
                <option value="مسودة">مسودة</option>
                <option value="مراجعة">مراجعة</option>
                <option value="معتمدة">معتمدة</option>
                <option value="منشورة">منشورة</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="md:col-span-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-stone-200 bg-stone-50/50 text-xs sm:text-sm focus:bg-white focus:outline-none"
              >
                <option value="all">جميع التصنيفات</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fatwas List / Grid */}
          {filteredFatwas.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-200">
              <p className="text-sm font-bold text-stone-600 font-cairo">
                لم يتم العثور على أي فتاوى مطابقة للبحث
              </p>
              <p className="text-xs text-stone-400 mt-1">
                جرب تغيير كلمات البحث أو إعادة ضبط خيارات التصفية.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredFatwas.map((fatwa) => (
                <div
                  key={fatwa.id}
                  className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Top Info Bar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-stone-100 text-stone-800 border border-stone-200">
                          #{fatwa.fatwaNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            fatwa.status === "معتمدة"
                              ? "bg-emerald-100 text-emerald-800"
                              : fatwa.status === "منشورة"
                              ? "bg-teal-100 text-teal-900"
                              : fatwa.status === "تحتاج مراجعة"
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : "bg-stone-100 text-stone-600"
                          }`}
                        >
                          {fatwa.status}
                        </span>
                      </div>

                      <span className="text-[11px] text-stone-400 flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3" />
                        {new Date(fatwa.created_at).toLocaleDateString("ar-EG")}
                      </span>
                    </div>

                    {/* Transcriber & Group Info for Editors */}
                    {(fatwa.transcriber_name || fatwa.transcriber_group) && (
                      <div className="flex items-center gap-2 text-[11px] text-stone-700 bg-emerald-50/80 px-2.5 py-1 rounded-xl border border-emerald-200/80 w-fit">
                        <div className="flex items-center gap-1 font-bold text-[#0c392c] font-cairo">
                          <User className="w-3 h-3 text-emerald-700" />
                          <span>المفرّغ: {fatwa.transcriber_name || "غير محدد"}</span>
                        </div>
                        {fatwa.transcriber_group && (
                          <>
                            <span className="text-emerald-300">•</span>
                            <span className="font-bold text-amber-900 font-mono bg-amber-100/90 px-1.5 py-0.5 rounded text-[10px] border border-amber-300/80">
                              مجموعة #{fatwa.transcriber_group}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Question */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-stone-500 font-cairo">السؤال:</div>
                      <p className="text-xs sm:text-sm font-bold text-stone-900 line-clamp-2 leading-relaxed font-tajawal">
                        {fatwa.question_clean || fatwa.question_original}
                      </p>
                    </div>

                    {/* Answer Excerpt */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-emerald-800 font-cairo">جواب الشيخ:</div>
                      <p className="text-xs text-stone-700 line-clamp-3 leading-relaxed font-tajawal whitespace-pre-line bg-stone-50/70 p-2.5 rounded-xl border border-stone-100">
                        {fatwa.answer_clean}
                      </p>
                    </div>

                    {/* Audio file indicator if present */}
                    {fatwa.audio_file?.name && (
                      <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                        <FileAudio className="w-3.5 h-3.5 text-teal-600" />
                        <span className="truncate max-w-[240px]">{fatwa.audio_file.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Card Actions */}
                  <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {fatwa.status === "منشورة" || (fatwa.status === "معتمدة" && fatwa.approved !== false) ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من إلغاء نشر الفتوى #${fatwa.fatwaNumber || ""} وسحبها من واجهة القراء؟`)) {
                              onUpdateStatus(fatwa.id, "تحتاج مراجعة");
                              showToast(`تم إلغاء نشر الفتوى #${fatwa.fatwaNumber || ""} وسحبها من واجهة القراء فوراً`, "info");
                            }
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 hover:bg-rose-50 hover:text-rose-800 border border-amber-300 hover:border-rose-300 transition-colors shadow-2xs cursor-pointer"
                          title="إلغاء نشر هذه الفتوى وسحبها من واجهة القراء فوراً"
                        >
                          <EyeOff className="w-3.5 h-3.5 text-rose-600" />
                          <span>إلغاء النشر</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateStatus(fatwa.id, "منشورة");
                            showToast(`تم نشر الفتوى #${fatwa.fatwaNumber || ""} في واجهة القراء بشكل لحظي 🌐`, "success");
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-500/50 transition-colors shadow-2xs cursor-pointer"
                          title="نشر الفتوى لتظهر في واجهة القراء والبحث العام فوراً"
                        >
                          <Globe className="w-3.5 h-3.5 text-amber-300" />
                          <span>نشر للقراء</span>
                        </button>
                      )}

                      <button
                        onClick={() => onSelectFatwa(fatwa, "review")}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>مراجعة</span>
                      </button>

                      <button
                        onClick={() => onSelectFatwa(fatwa, "card")}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>قالب صورة</span>
                      </button>

                      <button
                        onClick={() => handleCopyFatwa(fatwa)}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 border border-transparent hover:border-stone-200 transition-colors"
                        title="نسخ نص الفتوى"
                      >
                        {copiedId === fatwa.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    <button
                      onClick={() => setFatwaToDelete(fatwa)}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="حذف الفتوى"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal: تأكيد حذف فتوى مفردة */}
      {fatwaToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold font-cairo text-base text-stone-900">
                  تأكيد حذف الفتوى
                </h3>
                <span className="text-xs font-mono font-bold text-stone-500">
                  #{fatwaToDelete.fatwaNumber}
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-tajawal">
              هل أنت متأكد من رغبتك في حذف هذه الفتوى:
              <br />
              <strong className="text-stone-900 block mt-1 line-clamp-2">
                "{fatwaToDelete.question_clean || fatwaToDelete.question_original}"
              </strong>
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setFatwaToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (fatwaToDelete) {
                    onDeleteFatwa(fatwaToDelete.id);
                    setFatwaToDelete(null);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold font-cairo bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                نعم، احذف الفتوى
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: تأكيد تصفير الأرشيف بالكامل */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold font-cairo text-base text-stone-900">
                  تصفير الأرشيف بالكامل
                </h3>
                <span className="text-xs text-red-600 font-semibold">
                  تحذير: إجراء نهائي
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-tajawal">
              هل أنت متأكد تماماً من رغبتك في مسح كافة الفتاوى وتصفير الأرشيف بالكامل؟ لا يمكن استرجاع الفتاوى المحذوفة بعد هذا الإجراء.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onClearAll) {
                    onClearAll();
                  }
                  setShowClearAllModal(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold font-cairo bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                نعم، تصفير ومسح الأرشيف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: محرر وتخصيص قالب الفتاوى A5 المتقدم */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-stone-900/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className={`p-4 sm:p-5 border-b border-stone-200 ${currentTheme.headerBg} text-white flex items-center justify-between transition-colors`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/25">
                  <Sliders className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold font-cairo text-base sm:text-lg text-white">
                    تخصيص ومحرر قالب الفتاوى (A5)
                  </h3>
                  <p className="text-xs text-white/80 font-tajawal">
                    تخصيص الألوان والنصوص والعناوين المعتمدة عند طباعة وتحميل ملفات الـ PDF
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile/Desktop Navigation Tabs */}
            <div className="p-2 bg-stone-100 border-b border-stone-200 flex items-center gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setTemplateEditorTab("texts")}
                className={`flex-1 min-w-[100px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold font-cairo transition-all cursor-pointer ${
                  templateEditorTab === "texts"
                    ? "bg-white text-emerald-900 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>النصوص والعناوين</span>
              </button>

              <button
                type="button"
                onClick={() => setTemplateEditorTab("style")}
                className={`flex-1 min-w-[100px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold font-cairo transition-all cursor-pointer ${
                  templateEditorTab === "style"
                    ? "bg-white text-emerald-900 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>الألوان والمظهر</span>
              </button>

              <button
                type="button"
                onClick={() => setTemplateEditorTab("preview")}
                className={`flex-1 min-w-[100px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold font-cairo transition-all cursor-pointer ${
                  templateEditorTab === "preview"
                    ? "bg-white text-emerald-900 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>المعاينة الحية</span>
              </button>
            </div>

            {/* Modal Body Content Based on Tab */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-stone-50/70">
              {templateEditorTab === "texts" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                    <h4 className="font-bold font-cairo text-sm text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-2">
                      <FileText className="w-4 h-4 text-emerald-700" />
                      <span>عناوين الترويسة الرئيسية لملف الـ PDF:</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="text-stone-700 font-bold font-cairo mb-1.5 block">
                          عنوان الترويسة الرئيسية:
                        </label>
                        <input
                          type="text"
                          value={templateConfig.headerTitle}
                          onChange={(e) =>
                            setTemplateConfig((prev) => ({ ...prev, headerTitle: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-medium"
                          placeholder="مثال: موسوعة فتاوى فضيلة الشيخ الدكتور عبد الباري خلة"
                        />
                      </div>

                      <div>
                        <label className="text-stone-700 font-bold font-cairo mb-1.5 block">
                          العنوان الفرعي:
                        </label>
                        <input
                          type="text"
                          value={templateConfig.headerSubtitle}
                          onChange={(e) =>
                            setTemplateConfig((prev) => ({ ...prev, headerSubtitle: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-medium"
                          placeholder="مثال: الأرشيف المعتمد للفتاوى المفرغة والمنقحة"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                    <h4 className="font-bold font-cairo text-sm text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-2">
                      <Sliders className="w-4 h-4 text-emerald-700" />
                      <span>تسميات السؤال والجواب والتوقيع:</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="text-stone-700 font-bold font-cairo mb-1.5 block">
                          تسمية صندوق السؤال:
                        </label>
                        <input
                          type="text"
                          value={templateConfig.questionLabel}
                          onChange={(e) =>
                            setTemplateConfig((prev) => ({ ...prev, questionLabel: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-medium"
                        />
                      </div>

                      <div>
                        <label className="text-stone-700 font-bold font-cairo mb-1.5 block">
                          تسمية صندوق الجواب:
                        </label>
                        <input
                          type="text"
                          value={templateConfig.answerLabel}
                          onChange={(e) =>
                            setTemplateConfig((prev) => ({ ...prev, answerLabel: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-medium"
                        />
                      </div>

                      <div>
                        <label className="text-stone-700 font-bold font-cairo mb-1.5 block">
                          توقيع وخاتمة الشيخ:
                        </label>
                        <input
                          type="text"
                          value={templateConfig.footerSignature}
                          onChange={(e) =>
                            setTemplateConfig((prev) => ({ ...prev, footerSignature: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-medium"
                        />
                      </div>

                      <div>
                        <label className="text-stone-700 font-bold font-cairo mb-1.5 block">
                          عبارة الختام الشرعية:
                        </label>
                        <input
                          type="text"
                          value={templateConfig.footerDuaa}
                          onChange={(e) =>
                            setTemplateConfig((prev) => ({ ...prev, footerDuaa: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-medium"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {templateEditorTab === "style" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* Theme Colors */}
                  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                    <label className="text-sm font-bold font-cairo text-stone-900 block">
                      النمط واللون المعتمد للبطاقات والترويسة:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {[
                        { id: "emerald", label: "أخضر إسلامي فاخر", desc: "نمط كلاسيكي وقور", bg: "bg-emerald-700" },
                        { id: "navy", label: "كحلي ملكي رسمي", desc: "نمط أكاديمي راقٍ", bg: "bg-blue-900" },
                        { id: "amber", label: "ذهبي صحراوي دافئ", desc: "نمط أندلسي أصيل", bg: "bg-amber-700" },
                        { id: "burgundy", label: "عنابي مميز", desc: "نمط مخطوطات فاخر", bg: "bg-rose-900" },
                        { id: "slate", label: "رمادي صخري حديث", desc: "نمط عصري حديث", bg: "bg-stone-800" },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setTemplateConfig((prev) => ({
                              ...prev,
                              colorTheme: t.id as PdfTemplateConfig["colorTheme"],
                            }))
                          }
                          className={`flex items-start gap-3 p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                            templateConfig.colorTheme === t.id
                              ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-600/20"
                              : "border-stone-200 text-stone-700 hover:bg-stone-50"
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full ${t.bg} shrink-0 mt-0.5 shadow-2xs`} />
                          <div className="min-w-0">
                            <span className="font-bold text-xs sm:text-sm text-stone-900 block font-cairo">
                              {t.label}
                            </span>
                            <span className="text-[11px] text-stone-500 font-tajawal block">
                              {t.desc}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Scale & Display Checkboxes */}
                  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                      <div>
                        <span className="font-bold font-cairo text-sm text-stone-900 block">
                          حجم خط الفتاوى في صفحات A5:
                        </span>
                        <span className="text-xs text-stone-500 font-tajawal">
                          اضبط حجم الخط ليتناسب مع طول الفتوى وعدد الصفحات
                        </span>
                      </div>
                      <div className="inline-flex rounded-xl bg-stone-100 p-1 border border-stone-200">
                        {(["compact", "normal", "large"] as const).map((scale) => (
                          <button
                            key={scale}
                            type="button"
                            onClick={() => setTemplateConfig((prev) => ({ ...prev, fontScale: scale }))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-cairo transition-all cursor-pointer ${
                              templateConfig.fontScale === scale
                                ? "bg-white text-emerald-800 shadow-2xs"
                                : "text-stone-600 hover:text-stone-900"
                            }`}
                          >
                            {scale === "compact" ? "مدمج" : scale === "normal" ? "عادي" : "كبير"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="font-bold font-cairo text-xs sm:text-sm text-stone-800 block">
                        عناصر البطاقة الظاهرة:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 bg-stone-50/50 cursor-pointer text-stone-800 font-medium">
                          <input
                            type="checkbox"
                            checked={templateConfig.showFatwaNumber}
                            onChange={(e) =>
                              setTemplateConfig((prev) => ({ ...prev, showFatwaNumber: e.target.checked }))
                            }
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span>رقم الفتوى</span>
                        </label>
                        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 bg-stone-50/50 cursor-pointer text-stone-800 font-medium">
                          <input
                            type="checkbox"
                            checked={templateConfig.showCategory}
                            onChange={(e) =>
                              setTemplateConfig((prev) => ({ ...prev, showCategory: e.target.checked }))
                            }
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span>التصنيف</span>
                        </label>
                        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 bg-stone-50/50 cursor-pointer text-stone-800 font-medium">
                          <input
                            type="checkbox"
                            checked={templateConfig.showDate}
                            onChange={(e) =>
                              setTemplateConfig((prev) => ({ ...prev, showDate: e.target.checked }))
                            }
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span>التاريخ</span>
                        </label>
                        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 bg-stone-50/50 cursor-pointer text-stone-800 font-medium">
                          <input
                            type="checkbox"
                            checked={templateConfig.showSignature}
                            onChange={(e) =>
                              setTemplateConfig((prev) => ({ ...prev, showSignature: e.target.checked }))
                            }
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span>توقيع الشيخ</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {templateEditorTab === "preview" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="text-center">
                    <span className="text-xs text-stone-500 font-semibold bg-white px-3 py-1 rounded-full border border-stone-200 shadow-2xs">
                      معاينة حية لشكل بطاقة الفتوى في ملف A5 بالتنسيق المختار
                    </span>
                  </div>

                  {/* Header Banner Preview */}
                  {templateConfig.headerTitle && (
                    <div className={`p-4 text-center ${currentTheme.headerBg} text-white rounded-2xl shadow-xs border border-white/20 space-y-1`}>
                      <h2 className="text-base sm:text-lg font-bold font-cairo">
                        {templateConfig.headerTitle}
                      </h2>
                      {templateConfig.headerSubtitle && (
                        <p className="text-xs text-white/85 font-tajawal">
                          {templateConfig.headerSubtitle} • تنسيق A5
                        </p>
                      )}
                    </div>
                  )}

                  {/* Card Preview */}
                  <div className={`bg-white rounded-2xl border-2 ${currentTheme.cardBorder} p-4 sm:p-6 shadow-sm space-y-3.5 relative overflow-hidden transition-all`}>
                    {(templateConfig.showFatwaNumber || templateConfig.showCategory || templateConfig.showDate) && (
                      <div className="flex items-center justify-between border-b border-stone-200 pb-2.5 gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {templateConfig.showFatwaNumber && (
                            <span className={`px-2.5 py-0.5 rounded-full border text-xs font-bold font-cairo ${currentTheme.badgeBg}`}>
                              فتوى رقم #1
                            </span>
                          )}
                          {templateConfig.showCategory && (
                            <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-xs font-semibold">
                              {archiveFatwas[0]?.category || "فقه العبادات"}
                            </span>
                          )}
                        </div>
                        {templateConfig.showDate && (
                          <div className="flex items-center gap-1.5 text-xs text-stone-500 font-tajawal">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>
                              {new Date().toLocaleDateString("ar-EG", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Question Box */}
                    <div className={`${currentTheme.questionBg} rounded-xl p-3.5 border-r-4 space-y-1`}>
                      <div className={`text-xs font-bold font-cairo ${currentTheme.questionTitle}`}>
                        {templateConfig.questionLabel}
                      </div>
                      <p
                        className={`font-semibold text-stone-900 leading-relaxed font-tajawal ${
                          templateConfig.fontScale === "compact"
                            ? "text-xs"
                            : templateConfig.fontScale === "large"
                            ? "text-base"
                            : "text-sm"
                        }`}
                      >
                        {archiveFatwas[0]?.question_clean || archiveFatwas[0]?.question_original || "ما حكم قراءة القرآن من الهاتف بغير وضوء؟"}
                      </p>
                    </div>

                    {/* Answer Box */}
                    <div className={`${currentTheme.answerBg} rounded-xl p-4 border-r-4 space-y-2`}>
                      <div className={`text-xs font-bold font-cairo ${currentTheme.answerTitle} flex items-center justify-between`}>
                        <span>{templateConfig.answerLabel}</span>
                        {templateConfig.answerBadge && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${currentTheme.answerBadge}`}>
                            {templateConfig.answerBadge}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-stone-900 font-amiri leading-loose whitespace-pre-line text-justify ${
                          templateConfig.fontScale === "compact"
                            ? "text-sm leading-relaxed"
                            : templateConfig.fontScale === "large"
                            ? "text-lg leading-loose"
                            : "text-base leading-loose"
                        }`}
                      >
                        {archiveFatwas[0]?.answer_clean || "الحمد لله والصلاة والسلام على رسول الله؛ لا حرج في قراءة القرآن من الهاتف المحمول بغير وضوء، لأن شاشة الهاتف ليست كالمصحف الورقي، ولا يشترط لها الطهارة الصغرى، وإن كان الأولى والأكمل القراءة على طهارة."}
                      </p>
                    </div>

                    {/* Card Footer */}
                    {(templateConfig.showFooterDuaa || templateConfig.showSignature) && (
                      <div className="flex items-center justify-between pt-2 border-t border-dashed border-stone-200 text-xs text-stone-500">
                        <span>{templateConfig.showFooterDuaa ? templateConfig.footerDuaa : ""}</span>
                        {templateConfig.showSignature && (
                          <span className={`font-bold font-cairo ${currentTheme.footerText}`}>
                            {templateConfig.footerSignature}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Sticky Actions */}
            <div className="p-3.5 sm:p-4 bg-white border-t border-stone-200 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleResetTemplateConfig}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer"
                title="استعادة الإعدادات الافتراضية"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>استعادة الافتراضي</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
                >
                  إغلاق
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSaveTemplateConfig();
                    setShowTemplateModal(false);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold font-cairo bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors cursor-pointer active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ التعديلات</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSaveTemplateConfig(true);
                    setShowTemplateModal(false);
                    setShowPdfModal(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold font-cairo bg-stone-900 hover:bg-stone-800 text-white shadow-xs transition-colors cursor-pointer active:scale-95"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>حفظ والذهاب للتحميل</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: تصدير وتحميل الفتاوى كـ PDF A5 */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-stone-900/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className={`p-4 sm:p-5 border-b border-stone-200 ${currentTheme.headerBg} text-white flex items-center justify-between transition-colors`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold font-cairo text-base sm:text-lg text-white flex items-center gap-2">
                    <span>تحميل الفتاوى كملف PDF (تنسيق A5)</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 text-white font-normal">
                      {targetFatwasForPdf.length} فتوى
                    </span>
                  </h3>
                  <p className="text-xs text-white/80 font-tajawal mt-0.5">
                    توليد وتنزيل ملف PDF منسق مباشرة بحجم A5 مع القالب المخصص
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPdfModal(false);
                    setShowTemplateModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold font-cairo bg-white/15 text-white hover:bg-white/25 border border-white/20 transition-all cursor-pointer"
                  title="تعديل قالب الفتاوى ونصوصه ومظهره"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>تعديل القالب</span>
                </button>

                <button
                  onClick={() => setShowPdfModal(false)}
                  className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scope Selection & Actions Bar */}
            <div className="p-3.5 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                <span>النطاق:</span>
                <div className="inline-flex rounded-xl bg-white border border-stone-300 p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setPdfScope("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      pdfScope === "all"
                        ? "bg-emerald-700 text-white shadow-xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    كافة الفتاوى المعتمدة ({archiveFatwas.length})
                  </button>
                  {filteredFatwas.length !== archiveFatwas.length && (
                    <button
                      type="button"
                      onClick={() => setPdfScope("filtered")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        pdfScope === "filtered"
                          ? "bg-emerald-700 text-white shadow-xs"
                          : "text-stone-600 hover:text-stone-900"
                      }`}
                    >
                      نتائج البحث ({filteredFatwas.length})
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPdfModal(false);
                    setShowTemplateModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 transition-all cursor-pointer"
                >
                  <Palette className="w-3.5 h-3.5 text-emerald-600" />
                  <span>تعديل المظهر والقالب</span>
                </button>
              </div>
            </div>

            {/* Scrollable Preview */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-stone-100/70 space-y-4">
              <div className="text-center py-0.5">
                <span className="text-xs text-stone-500 font-medium bg-white px-3 py-1 rounded-full border border-stone-200 shadow-2xs">
                  معاينة الفتاوى التي سيتم تصديرها ({targetFatwasForPdf.length} فتوى)
                </span>
              </div>

              {/* Main Banner Preview */}
              {templateConfig.headerTitle && (
                <div className={`p-4 text-center ${currentTheme.headerBg} text-white rounded-2xl shadow-xs border border-white/20 space-y-1`}>
                  <h2 className="text-base sm:text-lg font-bold font-cairo">
                    {templateConfig.headerTitle}
                  </h2>
                  {templateConfig.headerSubtitle && (
                    <p className="text-xs text-white/85 font-tajawal">
                      {templateConfig.headerSubtitle} • {targetFatwasForPdf.length} فتوى • تنسيق A5
                    </p>
                  )}
                </div>
              )}

              {targetFatwasForPdf.map((fatwa, idx) => (
                <div
                  key={fatwa.id}
                  className={`bg-white rounded-2xl border-2 ${currentTheme.cardBorder} p-4 sm:p-5 shadow-sm space-y-3 relative overflow-hidden transition-all`}
                >
                  {/* Card Header */}
                  {(templateConfig.showFatwaNumber || templateConfig.showCategory || templateConfig.showDate) && (
                    <div className="flex items-center justify-between border-b border-stone-200 pb-2.5 gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {templateConfig.showFatwaNumber && (
                          <span className={`px-2.5 py-0.5 rounded-full border text-xs font-bold font-cairo ${currentTheme.badgeBg}`}>
                            فتوى رقم #{fatwa.fatwaNumber || idx + 1}
                          </span>
                        )}
                        {templateConfig.showCategory && fatwa.category && (
                          <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-xs font-semibold">
                            {fatwa.category}
                          </span>
                        )}
                      </div>
                      {templateConfig.showDate && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 font-tajawal">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {new Date(fatwa.timestamp).toLocaleDateString("ar-EG", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Question Box */}
                  <div className={`${currentTheme.questionBg} rounded-xl p-3 border-r-4 space-y-0.5`}>
                    <div className={`text-xs font-bold font-cairo ${currentTheme.questionTitle}`}>
                      {templateConfig.questionLabel}
                    </div>
                    <p
                      className={`font-semibold text-stone-900 leading-relaxed font-tajawal ${
                        templateConfig.fontScale === "compact"
                          ? "text-xs"
                          : templateConfig.fontScale === "large"
                          ? "text-base"
                          : "text-sm"
                      }`}
                    >
                      {fatwa.question_clean || fatwa.question_original || "بدون عنوان"}
                    </p>
                  </div>

                  {/* Answer Box */}
                  <div className={`${currentTheme.answerBg} rounded-xl p-3.5 border-r-4 space-y-1.5`}>
                    <div className={`text-xs font-bold font-cairo ${currentTheme.answerTitle} flex items-center justify-between`}>
                      <span>{templateConfig.answerLabel}</span>
                      {templateConfig.answerBadge && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${currentTheme.answerBadge}`}>
                          {templateConfig.answerBadge}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-stone-900 font-amiri leading-loose whitespace-pre-line text-justify ${
                        templateConfig.fontScale === "compact"
                          ? "text-sm leading-relaxed"
                          : templateConfig.fontScale === "large"
                          ? "text-lg leading-loose"
                          : "text-base leading-loose"
                      }`}
                    >
                      {fatwa.answer_clean || "لا يوجد نص تفريغ"}
                    </p>
                  </div>

                  {/* Card Footer */}
                  {(templateConfig.showFooterDuaa || templateConfig.showSignature) && (
                    <div className="flex items-center justify-between pt-2 border-t border-dashed border-stone-200 text-xs text-stone-500">
                      <span>{templateConfig.showFooterDuaa ? templateConfig.footerDuaa : ""}</span>
                      {templateConfig.showSignature && (
                        <span className={`font-bold font-cairo ${currentTheme.footerText}`}>
                          {templateConfig.footerSignature}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 bg-white border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-stone-500 font-medium">
                سيتم تنزيل ملف PDF مباشر بتنسيق صفحات A5 يحتوي على {targetFatwasForPdf.length} فتوى.
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowPdfModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPdf()}
                  disabled={isGeneratingPdf}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold font-cairo bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isGeneratingPdf ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-200" />
                      <span>جارٍ التنزيل...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>تحميل ملف PDF (A5)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Off-Screen Container For Direct High-Resolution A5 PDF Capture */}
      <div
        ref={pdfRenderContainerRef}
        className="fixed top-0 pointer-events-none -left-[9999px] w-[560px] bg-white p-4 space-y-4"
        aria-hidden="true"
      >
        {/* Export Header Banner */}
        {templateConfig.headerTitle && (
          <div className={`pdf-export-header p-4 text-center ${currentTheme.headerBg} text-white rounded-xl border border-stone-300 space-y-1`}>
            <h1 className="text-base font-bold font-cairo mb-0.5 text-white">
              {templateConfig.headerTitle}
            </h1>
            {templateConfig.headerSubtitle && (
              <p className="text-[11px] text-white/90 font-tajawal">
                {templateConfig.headerSubtitle} • {targetFatwasForPdf.length} فتوى • تاريخ التصدير: {new Date().toLocaleDateString("ar-EG")}
              </p>
            )}
          </div>
        )}

        {targetFatwasForPdf.map((fatwa, idx) => (
          <div
            key={fatwa.id}
            className={`pdf-export-card bg-white p-5 rounded-2xl border-2 ${currentTheme.cardBorder} space-y-3 shadow-sm`}
          >
            {(templateConfig.showFatwaNumber || templateConfig.showCategory || templateConfig.showDate) && (
              <div className="flex items-center justify-between border-b border-stone-300 pb-2">
                <div className="flex items-center gap-2">
                  {templateConfig.showFatwaNumber && (
                    <span className={`font-bold text-xs font-cairo px-2.5 py-0.5 rounded-full border ${currentTheme.badgeBg}`}>
                      فتوى رقم #{fatwa.fatwaNumber || idx + 1}
                    </span>
                  )}
                  {templateConfig.showCategory && fatwa.category && (
                    <span className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md font-semibold">
                      {fatwa.category}
                    </span>
                  )}
                </div>
                {templateConfig.showDate && (
                  <span className="text-[10px] text-stone-500 font-tajawal">
                    {new Date(fatwa.timestamp).toLocaleDateString("ar-EG", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Question */}
            <div className={`${currentTheme.questionBg} p-3 rounded-xl border-r-4 space-y-0.5`}>
              <div className={`font-bold text-[11px] font-cairo ${currentTheme.questionTitle}`}>
                {templateConfig.questionLabel}
              </div>
              <div
                className={`font-semibold text-stone-900 font-tajawal leading-relaxed ${
                  templateConfig.fontScale === "compact"
                    ? "text-[11px]"
                    : templateConfig.fontScale === "large"
                    ? "text-sm"
                    : "text-xs"
                }`}
              >
                {fatwa.question_clean || fatwa.question_original || "بدون عنوان"}
              </div>
            </div>

            {/* Answer */}
            <div className={`${currentTheme.answerBg} p-3.5 rounded-xl border-r-4 space-y-1.5`}>
              <div className={`font-bold text-[11px] font-cairo ${currentTheme.answerTitle} flex items-center justify-between`}>
                <span>{templateConfig.answerLabel}</span>
                {templateConfig.answerBadge && (
                  <span className={`text-[9px] px-2 py-0.5 rounded-md font-semibold ${currentTheme.answerBadge}`}>
                    {templateConfig.answerBadge}
                  </span>
                )}
              </div>
              <div
                className={`text-stone-900 font-amiri whitespace-pre-line text-justify ${
                  templateConfig.fontScale === "compact"
                    ? "text-xs leading-normal"
                    : templateConfig.fontScale === "large"
                    ? "text-base leading-relaxed"
                    : "text-sm leading-relaxed"
                }`}
              >
                {fatwa.answer_clean || "لا يوجد نص تفريغ"}
              </div>
            </div>

            {/* Footer */}
            {(templateConfig.showFooterDuaa || templateConfig.showSignature) && (
              <div className="flex items-center justify-between pt-1.5 border-t border-dashed border-stone-300 text-[10px] text-stone-600">
                <span>{templateConfig.showFooterDuaa ? templateConfig.footerDuaa : ""}</span>
                {templateConfig.showSignature && (
                  <span className={`font-bold font-cairo ${currentTheme.footerText}`}>
                    {templateConfig.footerSignature}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Word Import Modal */}
      <WordImportModal
        isOpen={isWordModalOpen}
        onClose={() => setIsWordModalOpen(false)}
        onImportFatwas={(fatwasList, openFirstForReview) => {
          if (onBatchImportFatwas) {
            onBatchImportFatwas(fatwasList, openFirstForReview);
          } else {
            showToast(`تم استيراد ${fatwasList.length} فتوى بنجاح`, "success");
          }
        }}
        showToast={showToast}
      />
    </div>
  );
};
