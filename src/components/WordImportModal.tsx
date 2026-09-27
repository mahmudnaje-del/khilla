import React, { useState, useRef } from "react";
import {
  FileText,
  UploadCloud,
  ClipboardPaste,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  Edit3,
  BookOpen,
  ArrowRight,
  Loader2,
  FileCheck2,
  HelpCircle,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { parseWordDocFile, parseWordRawText, ParsedWordFatwa } from "../utils/wordParser";
import { Fatwa } from "../types";

interface WordImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFatwas: (fatwas: Partial<Fatwa>[], openFirstForReview?: boolean) => void;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}

export const WordImportModal: React.FC<WordImportModalProps> = ({
  isOpen,
  onClose,
  onImportFatwas,
  showToast,
}) => {
  const [activeInputMode, setActiveInputMode] = useState<"file" | "text">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Result state
  const [extractedFatwas, setExtractedFatwas] = useState<ParsedWordFatwa[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".docx") && !file.name.toLowerCase().endsWith(".doc") && !file.name.toLowerCase().endsWith(".txt")) {
        setErrorMessage("يرجى اختيار ملف Word بصيغة (.docx) أو (.doc) أو (.txt)");
        return;
      }
      setSelectedFile(file);
      setErrorMessage(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".docx") && !file.name.toLowerCase().endsWith(".doc") && !file.name.toLowerCase().endsWith(".txt")) {
        setErrorMessage("يرجى سحب ملف Word بصيغة (.docx) أو (.doc)");
        return;
      }
      setSelectedFile(file);
      setErrorMessage(null);
    }
  };

  const handleStartExtraction = async () => {
    setErrorMessage(null);
    setIsProcessing(true);

    try {
      let result;
      if (activeInputMode === "file") {
        if (!selectedFile) {
          setErrorMessage("يرجى اختيار ملف Word أولاً");
          setIsProcessing(false);
          return;
        }
        result = await parseWordDocFile(selectedFile);
      } else {
        if (!rawText.trim()) {
          setErrorMessage("يرجى لصق نصوص الفتاوى في المربع أدناه");
          setIsProcessing(false);
          return;
        }
        result = await parseWordRawText(rawText);
      }

      if (result.success && result.fatwas.length > 0) {
        setExtractedFatwas(result.fatwas);
        showToast(
          `تم بنجاح استخراج وتفريغ ${result.fatwas.length} فتوى من ملف Word!`,
          "success"
        );
      } else {
        setErrorMessage(result.error || "لم يتم العثور على فتاوى واضحة في الملف. يرجى التأكد من محتواه.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "حدث خطأ غير متوقع أثناء المعالجة");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteFatwa = (index: number) => {
    setExtractedFatwas((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateFatwaItem = (index: number, field: keyof ParsedWordFatwa, value: any) => {
    setExtractedFatwas((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const handleConfirmImport = (openReview: boolean = true) => {
    if (extractedFatwas.length === 0) return;

    const formattedFatwas: Partial<Fatwa>[] = extractedFatwas.map((f, i) => ({
      question_original: f.question_original,
      question_clean: f.question_clean,
      transcription_raw: f.answer_clean,
      answer_clean: f.answer_clean,
      category: f.category || "فتاوى عامة",
      tags: f.tags && f.tags.length ? f.tags : ["مستورد من Word"],
      has_wallahu_aalam: f.has_wallahu_aalam ?? true,
      status: "تحتاج مراجعة",
      reviewed: false,
      approved: false,
      editing_notes: [
        f.notes || "مستورد ومفرغ من ملف Word",
        `تمت الإضافة الجماعية (${i + 1} من ${extractedFatwas.length})`,
      ],
    }));

    onImportFatwas(formattedFatwas, openReview);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0c392c] text-white p-5 sm:p-6 relative flex items-center justify-between border-b border-emerald-800/40">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 shadow-inner">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-800/80 text-amber-300 border border-emerald-600/40 text-[11px] font-bold font-cairo mb-1">
                <Sparkles className="w-3 h-3" />
                <span>ميزة التفريغ الجماعي الذكي</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold font-cairo text-white">
                تفريغ واستيراد حزمة فتاوى من ملف Word
              </h3>
              <p className="text-xs text-emerald-200/90 font-tajawal mt-0.5">
                ارفع ملف وورد يحتوي على فتاوى وأسئلة وأجوبة لتفريغها وفصلها تلقائياً وإدراجها في الأرشيف
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {extractedFatwas.length === 0 ? (
            <>
              {/* Input Mode Selector */}
              <div className="flex items-center justify-center gap-2 p-1.5 bg-stone-100 rounded-2xl border border-stone-200/80 max-w-md mx-auto">
                <button
                  type="button"
                  onClick={() => setActiveInputMode("file")}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold font-cairo flex items-center justify-center gap-2 transition-all ${
                    activeInputMode === "file"
                      ? "bg-white text-[#0c392c] shadow-xs border border-stone-200/80"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <UploadCloud className="w-4 h-4 text-emerald-700" />
                  <span>رفع ملف وورد (.docx)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveInputMode("text")}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold font-cairo flex items-center justify-center gap-2 transition-all ${
                    activeInputMode === "text"
                      ? "bg-white text-[#0c392c] shadow-xs border border-stone-200/80"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <ClipboardPaste className="w-4 h-4 text-emerald-700" />
                  <span>لصق نصوص من Word</span>
                </button>
              </div>

              {/* Mode 1: File Upload */}
              {activeInputMode === "file" && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.doc,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
                      selectedFile
                        ? "border-emerald-500 bg-emerald-50/30"
                        : "border-stone-300 hover:border-emerald-600 hover:bg-stone-50/80"
                    }`}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-emerald-100/70 text-emerald-800 flex items-center justify-center mx-auto mb-3 shadow-xs">
                      <FileCheck2 className="w-8 h-8" />
                    </div>

                    {selectedFile ? (
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold font-cairo">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>تم اختيار الملف بنجاح</span>
                        </div>
                        <p className="text-sm font-bold text-stone-900 font-cairo">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-stone-500">
                          الحجم: {(selectedFile.size / 1024).toFixed(1)} كيلوبايت
                        </p>
                        <p className="text-xs text-emerald-700 font-semibold pt-1">
                          انقر هنا لتغيير الملف أو اسحب ملفاً جديداً
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm sm:text-base font-bold text-stone-800 font-cairo">
                          اضغط لاختيار ملف Word (.docx) أو اسحبه إلى هنا
                        </p>
                        <p className="text-xs text-stone-500 font-tajawal max-w-md mx-auto">
                          يقوم النظام بقراءة الملف وفصل كل سؤال وجواب بدقة وترتيب النص إملائياً ولغوياً
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mode 2: Text Paste */}
              {activeInputMode === "text" && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-stone-700 font-cairo text-right">
                    الصق النصوص الكاملة للفتاوى هنا:
                  </label>
                  <textarea
                    rows={8}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="الصق نصوص الأسئلة والأجوبة كما هي في ملف Word (سواء كانت مرقمة، أو تبدأ بـ س: ج:، أو السؤال / الجواب)..."
                    className="w-full p-4 rounded-2xl border border-stone-300 bg-stone-50 text-stone-900 text-xs sm:text-sm font-tajawal focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 transition-all resize-y"
                  />
                  <p className="text-[11px] text-stone-500 font-tajawal text-right">
                    * يتعرف الذكاء الاصطناعي تلقائياً على بدايات الأسئلة والأجوبة ويفصل كل فتوى على حدة.
                  </p>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-tajawal flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isProcessing || (activeInputMode === "file" && !selectedFile) || (activeInputMode === "text" && !rawText.trim())}
                  onClick={handleStartExtraction}
                  className="w-full py-3.5 px-6 rounded-2xl bg-[#0c392c] hover:bg-[#14532d] active:scale-[0.99] text-amber-300 font-bold font-cairo text-sm shadow-md transition-all flex items-center justify-center gap-2 border border-emerald-700/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-amber-300" />
                      <span>جارٍ قراءة الملف وفرز الفتاوى بالذكاء الاصطناعي...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-amber-300" />
                      <span>بدء تفريغ واستخراج الفتاوى من الملف</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Result Preview & Batch Management */
            <div className="space-y-4">
              {/* Header Stats */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                    {extractedFatwas.length}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold font-cairo text-emerald-950">
                      تم استخراج {extractedFatwas.length} فتوى جاهزة للمراجعة
                    </h4>
                    <p className="text-xs text-emerald-800/80 font-tajawal">
                      يمكنك مراجعة وتعديل أي فتوى الآن أو إدراجها مباشرة في الأرشيف
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setExtractedFatwas([]);
                    setSelectedFile(null);
                    setRawText("");
                  }}
                  className="text-xs text-stone-600 hover:text-stone-900 font-bold px-3 py-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 transition-colors"
                >
                  رفع ملف آخر
                </button>
              </div>

              {/* Extracted Fatwas List */}
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {extractedFatwas.map((fatwa, idx) => {
                  const isExpanded = expandedIndex === idx;
                  const isEditingThis = editingIndex === idx;

                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl border border-stone-200 bg-white hover:border-emerald-300 transition-all shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-stone-100 text-stone-700 text-xs font-bold flex items-center justify-center font-mono">
                            {idx + 1}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-100/70 text-amber-900 text-[11px] font-bold">
                            {fatwa.category || "فتاوى عامة"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingIndex(isEditingThis ? null : idx)}
                            className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title={isEditingThis ? "حفظ التعديل" : "تعديل نص الفتوى"}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFatwa(idx)}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="حذف هذه الفتوى من القائمة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
                            title={isExpanded ? "طي" : "عرض كامل النص"}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Question and Answer Preview / Edit */}
                      {isEditingThis ? (
                        <div className="space-y-3 pt-2 border-t border-stone-100">
                          <div>
                            <label className="block text-[11px] font-bold text-stone-700 mb-1">
                              السؤال المنقّح:
                            </label>
                            <textarea
                              rows={2}
                              value={fatwa.question_clean}
                              onChange={(e) => handleUpdateFatwaItem(idx, "question_clean", e.target.value)}
                              className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-tajawal focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-stone-700 mb-1">
                              جواب الشيخ:
                            </label>
                            <textarea
                              rows={4}
                              value={fatwa.answer_clean}
                              onChange={(e) => handleUpdateFatwaItem(idx, "answer_clean", e.target.value)}
                              className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-tajawal focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setEditingIndex(null)}
                              className="px-3 py-1 rounded-lg bg-emerald-700 text-white text-xs font-bold font-cairo hover:bg-emerald-800"
                            >
                              تم التعديل
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 text-right">
                          <p className="text-xs sm:text-sm font-bold text-stone-900 font-tajawal">
                            <span className="text-emerald-800 ml-1">س:</span>
                            {fatwa.question_clean}
                          </p>
                          <p className={`text-xs text-stone-700 font-tajawal leading-relaxed ${isExpanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}>
                            <span className="text-amber-800 font-bold ml-1">ج:</span>
                            {fatwa.answer_clean}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons for Batch Import */}
              <div className="pt-3 border-t border-stone-200 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleConfirmImport(true)}
                    className="py-3.5 px-4 rounded-2xl bg-[#0c392c] hover:bg-[#14532d] active:scale-[0.99] text-amber-300 font-bold font-cairo text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 border border-emerald-700/50 cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4 text-amber-300" />
                    <span>حفظ وبدء فحص واعتماد الفتاوى بالترتيب</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleConfirmImport(false)}
                    className="py-3.5 px-4 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold font-cairo text-xs sm:text-sm transition-all flex items-center justify-center gap-2 border border-stone-300 cursor-pointer"
                  >
                    <Layers className="w-4 h-4 text-stone-600" />
                    <span>إدراج في الأرشيف (قيد المراجعة)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
