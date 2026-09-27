import React, { useState, useRef } from "react";
import {
  X,
  Copy,
  Check,
  Sparkles,
  Download,
  Share2,
  FileCheck2,
  HelpCircle,
  BookOpen,
  Volume2,
  VolumeX,
  Sliders,
  Type,
  ZoomIn,
  ZoomOut,
  Edit3,
  Video,
  FileAudio,
  Calendar,
  Hash,
  Bookmark,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { toPng } from "html-to-image";
import { Fatwa } from "../types";
import { sanitizeQuestionGreeting } from "../utils/greetingSanitizer";
import { cleanTashkeelText } from "../utils/tashkeelHelper";

interface ArabicFatwaDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fatwa: Fatwa | null;
  onNavigateToCard?: () => void;
  onUpdateFatwa?: (updated: Fatwa) => void;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}

// 8-Point Islamic Star
const IslamicStarIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4 text-[#caa24d]" }) => (
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

export const ArabicFatwaDetailsModal: React.FC<ArabicFatwaDetailsModalProps> = ({
  isOpen,
  onClose,
  fatwa,
  onNavigateToCard,
  onUpdateFatwa,
  showToast,
}) => {
  if (!isOpen || !fatwa) return null;

  // View preferences
  const [activeAnswerMode, setActiveAnswerMode] = useState<"tashkeel" | "clean">("tashkeel");
  const [fontScale, setFontScale] = useState<number>(1); // 0.9, 1, 1.15, 1.3
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [isVocalizingWithAI, setIsVocalizingWithAI] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isExportingCard, setIsExportingCard] = useState<boolean>(false);

  // Editable question/answer local state
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editQuestionText, setEditQuestionText] = useState(fatwa.question_clean || fatwa.question_original || "");
  const [isEditingAnswer, setIsEditingAnswer] = useState(false);
  const [editAnswerText, setEditAnswerText] = useState(fatwa.answer_tashkeel || fatwa.answer_clean || "");

  const modalCardRef = useRef<HTMLDivElement | null>(null);

  const cleanQuestion = sanitizeQuestionGreeting(fatwa.question_clean || fatwa.question_original || "");
  const tashkeelAnswer = fatwa.answer_tashkeel || fatwa.answer_clean || "";
  const standardAnswer = fatwa.answer_clean || fatwa.transcription_raw || "";

  // Helper copy with feedback
  const handleCopy = (text: string, sectionKey: string, toastLabel: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    showToast(toastLabel, "success");
    setTimeout(() => {
      setCopiedSection(null);
    }, 2200);
  };

  // Copy full fatwa formatted for WhatsApp / Social Media
  const handleCopyFullFatwa = () => {
    const formatted = `بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
✍🏻 *سؤال السائل:*
${cleanQuestion}

📖 *جواب فضيلة الشيخ د. عبد الباري خلة:*
${tashkeelAnswer}

${!tashkeelAnswer.includes("والله أعلم") ? "وَاللَّهُ تَعَالَى أَعْلَى وَأَعْلَمُ\n" : ""}
───────────────
📚 *فتاوى فضيلة الشيخ الدكتور عبد الباري خلة*
رقم الفتوى: #${fatwa.fatwaNumber || "عامة"}
الصفحة الرسمية للفتاوى الشرعية`;

    handleCopy(formatted, "full", "تم نسخ الفتوى كاملة منسقة للنشر في واتساب وتيليغرام! ✨");
  };

  // On-demand AI Vocalization / Tashkeel if text lacks diacritics
  const handleApplyAITashkeel = async () => {
    setIsVocalizingWithAI(true);
    showToast("جاري ضبط وتشكيل النص بالحركات الإعرابية التامة بالذكاء الاصطناعي...", "info");
    try {
      const res = await fetch("/api/tashkeel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: fatwa.answer_clean || fatwa.transcription_raw,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "تعذر إتمام التشكيل");
      }

      const vocalizedText = data.vocalized;
      if (onUpdateFatwa) {
        const updated: Fatwa = {
          ...fatwa,
          answer_tashkeel: vocalizedText,
          updated_at: new Date().toISOString(),
        };
        onUpdateFatwa(updated);
      }
      setEditAnswerText(vocalizedText);
      setActiveAnswerMode("tashkeel");
      showToast("تم ضبط وتشكيل نص جواب الشيخ بالحركات التامة بنجاح! 📜✨", "success");
    } catch (err: any) {
      console.error(err);
      showToast("تعذر التشكيل: " + (err.message || "خطأ غير متوقع"), "error");
    } finally {
      setIsVocalizingWithAI(false);
    }
  };

  // Download Ottoman Card as PNG directly from this modal
  const handleDownloadOttomanCard = async () => {
    if (!modalCardRef.current) return;
    setIsExportingCard(true);
    showToast("جاري تجهيز صورة البطاقة العثمانية بجودة عالية...", "info");
    try {
      const dataUrl = await toPng(modalCardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#fffdf9",
      });

      const link = document.createElement("a");
      link.download = `بطاقة_عثمانية_فتوى_${fatwa.fatwaNumber || Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      showToast("تم تحميل صورة البطاقة العثمانية بنجاح! 📜", "success");
    } catch (err) {
      console.error("Failed to export card:", err);
      showToast("تعذر تصدير البطاقة كصورة", "error");
    } finally {
      setIsExportingCard(false);
    }
  };

  // Text to Speech
  const toggleSpeech = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      showToast("ميزة النطق الصوتي غير مدعومة في متصفحك", "info");
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const textToRead = `${cleanQuestion}. جواب الشيخ: ${activeAnswerMode === "tashkeel" ? tashkeelAnswer : standardAnswer}`;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = "ar-SA";
    utterance.rate = 0.9;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  // Save manual edits
  const handleSaveQuestionEdit = () => {
    if (onUpdateFatwa) {
      const clean = sanitizeQuestionGreeting(editQuestionText);
      onUpdateFatwa({
        ...fatwa,
        question_clean: clean,
        updated_at: new Date().toISOString(),
      });
      showToast("تم حفظ تعديل السؤال بنجاح", "success");
    }
    setIsEditingQuestion(false);
  };

  const handleSaveAnswerEdit = () => {
    if (onUpdateFatwa) {
      onUpdateFatwa({
        ...fatwa,
        answer_tashkeel: editAnswerText,
        answer_clean: editAnswerText.replace(/[\u064B-\u065F\u0670]/g, ""),
        updated_at: new Date().toISOString(),
      });
      showToast("تم حفظ نص الجواب بالحركات بنجاح", "success");
    }
    setIsEditingAnswer(false);
  };

  // Calculate word and character count for Arabic precision
  const qWordsCount = cleanQuestion.trim().split(/\s+/).filter(Boolean).length;
  const aWordsCount = (activeAnswerMode === "tashkeel" ? tashkeelAnswer : standardAnswer)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-[#fffdfa] rounded-3xl border-2 border-[#caa24d] shadow-[0_20px_60px_rgba(0,0,0,0.3)] w-full max-w-4xl overflow-hidden flex flex-col max-h-[94vh] relative">
        {/* Top Islamic Crown Bar */}
        <div className="bg-gradient-to-r from-[#082a20] via-[#0c392c] to-[#082a20] text-amber-200 px-4 sm:px-6 py-3 border-b-2 border-[#caa24d] flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 shrink-0 shadow-inner">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold font-cairo text-white">
                  شاشة تفاصيل الفتوى العربية الشاملة
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-400/20 text-amber-200 border border-amber-300/40">
                  السؤال منفرداً • الجواب بالحركات 📜
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/90 font-tajawal hidden sm:block">
                فتاوى فضيلة الشيخ الدكتور عبد الباري محمد خلة — بالرسم والضبط العثماني المنقح
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-stone-200 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
            title="إغلاق الشاشة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1 text-right">
          {/* Header Bismillah & Verses Banner */}
          <div className="text-center space-y-2 py-2 border-b border-[#caa24d]/30 relative">
            <div className="font-uthmanic text-2xl sm:text-3xl font-bold text-[#0c392c] tracking-wide drop-shadow-2xs select-none">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f6f0e2] border border-[#caa24d]/60 text-xs sm:text-sm font-uthmanic text-[#7a5316] font-bold">
              <span>﴿ فَاسْأَلُوا أَهْلَ الذِّكْرِ إِن كُنتُمْ لَا تَعْلَمُونَ ﴾</span>
            </div>
            <div className="text-xs sm:text-sm font-bold font-cairo text-stone-700 flex items-center justify-center gap-2 pt-1 flex-wrap">
              <span className="text-[#0c392c] font-amiri text-base font-bold">
                فضيلة الشيخ الدكتور عبد الباري محمد خلة
              </span>
              <span>•</span>
              <span className="text-stone-500 font-normal">
                {fatwa.mediaType === "video" || fatwa.audio_file?.isVideo
                  ? "مفرّغة من مقطع فيديو مرئي 📹"
                  : "مفرّغة من تسجيل صوتي 🎙️"}
              </span>
            </div>

            {/* Metadata Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] font-tajawal text-stone-600">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold font-cairo">
                <Hash className="w-3 h-3 text-emerald-700" />
                <span>فتوى رقم: #{fatwa.fatwaNumber || "عامة"}</span>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-bold font-cairo">
                <Bookmark className="w-3 h-3 text-amber-700" />
                <span>{fatwa.category || "فتاوى عامة"}</span>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-stone-100 border border-stone-200 text-stone-700">
                <Calendar className="w-3 h-3 text-stone-500" />
                <span>{new Date(fatwa.created_at || Date.now()).toLocaleDateString("ar-SA", { dateStyle: "full" })}</span>
              </span>

              {fatwa.fatwaType === "moasala" && (
                <span className="px-2.5 py-1 rounded-xl bg-[#0c392c] text-amber-200 font-bold text-[11px]">
                  فتوى مؤصلة بالأدلة
                </span>
              )}
            </div>
          </div>

          {/* Quick Action Buttons Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-[#f8f5ee] border border-[#e5d8be]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold font-cairo text-stone-700">التحكم بالعرض:</span>
              {/* Tashkeel vs Clean Selector */}
              <div className="flex items-center p-0.5 bg-white rounded-xl border border-stone-300 text-xs font-cairo">
                <button
                  type="button"
                  onClick={() => setActiveAnswerMode("tashkeel")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeAnswerMode === "tashkeel"
                      ? "bg-[#0c392c] text-amber-200 shadow-2xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>المشكول بالحركات 📜</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAnswerMode("clean")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    activeAnswerMode === "clean"
                      ? "bg-stone-200 text-stone-900 shadow-2xs font-bold"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <span>نص بدون حركات</span>
                </button>
              </div>

              {/* Font scaling */}
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-stone-300 text-xs text-stone-700">
                <button
                  type="button"
                  onClick={() => setFontScale((s) => Math.max(0.85, s - 0.1))}
                  className="p-1 hover:bg-stone-100 rounded cursor-pointer"
                  title="تصغير الخط"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold px-1 text-[11px]">
                  {Math.round(fontScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setFontScale((s) => Math.min(1.4, s + 0.1))}
                  className="p-1 hover:bg-stone-100 rounded cursor-pointer"
                  title="تكبير الخط"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Audio Listen Speech */}
              <button
                type="button"
                onClick={toggleSpeech}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold font-cairo transition-all cursor-pointer ${
                  isSpeaking
                    ? "bg-red-50 border-red-300 text-red-700"
                    : "bg-white border-stone-300 text-stone-700 hover:bg-stone-50"
                }`}
                title={isSpeaking ? "إيقاف القراءة" : "استماع للفتوى صوتياً"}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-700" />}
                <span>{isSpeaking ? "إيقاف الصوت" : "استماع"}</span>
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {onNavigateToCard && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToCard();
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0c392c] hover:bg-[#07241c] text-amber-200 font-bold font-cairo text-xs shadow-xs transition-all cursor-pointer active:scale-95"
                >
                  <IslamicStarIcon className="w-3.5 h-3.5" />
                  <span>فتح في استوديو البطاقة العثمانية 📜</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyFullFatwa}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-cairo text-xs shadow-xs transition-all cursor-pointer active:scale-95"
              >
                {copiedSection === "full" ? <Check className="w-3.5 h-3.5 text-amber-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSection === "full" ? "تم نسخ الفتوى كاملة!" : "نسخ الفتوى للنشر (WhatsApp)"}</span>
              </button>
            </div>
          </div>

          {/* SECTION 1: QUESTION ALONE (السؤال لحال) */}
          <div className="bg-[#fcfaf5] rounded-3xl border-2 border-[#caa24d]/70 overflow-hidden shadow-xs">
            {/* Header of Question */}
            <div className="bg-[#f4ebd9] px-4 sm:px-5 py-3 border-b border-[#caa24d]/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-amber-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                  ؟
                </div>
                <div>
                  <h3 className="font-bold font-cairo text-stone-900 text-sm sm:text-base flex items-center gap-2">
                    <span>نص سؤال السائل (مفرداً ومنقحاً):</span>
                    <span className="text-[10px] font-tajawal bg-amber-100 text-amber-900 border border-amber-300/80 px-2 py-0.5 rounded-full font-bold">
                      السؤال لحال ✓
                    </span>
                  </h3>
                  <span className="text-[11px] text-stone-500 font-tajawal">
                    {qWordsCount} كلمة • {cleanQuestion.length} حرف
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEditingQuestion(!isEditingQuestion)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white border border-stone-300 hover:bg-stone-50 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3 text-stone-500" />
                  <span>{isEditingQuestion ? "إلغاء التعديل" : "تعديل"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopy(cleanQuestion, "question", "تم نسخ نص السؤال منفرداً بنجاح! 📋")}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-amber-950 bg-amber-200/90 hover:bg-amber-300 border border-amber-400 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  {copiedSection === "question" ? <Check className="w-3.5 h-3.5 text-emerald-800" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSection === "question" ? "تم النسخ!" : "نسخ السؤال فقط"}</span>
                </button>
              </div>
            </div>

            {/* Question Text Body */}
            <div className="p-4 sm:p-5">
              {isEditingQuestion ? (
                <div className="space-y-3">
                  <textarea
                    rows={4}
                    value={editQuestionText}
                    onChange={(e) => setEditQuestionText(e.target.value)}
                    className="w-full p-3 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 leading-relaxed font-tajawal"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingQuestion(false)}
                      className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveQuestionEdit}
                      className="px-4 py-1.5 rounded-lg bg-[#0c392c] text-white text-xs font-bold font-cairo hover:bg-[#07241c] cursor-pointer"
                    >
                      حفظ التعديل
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{ fontSize: `${fontScale * 15}px` }}
                  className="font-tajawal text-stone-900 font-semibold leading-relaxed bg-white/80 p-4 rounded-2xl border border-[#caa24d]/30"
                >
                  {cleanQuestion}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: SHEIKH'S ANSWER WITH FULL TASHKEEL (نص الجواب بالحركات وكل التفاصيل) */}
          <div className="bg-[#fffdf9] rounded-3xl border-2 border-[#0c392c] overflow-hidden shadow-md">
            {/* Header of Answer */}
            <div className="bg-[#0c392c] text-white px-4 sm:px-5 py-3.5 border-b border-[#caa24d] flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <IslamicStarIcon className="w-5 h-5 text-amber-300" />
                <div>
                  <h3 className="font-bold font-cairo text-sm sm:text-base text-amber-200 flex items-center gap-2">
                    <span>جواب فضيلة الشيخ د. عبد الباري خلة:</span>
                    {activeAnswerMode === "tashkeel" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-stone-950">
                        مَشْكُولٌ بِالحَرَكَاتِ التَّامَّةِ 📜
                      </span>
                    )}
                  </h3>
                  <span className="text-[11px] text-emerald-200/90 font-tajawal">
                    {aWordsCount} كلمة • {activeAnswerMode === "tashkeel" ? "رسم عثماني مشكول" : "نص منقح"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* On-demand vocalization button */}
                <button
                  type="button"
                  onClick={handleApplyAITashkeel}
                  disabled={isVocalizingWithAI}
                  className="px-3 py-1 rounded-lg text-xs font-bold font-cairo bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-300/40 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  title="إعادة تشكيل أو ضبط الحركات الإعرابية بالذكاء الاصطناعي"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isVocalizingWithAI ? "جاري التشكيل..." : "إعادة تشكيل بالحركات"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditingAnswer(!isEditingAnswer)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-200 hover:text-white bg-white/10 hover:bg-white/20 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditingAnswer ? "إلغاء" : "تعديل الجواب"}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      activeAnswerMode === "tashkeel" ? tashkeelAnswer : standardAnswer,
                      "answer",
                      activeAnswerMode === "tashkeel"
                        ? "تم نسخ نص الجواب مشكولاً بالحركات التامة! 📜✨"
                        : "تم نسخ نص الجواب بنجاح!"
                    )
                  }
                  className="px-3 py-1 rounded-lg text-xs font-bold text-[#0c392c] bg-amber-300 hover:bg-amber-200 border border-amber-400 transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                >
                  {copiedSection === "answer" ? <Check className="w-3.5 h-3.5 text-emerald-900" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSection === "answer" ? "تم النسخ!" : "نسخ الجواب بالحركات"}</span>
                </button>
              </div>
            </div>

            {/* Answer Text Body */}
            <div className="p-4 sm:p-6 bg-gradient-to-b from-[#fbf9f4] to-[#fffdf9]">
              {isEditingAnswer ? (
                <div className="space-y-3">
                  <textarea
                    rows={8}
                    value={editAnswerText}
                    onChange={(e) => setEditAnswerText(e.target.value)}
                    className="w-full p-4 rounded-xl border border-stone-300 bg-white text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 leading-8 font-uthmanic"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingAnswer(false)}
                      className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAnswerEdit}
                      className="px-4 py-1.5 rounded-lg bg-[#0c392c] text-white text-xs font-bold font-cairo hover:bg-[#07241c] cursor-pointer"
                    >
                      حفظ الجواب
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    style={{ fontSize: `${fontScale * 17}px`, lineHeight: `${fontScale * 34}px` }}
                    className={`text-stone-950 whitespace-pre-wrap selection:bg-amber-200 p-4 sm:p-5 rounded-2xl bg-white border border-[#caa24d]/40 shadow-2xs tracking-wide ${
                      activeAnswerMode === "tashkeel" ? "font-uthmanic" : "font-tajawal font-medium"
                    }`}
                  >
                    {activeAnswerMode === "tashkeel" ? tashkeelAnswer : standardAnswer}
                  </div>

                  {/* Wallahu Aalam Seal */}
                  <div className="pt-3 border-t border-[#caa24d]/40 flex items-center justify-between">
                    <div className="font-uthmanic text-base sm:text-lg font-bold text-[#0c392c]">
                      وَاللَّهُ تَعَالَى أَعْلَى وَأَعْلَمُ
                    </div>
                    <span className="text-xs font-tajawal text-stone-500">
                      ختام شرعي معتمد
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: EVIDENCE CITATIONS & ARABIC DETAILS (كل التفاصيل العربية) */}
          {fatwa.evidence_citations && fatwa.evidence_citations.length > 0 && (
            <div className="bg-amber-50/70 rounded-2xl border border-amber-300/80 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold font-cairo text-amber-950">
                <BookOpen className="w-4 h-4 text-amber-700" />
                <span>الشواهد والأدلة الشرعية المستخرجة من الفتوى:</span>
              </div>
              <ul className="space-y-1.5 text-xs font-tajawal text-stone-800 pr-4 list-disc">
                {fatwa.evidence_citations.map((cite, i) => (
                  <li key={i} className="leading-relaxed">
                    {cite}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* SECTION 4: THE LIVE OTTOMAN CARD EMBEDDED PREVIEW (البطاقة العثمانية) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IslamicStarIcon className="w-4 h-4 text-[#caa24d]" />
                <h3 className="font-bold font-cairo text-sm sm:text-base text-stone-900">
                  معاينة البطاقة العثمانية الفاخرة (جاهزة للتنزيل أو التخصيص):
                </h3>
              </div>
              <button
                type="button"
                onClick={handleDownloadOttomanCard}
                disabled={isExportingCard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0c392c] hover:bg-[#07241c] text-white font-bold font-cairo text-xs shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-amber-300" />
                <span>{isExportingCard ? "جارٍ التحميل..." : "تحميل البطاقة صورة (PNG)"}</span>
              </button>
            </div>

            {/* Ottoman Card Canvas Component for direct export (Square 1:1) */}
            <div className="p-3 sm:p-5 bg-stone-100 rounded-3xl border border-stone-300 flex items-center justify-center overflow-x-auto">
              <div
                ref={modalCardRef}
                dir="rtl"
                style={{
                  aspectRatio: "1 / 1",
                }}
                className="w-full max-w-[480px] aspect-square bg-[#fffdf9] border-[3.5px] border-[#0c392c] rounded-[22px] p-[7px] sm:p-[9px] relative shadow-xl select-none flex flex-col justify-between text-right"
              >
                {/* Inner Gold Quranic Frame */}
                <div className="bg-[#fffdf9] border-[1.8px] border-[#caa24d] rounded-[15px] p-4 sm:p-5 flex-1 flex flex-col justify-between relative overflow-hidden min-h-0">
                  {/* Header */}
                  <div className="border-b-[1.5px] border-[#caa24d]/40 pb-2 mb-2 text-center relative shrink-0">
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
                    <div className="rounded-xl overflow-hidden shadow-2xs border border-[#caa24d]/60 bg-[#fbf8f0] shrink-0">
                      <div className="bg-[#0c392c] text-white px-3 py-1 flex items-center justify-between text-xs font-bold font-cairo">
                        <span className="text-xs sm:text-sm text-amber-200">السؤال:</span>
                        {fatwa.fatwaNumber && (
                          <span className="text-[10px] font-mono text-emerald-200">
                            #{fatwa.fatwaNumber}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 sm:p-3 text-right">
                        <p className="font-uthmanic text-xs sm:text-[13px] text-stone-900 leading-snug sm:leading-relaxed font-semibold">
                          {cleanTashkeelText(cleanQuestion)}
                        </p>
                      </div>
                    </div>

                    {/* Answer Box */}
                    <div className="rounded-xl overflow-hidden shadow-2xs border border-[#caa24d] bg-white flex-1 flex flex-col min-h-0">
                      <div className="bg-[#caa24d] text-[#0c392c] px-3.5 py-1 text-xs font-bold font-cairo flex items-center justify-between shrink-0">
                        <span className="text-xs sm:text-sm font-bold">الجواب:</span>
                        <span className="text-[10px] font-mono font-bold bg-[#0c392c] text-amber-200 px-1.5 py-0.2 rounded">
                          مشكول 📜
                        </span>
                      </div>
                      <div className="p-3 sm:p-3.5 text-right flex-1 flex flex-col justify-between overflow-y-auto">
                        <div
                          className={`font-uthmanic text-stone-950 whitespace-pre-wrap ${
                            tashkeelAnswer.length < 180
                              ? "text-sm sm:text-[15px] leading-relaxed sm:leading-7"
                              : tashkeelAnswer.length < 400
                              ? "text-xs sm:text-[13px] leading-relaxed sm:leading-6"
                              : "text-[11px] sm:text-[12px] leading-normal sm:leading-5"
                          }`}
                        >
                          {cleanTashkeelText(tashkeelAnswer)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-2 mt-2 border-t border-[#caa24d]/40 flex items-center justify-between text-[11px] sm:text-xs text-[#0c392c] font-cairo select-none shrink-0">
                    <span className="font-bold text-xs sm:text-sm">والله تعالى أعلم</span>
                    <span className="text-[10px] sm:text-[11px] text-stone-600 font-semibold">
                      الصفحة الرسمية للفتاوى • د. عبد الباري خلة
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="bg-[#f8f5ee] px-4 sm:px-6 py-3.5 border-t border-[#caa24d]/40 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div className="text-xs text-stone-600 font-tajawal flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>نظام الأمانة العلمية والتفريغ الحرفي لفتاوى الشيخ د. عبد الباري خلة</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-300 hover:bg-stone-100 text-stone-700 text-xs font-bold font-cairo transition-colors cursor-pointer"
            >
              إغلاق
            </button>

            {onNavigateToCard && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToCard();
                }}
                className="px-5 py-2 rounded-xl bg-[#0c392c] hover:bg-[#07241c] text-amber-200 text-xs font-bold font-cairo shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>الانتقال لمحرر البطاقة العثمانية 📜</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
