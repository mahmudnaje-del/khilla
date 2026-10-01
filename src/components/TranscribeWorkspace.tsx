import React, { useState, useRef, useEffect } from "react";
import { toPng, toBlob } from "html-to-image";
import {
  UploadCloud,
  FileAudio,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RotateCcw,
  Volume2,
  Wand2,
  ChevronDown,
  Info,
  Copy,
  ClipboardPaste,
  Image as ImageIcon,
  Check,
  ExternalLink,
  Edit3,
  Share2,
  Download,
  HelpCircle,
  FileCheck2,
  Sliders,
  FileText,
  BookOpen,
  Wifi,
  WifiOff,
  Cpu,
  Globe,
  HardDriveDownload,
  Video,
} from "lucide-react";
import { fileToBase64, formatDuration, formatFileSize } from "../utils/audioHelper";
import { Fatwa, TranscribeResponse } from "../types";
import { DEFAULT_TEMPLATE_SETTINGS, getPreferredTemplateStyle, setPreferredTemplateStyle } from "../utils/storage";
import {
  wasOpenedFromShare,
  getShareTargetInfo,
  consumeSharedAudio,
  deleteConsumedShareCache,
  consumeSharedText,
  listenForOpenedFiles,
  markShareMissed,
  clearPendingShare,
  clearAllOldShareCaches,
} from "../utils/shareTarget";
import ThinkingLogo from "./ThinkingLogo";
import { WordImportModal } from "./WordImportModal";
import {
  sanitizeQuestionGreeting,
  hasQuestionGreetingIssue,
  extractWhatsAppQAndA,
  hasAnswerInQuestion,
  cleanQuestionAnswerBleed,
  separateQuestionAndAnswer,
  questionFromSharedCaption,
  isSenderNameOnly,
  isRealQuestionText,
} from "../utils/greetingSanitizer";
import { ArabicFatwaDetailsModal } from "./ArabicFatwaDetailsModal";
import { cleanTashkeelText, formatVocalizedFatwaForCopy } from "../utils/tashkeelHelper";
import {
  isWhisperModelCached,
  preloadWhisperModel,
  transcribeAudioLocally,
  polishOfflineFatwaWithGemini,
  getWhisperStorageDetails,
  clearWhisperCache,
  WhisperStorageInfo,
  OfflineTranscribeProgress,
} from "../utils/offlineWhisper";

interface TranscribeWorkspaceProps {
  onTranscribeComplete: (fatwaData: Partial<Fatwa>) => void;
  onBatchImportFatwas?: (fatwas: Partial<Fatwa>[], openFirstForReview?: boolean) => void;
  strictMode: boolean;
  setStrictMode: (val: boolean) => void;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onNavigateToCard?: () => void;
  onNavigateToReview?: () => void;
  onOpenArabicDetails?: (fatwa: Fatwa) => void;
}

const SAMPLE_QUESTIONS = [
  "صلاة الوتر بعد الفجر",
  "نسيان صلاة الفجر",
  "زكاة مال الزواج",
  "سجود السهو"
];

const SAMPLE_FULL_QUESTIONS: Record<string, string> = {
  "صلاة الوتر بعد الفجر": "السلام عليكم شيخنا، هل يجوز أن أصلي الوتر بعد أذان الفجر إذا استيقظت متأخراً؟",
  "نسيان صلاة الفجر": "السلام عليكم شيخ انا بدي اسال اذا الواحد نسي صلاة الفجر وبعدين تذكرها بعد الظهر شو يعمل؟",
  "زكاة مال الزواج": "يا شيخ عندي مبلغ جمعته عشان بدي اتزوج بعد سنة، هل عليه زكاة اذا حال عليه الحول وهو بالغ النصاب؟",
  "سجود السهو": "السلام عليكم دكتور، هل يصح سجود السهو قبل السلام أم بعده في حال الزيادة والنقصان؟"
};

export const TranscribeWorkspace: React.FC<TranscribeWorkspaceProps> = ({
  onTranscribeComplete,
  onBatchImportFatwas,
  strictMode,
  setStrictMode,
  showToast,
  onNavigateToCard,
  onNavigateToReview,
  onOpenArabicDetails,
}) => {
  const [question, setQuestion] = useState("");
  const [isWordModalOpen, setIsWordModalOpen] = useState(false);
  const [isArabicDetailsModalOpen, setIsArabicDetailsModalOpen] = useState(false);
  const [audioFile, setAudioFile] = useState<{
    file?: File;
    name: string;
    size: number;
    duration?: number;
    dataUrl?: string;
    mimeType: string;
    isVideo?: boolean;
  } | null>(null);

  // Separation of Media: audio (فتوى عادية / مؤصلة) vs video (فيديو مرئي)
  const [mediaMode, setMediaMode] = useState<"audio" | "video">("audio");
  // Fatwa mode: normal (عادية) vs moasala (مؤصلة)
  const [fatwaType, setFatwaType] = useState<"normal" | "moasala">("normal");
  // Full vocalization & diacritics
  const [requestTashkeel, setRequestTashkeel] = useState<boolean>(false);
  // Result view tabs & card preview style
  const [resultTextTab, setResultTextTab] = useState<"clean" | "tashkeel">("clean");
  const [previewCardStyle, setPreviewCardStyle] = useState<"official_khalla" | "uthmanic">(() => {
    const pref = getPreferredTemplateStyle();
    return pref === "uthmanic" ? "uthmanic" : "official_khalla";
  });

  useEffect(() => {
    const handleTemplateChanged = (e: any) => {
      const newStyle = e.detail || getPreferredTemplateStyle();
      setPreviewCardStyle(newStyle === "uthmanic" ? "uthmanic" : "official_khalla");
    };
    window.addEventListener("default-template-changed", handleTemplateChanged);
    return () => window.removeEventListener("default-template-changed", handleTemplateChanged);
  }, []);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Text-only fallback
  const [showManualTranscriptInput, setShowManualTranscriptInput] = useState(false);
  const [manualRawText, setManualRawText] = useState("");

  // Processing & result state
  const [isReceivingShare, setIsReceivingShare] = useState(false);
  const [shareBlocked, setShareBlocked] = useState(false);
  const [sharedVoiceSenderName, setSharedVoiceSenderName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<number>(1);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<TranscribeResponse | null>(null);
  const [hasCopiedFinal, setHasCopiedFinal] = useState(false);
  const [currentTranscribeAction, setCurrentTranscribeAction] = useState<"normal" | "audio_only">("normal");

  // شاشة نسخ الفتوى المشكولة بالحركات وتعديلها (مخصصة للفيديو والتشكيل المتقن)
  const [isEditingTashkeel, setIsEditingTashkeel] = useState(false);
  const [editableQuestionTashkeel, setEditableQuestionTashkeel] = useState("");
  const [editableAnswerTashkeel, setEditableAnswerTashkeel] = useState("");
  const [hasCopiedQuestionTashkeel, setHasCopiedQuestionTashkeel] = useState(false);
  const [hasCopiedAnswerTashkeel, setHasCopiedAnswerTashkeel] = useState(false);
  const [hasCopiedFullVocalized, setHasCopiedFullVocalized] = useState(false);

  // Offline & Hybrid Transcription State
  const [transcribeMode, setTranscribeMode] = useState<"auto" | "gemini" | "offline_whisper">("gemini");
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isWhisperCached, setIsWhisperCached] = useState<boolean>(false);
  const [whisperStorage, setWhisperStorage] = useState<WhisperStorageInfo | null>(null);
  const [isPreloadingModel, setIsPreloadingModel] = useState<boolean>(false);
  const [modelPreloadProgress, setModelPreloadProgress] = useState<number>(0);
  const [modelPreloadMessage, setModelPreloadMessage] = useState<string>("");
  const [isPolishingWithGemini, setIsPolishingWithGemini] = useState<boolean>(false);
  const [localProgressInfo, setLocalProgressInfo] = useState<OfflineTranscribeProgress | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // مراقبة حالة الاتصال بالإنترنت والتحقق الدقيق من كاش نموذج Whisper
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("تمت استعادة الاتصال بالإنترنت 🌐", "info");
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("انقطع الاتصال بالإنترنت! تم تفعيل التفريغ المحلي (Whisper) تلقائياً 📴", "info");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // فحص تخزين النموذج الحقيقي في CacheStorage
    getWhisperStorageDetails().then((storage) => {
      setWhisperStorage(storage);
      setIsWhisperCached(storage.isCached);
    });

    // تنظيف كاشات المشاركة القديمة فوراً لمنع ظهور أي تسجيل وهمي
    clearAllOldShareCaches().catch(() => {});

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // استقبال تسجيل صوتي أو مرئي مُشارَك من واتساب عبر Web Share Target
  const isProcessingShareRef = useRef(false);
  const hasProcessedShareRef = useRef(false);
  const hasAnnouncedShareMissRef = useRef(false);
  const activeProcessingPromiseRef = useRef<Promise<void> | null>(null);

  const processIncomingShare = async () => {
    const fromShare = wasOpenedFromShare();
    if (hasProcessedShareRef.current) return;
    if (activeProcessingPromiseRef.current) return activeProcessingPromiseRef.current;
    if (isProcessingShareRef.current) return;
    isProcessingShareRef.current = true;

    activeProcessingPromiseRef.current = (async () => {
      if (fromShare) setIsReceivingShare(true);
      setErrorMessage(null);

      try {
        const shared = await consumeSharedAudio(fromShare ? 30 : 4);

        if (shared && shared.file && shared.file.size > 0) {
          const stale =
            !fromShare &&
            typeof shared.receivedAt === "number" &&
            Date.now() - shared.receivedAt > 10 * 60 * 1000;
          if (!stale) {
          console.log("[SHARE-CLIENT] handleFileSelect called");
          await handleFileSelect(shared.file);

          if (shared.text) {
            const fromCaption = questionFromSharedCaption(shared.text);
            if (fromCaption.senderName) setSharedVoiceSenderName(fromCaption.senderName);
            if (fromCaption.voiceCaptionOnly && fromCaption.senderName) {
              setQuestion(fromCaption.senderName);
            } else if (!fromCaption.voiceCaptionOnly && fromCaption.question && isRealQuestionText(fromCaption.question)) {
              const ext = extractWhatsAppQAndA(fromCaption.question);
              if (ext.isWhatsAppPost) {
                setQuestion(ext.question);
                if (ext.answer && !manualRawText.trim()) {
                  setManualRawText(ext.answer);
                  setShowManualTranscriptInput(true);
                }
              } else {
                setQuestion(sanitizeQuestionGreeting(fromCaption.question));
              }
            }
          }

          setErrorMessage(null);
          setShareBlocked(false);
          hasProcessedShareRef.current = true;
          await deleteConsumedShareCache();
          showToast(`تم استلام تسجيل جواب الشيخ بنجاح 🎙️ (جاهز للتفريغ)`, "success");
          return;
          }
        }

        const sharedText = await consumeSharedText();
        if (sharedText && isRealQuestionText(sharedText)) {
          const fromCaption = questionFromSharedCaption(sharedText);
          if (fromCaption.senderName) setSharedVoiceSenderName(fromCaption.senderName);
          const targetQ = fromCaption.question || sharedText;
          if (isRealQuestionText(targetQ)) {
            const ext = extractWhatsAppQAndA(targetQ);
            if (ext.isWhatsAppPost) {
              setQuestion(ext.question);
              if (ext.answer && !manualRawText.trim()) {
                setManualRawText(ext.answer);
                setShowManualTranscriptInput(true);
              }
            } else {
              setQuestion(sanitizeQuestionGreeting(targetQ));
            }
          }
        }

        if (fromShare || sharedText) {
          setShareBlocked(true);
          if (!hasAnnouncedShareMissRef.current) {
            hasAnnouncedShareMissRef.current = true;
            showToast("التطبيق فُتح لكن تسجيل واتساب لم يصل. اختر الملف من الزر بالأسفل.", "info");
          }
          return;
        }
      } catch (err) {
        console.error("[SHARE-CLIENT] Error receiving share:", err);
        if (fromShare) {
          setShareBlocked(true);
          if (!hasAnnouncedShareMissRef.current) {
            hasAnnouncedShareMissRef.current = true;
            showToast("تعذّر قراءة تسجيل واتساب. اختر الملف يدوياً.", "info");
          }
        }
      } finally {
        setIsReceivingShare(false);
        isProcessingShareRef.current = false;
        activeProcessingPromiseRef.current = null;
      }
    })();

    return activeProcessingPromiseRef.current;
  };

  useEffect(() => {
    processIncomingShare();
    listenForOpenedFiles((file) => {
      setShareBlocked(false);
      handleFileSelect(file);
      showToast(`تم فتح التسجيل (${file.name}) وجاهز للتفريغ`, "success");
    });

    const handleWindowActive = () => {
      if (wasOpenedFromShare()) processIncomingShare();
    };

    window.addEventListener("focus", handleWindowActive);
    window.addEventListener("pageshow", handleWindowActive);
    document.addEventListener("visibilitychange", handleWindowActive);
    window.addEventListener("popstate", handleWindowActive);

    return () => {
      window.removeEventListener("focus", handleWindowActive);
      window.removeEventListener("pageshow", handleWindowActive);
      document.removeEventListener("visibilitychange", handleWindowActive);
      window.removeEventListener("popstate", handleWindowActive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle file drop / select with full support for WhatsApp (.opus, .ogg, .m4a, .amr, etc.) and Videos (.mp4, .mov, etc.)
  const handleFileSelect = async (file: File) => {
    // Check file extension or mime type
    const fileName = file.name.toLowerCase();
    const isVideo =
      file.type.startsWith("video/") ||
      fileName.endsWith(".mp4") ||
      fileName.endsWith(".mov") ||
      fileName.endsWith(".webm") ||
      fileName.endsWith(".mkv") ||
      fileName.endsWith(".avi") ||
      fileName.endsWith(".3gp");

    const isOpus = fileName.endsWith(".opus") || file.type.includes("opus");
    const isOgg = fileName.endsWith(".ogg") || file.type.includes("ogg") || file.type.includes("oga");
    const isAmr = fileName.endsWith(".amr") || file.type.includes("amr");
    const isM4a = fileName.endsWith(".m4a") || file.type.includes("m4a") || (file.type.includes("mp4") && !isVideo);
    const isMp3 = fileName.endsWith(".mp3") || file.type.includes("mp3") || file.type.includes("mpeg");
    const isWav = fileName.endsWith(".wav") || file.type.includes("wav");
    const isWebm = (fileName.endsWith(".webm") || file.type.includes("webm")) && !isVideo;
    const is3gp = (fileName.endsWith(".3gp") || file.type.includes("3gpp")) && !isVideo;
    const isAac = fileName.endsWith(".aac") || file.type.includes("aac");
    const isAudioGeneral = file.type.startsWith("audio/") || file.type === "application/octet-stream" || file.type === "application/ogg";

    const isValidMedia = isVideo || isOpus || isOgg || isAmr || isM4a || isMp3 || isWav || isWebm || is3gp || isAac || isAudioGeneral;

    if (!isValidMedia) {
      setErrorMessage("نوع الملف غير مدعوم. يرجى اختيار تسجيل صوتي أو مقطع فيديو (MP4, MOV, WebM, WhatsApp .opus, AMR, MP3, M4A, WAV).");
      return;
    }

    const maxSizeBytes = isVideo ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setErrorMessage(
        isVideo
          ? "حجم مقطع الفيديو كبير جداً (أكثر من 50 ميغابايت)."
          : "حجم الملف الصوتي كبير جداً (أكثر من 25 ميغابايت)."
      );
      return;
    }

    // تحديد نوع MIME بدقة فائقة
    let mimeType: string;
    if (isVideo) {
      if (fileName.endsWith(".mp4") || file.type.includes("mp4")) mimeType = "video/mp4";
      else if (fileName.endsWith(".webm") || file.type.includes("webm")) mimeType = "video/webm";
      else if (fileName.endsWith(".mov") || file.type.includes("quicktime")) mimeType = "video/quicktime";
      else mimeType = file.type || "video/mp4";
    } else if (isOpus || isOgg) mimeType = "audio/ogg";       // واتساب: Opus داخل حاوية Ogg
    else if (isMp3) mimeType = "audio/mp3";
    else if (isWav) mimeType = "audio/wav";
    else if (isM4a) mimeType = "audio/mp4";
    else if (isAac || is3gp || isAmr) mimeType = "audio/aac";
    else if (isWebm) mimeType = "audio/ogg";
    else if (file.type && file.type !== "application/octet-stream" && file.type !== "application/ogg") {
      mimeType = file.type;
    } else {
      mimeType = "audio/ogg";
    }
    mimeType = mimeType.split(";")[0].trim();

    setErrorMessage(null);
    try {
      const base64 = await fileToBase64(file);

      // وضع الملف مباشرة في خانة جواب الشيخ دون أي تأخير
      setAudioFile({
        file,
        name: file.name,
        size: file.size,
        duration: 0,
        dataUrl: base64,
        mimeType,
        isVideo,
      });

      if (isVideo) {
        setMediaMode("video");
        setRequestTashkeel(true);
        setPreviewCardStyle("uthmanic");
        setFatwaType("moasala");
        showToast(`تم استلام مقطع الفيديو: ${file.name} 🎬`, "success");
      } else {
        setMediaMode("audio");
        showToast(`تم استلام تسجيل جواب الشيخ: ${file.name} 🎙️ (جاهز للتفريغ)`, "success");
      }

      // قياس مدة التسجيل بدقة في الخلفية
      if (isVideo) {
        const tempVideo = document.createElement("video");
        tempVideo.src = base64;
        tempVideo.onloadedmetadata = () => {
          const d = Math.round(tempVideo.duration) || 0;
          if (d > 0) setAudioFile((prev) => (prev ? { ...prev, duration: d } : null));
        };
      } else {
        const tempAudio = new Audio(base64);
        tempAudio.onloadedmetadata = () => {
          const d = Math.round(tempAudio.duration) || 0;
          if (d > 0) setAudioFile((prev) => (prev ? { ...prev, duration: d } : null));
        };
      }
        } catch (err) {
      console.error(err);
      setErrorMessage("تعذر قراءة الملف. يرجى التأكد من سلامة الملف.");
    }
  };

  // Start live microphone recording
  const startRecording = async () => {
    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = [
        "audio/ogg;codecs=opus",
        "audio/webm;codecs=opus",
        "audio/mp4",
      ];
      const chosenType = preferredTypes.find(
        (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
      );
      const mediaRecorder = new MediaRecorder(
        stream,
        chosenType ? { mimeType: chosenType } : undefined
      );
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const rawType = mediaRecorder.mimeType || "audio/ogg";
        const baseType = rawType.split(";")[0].trim();
        const geminiType = baseType.includes("mp4") ? "audio/mp4" : "audio/ogg";
        const ext = baseType.includes("mp4") ? "m4a" : baseType.includes("ogg") ? "ogg" : "webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: baseType });
        const base64 = await fileToBase64(audioBlob);
        setAudioFile({
          name: `تسجيل_صوتي_مباشر_${new Date().toLocaleTimeString("ar-SA")}.${ext}`,
          size: audioBlob.size,
          duration: recordingDuration,
          dataUrl: base64,
          mimeType: geminiType,
        });
        setIsRecording(false);
        clearInterval(recordingTimerRef.current);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Mic access error:", err);
      setErrorMessage("لم يتم منح إذن الميكروفون أو جهاز التسجيل غير متاح.");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  // Audio Playback
  const togglePlayAudio = () => {
    if (!audioFile?.dataUrl) return;
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(audioFile.dataUrl);
      audioPlayerRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  // Helper to handle and sanitize incoming question text (detecting WhatsApp splits and fixing greeting)
  const handleInputQuestionText = (rawText: string) => {
    if (!rawText) {
      setQuestion("");
      return;
    }

    // 1. Separate question and answer if merged (either WhatsApp format or text bleed)
    const separated = separateQuestionAndAnswer(rawText);
    if (separated.wasSeparated) {
      setQuestion(separated.question);
      if (separated.answer && !manualRawText.trim()) {
        setManualRawText(separated.answer);
        setShowManualTranscriptInput(true);
      }
      showToast("تم فصل وتجريد السؤال عن جواب الشيخ تلقائياً ومنع دمجهما! ✨", "success");
      return;
    }

    if (hasQuestionGreetingIssue(rawText)) {
      const sanitized = sanitizeQuestionGreeting(rawText);
      setQuestion(sanitized);
      showToast("تم تعديل بداية السؤال تلقائياً إلى (السلام عليكم ورحمة الله)", "info");
      return;
    }

    setQuestion(rawText);
  };

  // Paste from clipboard helper (Works nicely on mobile)
  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          handleInputQuestionText(text);
        } else {
          showToast("الحافظة فارغة", "info");
        }
      } else {
        showToast("يرجى اللصق يدوياً في حقل السؤال", "info");
      }
    } catch (err) {
      showToast("يرجى إعطاء صلاحية القراءة من الحافظة أو اللصق يدوياً", "info");
    }
  };

  // تنزيل وحفظ نموذج Whisper للعمل أوفلاين مسبقاً (تنزيل لمرة واحدة فقط)
  const handlePreloadWhisper = async () => {
    if (isPreloadingModel) return;
    setIsPreloadingModel(true);
    setModelPreloadProgress(5);
    setModelPreloadMessage("جاري الاتصال لتحميل نموذج Whisper Tiny المخصص للعمل بدون إنترنت (~43 ميغابايت)...");
    try {
      const success = await preloadWhisperModel((prog) => {
        if (typeof prog.progress === "number") {
          setModelPreloadProgress((prev) => Math.max(prev, Math.round(prog.progress!)));
        }
        if (prog.message) {
          setModelPreloadMessage(prog.message);
        }
      });

      const storage = await getWhisperStorageDetails();
      setWhisperStorage(storage);
      setIsWhisperCached(storage.isCached);

      if (success && storage.isCached) {
        showToast(`تم تنزيل وحفظ نموذج Whisper بنجاح (${storage.cachedMb} MB)! يعمل الآن 100% بدون إنترنت 💾`, "success");
      } else {
        showToast("لم يكتمل تنزيل جميع أجزاء النموذج، يرجى إعادة المحاولة للتأكد من حفظه كاملاً.", "error");
      }
    } catch (err: any) {
      console.error("Failed to preload Whisper:", err);
      showToast("تعذر تنزيل النموذج: " + (err.message || "خطأ غير متوقع"), "error");
    } finally {
      setIsPreloadingModel(false);
    }
  };

  // تفريغ الفتوى محلياً في المتصفح باستخدام Whisper (بدون اتصال بالإنترنت)
  const handleExecuteOfflineTranscription = async () => {
    if (!audioFile && !manualRawText.trim()) {
      setErrorMessage("يرجى اختيار تسجيل صوتي أو كتابة مسودة لتفريغها بنموذج Whisper المحلي.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setLatestResult(null);
    setLocalProgressInfo({ stage: "loading", message: "جاري تشغيل محرك التفريغ المحلي (Whisper)..." });

    try {
      let offlineRaw = manualRawText.trim();
      let audioDuration = audioFile?.duration || 0;
      let cleanQ = sanitizeQuestionGreeting(question.trim() || "سؤال موجه لفضيلة الشيخ د. عبد الباري خلة");

      if (audioFile) {
        const audioSource = audioFile.file || audioFile.dataUrl!;
        const result = await transcribeAudioLocally(
          audioSource,
          question,
          (prog) => setLocalProgressInfo(prog)
        );
        offlineRaw = result.transcription_raw;
        cleanQ = result.question_clean;
        audioDuration = result.duration || audioDuration;
      }

      const hasWallahu = offlineRaw.includes("والله أعلم") || offlineRaw.includes("والله تعالى أعلم");
      const answerWithEnding = hasWallahu ? offlineRaw : `${offlineRaw}\n\nوالله تعالى أعلم.`;

      const offlineResponse: TranscribeResponse = {
        question_clean: cleanQ,
        transcription_raw: offlineRaw,
        answer_clean: answerWithEnding,
        unclear_segments: [],
        editing_notes: [
          "تم التفريغ عبر نموذج Whisper المحلي المدمج في المتصفح بدون إنترنت.",
          "يمكنك ترقية النص وضبط التشكيل وتخريج الأحاديث عبر ذكاء Gemini فور اتصالك بالإنترنت.",
        ],
        detected_wallahu_aalam: hasWallahu,
        status: "تحتاج مراجعة",
        transcription_engine: "whisper_offline",
        transcribed_offline: true,
        model_used: "Whisper Tiny (محلي أوفلاين)",
      };

      setLatestResult(offlineResponse);
      setEditableQuestionTashkeel(cleanTashkeelText(cleanQ));
      setEditableAnswerTashkeel(cleanTashkeelText(answerWithEnding));
      setIsEditingTashkeel(false);
      setIsWhisperCached(true);

      onTranscribeComplete({
        question_original: question.trim() || cleanQ,
        question_clean: cleanQ,
        audio_file: audioFile
          ? {
              name: audioFile.name,
              size: audioFile.size,
              duration: audioDuration,
              dataUrl: audioFile.dataUrl,
              mimeType: audioFile.mimeType,
            }
          : undefined,
        transcription_raw: offlineRaw,
        answer_clean: answerWithEnding,
        unclear_segments: [],
        editing_notes: offlineResponse.editing_notes,
        has_wallahu_aalam: hasWallahu,
        status: "تحتاج مراجعة",
        transcription_engine: "whisper_offline",
        transcribed_offline: true,
        model_used: "Whisper Tiny (محلي أوفلاين)",
      });

      showToast("تم التفريغ الصوتي محلياً بنجاح عبر Whisper بدون إنترنت! 📴", "success");
    } catch (err: any) {
      console.error("Offline Whisper error:", err);
      setErrorMessage("تعذر إتمام التفريغ المحلي: " + (err.message || "خطأ أثناء معالجة الصوت"));
      showToast("فشل التفريغ المحلي عبر Whisper", "error");
    } finally {
      setIsProcessing(false);
      setLocalProgressInfo(null);
    }
  };

  // تنقيح المسودة المفرغة أوفلاين بواسطة Gemini عند عودة الإنترنت
  const handlePolishOfflineWithGemini = async () => {
    if (!latestResult) return;
    if (!isOnline) {
      showToast("يتطلب التنقيح السحابي وجود اتصال بالإنترنت", "error");
      return;
    }

    setIsPolishingWithGemini(true);
    try {
      const polished = await polishOfflineFatwaWithGemini({
        question: latestResult.question_clean,
        rawText: latestResult.transcription_raw || latestResult.answer_clean,
        strictMode,
      });

      const updatedResult: TranscribeResponse = {
        ...polished,
        transcription_engine: "gemini",
        transcribed_offline: false,
        model_used: polished.model_used || "Gemini 3.5 Flash lite",
      };

      setLatestResult(updatedResult);
      setEditableQuestionTashkeel(cleanTashkeelText(polished.question_tashkeel || updatedResult.question_clean));
      setEditableAnswerTashkeel(cleanTashkeelText(polished.answer_tashkeel || updatedResult.answer_clean));
      setIsEditingTashkeel(false);

      onTranscribeComplete({
        question_original: question.trim() || updatedResult.question_clean,
        question_clean: updatedResult.question_clean,
        audio_file: audioFile
          ? {
              name: audioFile.name,
              size: audioFile.size,
              duration: audioFile.duration,
              dataUrl: audioFile.dataUrl,
              mimeType: audioFile.mimeType,
            }
          : undefined,
        transcription_raw: updatedResult.transcription_raw,
        answer_clean: updatedResult.answer_clean,
        unclear_segments: updatedResult.unclear_segments || [],
        editing_notes: updatedResult.editing_notes || [],
        has_wallahu_aalam: updatedResult.detected_wallahu_aalam,
        status: "تحتاج مراجعة",
        transcription_engine: "gemini",
        transcribed_offline: false,
        model_used: updatedResult.model_used || "Gemini 3.5 Flash lite",
      });

      showToast("تم تنقيح وتشكيل الفتوى بذكاء Gemini بنجاح! ✨", "success");
    } catch (err: any) {
      console.error("Failed to polish with Gemini:", err);
      showToast("تعذر التنقيح بـ Gemini: " + (err.message || "خطأ في الخادم"), "error");
    } finally {
      setIsPolishingWithGemini(false);
    }
  };

  // Run execution with automated 3-retries on high demand / server pressure and offline fallback
  const handleExecuteTranscription = async (mode: "normal" | "audio_only" = "normal") => {
    setCurrentTranscribeAction(mode);
    const isAudioOnly = mode === "audio_only";

    if (isAudioOnly) {
      if (!audioFile) {
        setErrorMessage("لاستخدام وضع (التفريغ من التسجيل فقط)، يرجى رفع أو مشاركة ملف التسجيل الصوتي أولاً.");
        showToast("يرجى اختيار تسجيل صوتي للبدء", "info");
        return;
      }
    } else {
      if (!question.trim() && !audioFile && !manualRawText.trim()) {
        setErrorMessage("يرجى إدخال السؤال أو رفع التسجيل الصوتي للشيخ قبل المتابعة.");
        return;
      }
    }

    // التحقق هل يجب العمل بوضع الأوفلاين (Whisper)
    const shouldUseOffline =
      transcribeMode === "offline_whisper" || !isOnline;

    if (shouldUseOffline) {
      await handleExecuteOfflineTranscription();
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setLatestResult(null);
    setProcessingStep(1);
    setRetryCount(0);
    setRetryCountdown(null);

    const maxAttempts = 3;
    let attempt = 1;
    let success = false;

    const stepInterval = setInterval(() => {
      setProcessingStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 1100);

    const isVideoProcessing = mediaMode === "video" || !!audioFile?.isVideo;
    const payload: any = {
      question_original: isAudioOnly ? "" : question.trim(),
      audio_only_mode: isAudioOnly,
      strict_mode: strictMode,
      fatwa_type: isVideoProcessing ? "moasala" : fatwaType,
      is_video: isVideoProcessing,
      request_tashkeel: isVideoProcessing ? true : (requestTashkeel || fatwaType === "moasala"),
    };

    if (audioFile?.dataUrl) {
      payload.audio_base64 = audioFile.dataUrl;
      payload.audio_mime_type = audioFile.mimeType;
    }

    if (manualRawText.trim() && !isAudioOnly) {
      payload.text_raw_answer = manualRawText.trim();
    }

    while (attempt <= maxAttempts && !success) {
      try {
        setRetryCount(attempt);
        const res = await fetch("/api/transcribe-fatwa", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          const isBusy =
            res.status === 503 ||
            res.status === 429 ||
            errJson.is_temporary ||
            (errJson.error && errJson.error.includes("ضغط"));

          if (isBusy && attempt < maxAttempts) {
            // Count down 3 seconds before auto-retrying
            for (let c = 3; c > 0; c--) {
              setRetryCountdown(c);
              await new Promise((r) => setTimeout(r, 1000));
            }
            setRetryCountdown(null);
            attempt++;
            continue;
          }

          throw new Error(errJson.error || `خطأ من الخادم (${res.status})`);
        }

        const data: TranscribeResponse = await res.json();
        let sanitizedCleanQ = sanitizeQuestionGreeting(data.question_clean);
        let finalAnswer = data.answer_clean || data.transcription_raw || "";

        if (hasAnswerInQuestion(sanitizedCleanQ)) {
          const bleedRes = cleanQuestionAnswerBleed(sanitizedCleanQ);
          if (bleedRes.hadBleed) {
            sanitizedCleanQ = sanitizeQuestionGreeting(bleedRes.cleanedQuestion);
            if (bleedRes.extractedAnswer) {
              const lead = bleedRes.extractedAnswer.substring(0, Math.min(30, bleedRes.extractedAnswer.length));
              if (!finalAnswer.includes(lead)) {
                finalAnswer = finalAnswer ? `${bleedRes.extractedAnswer}\n\n${finalAnswer}` : bleedRes.extractedAnswer;
              }
            }
          }
        }

        let sanitizedOrigQ = sanitizeQuestionGreeting(question.trim() || sanitizedCleanQ);
        if (hasAnswerInQuestion(sanitizedOrigQ)) {
          const bleedRes = cleanQuestionAnswerBleed(sanitizedOrigQ);
          if (bleedRes.hadBleed) {
            sanitizedOrigQ = sanitizeQuestionGreeting(bleedRes.cleanedQuestion);
          }
        }

        const sanitizedData: TranscribeResponse = {
          ...data,
          question_clean: sanitizedCleanQ,
          answer_clean: finalAnswer,
          answer_tashkeel: data.answer_tashkeel,
          evidence_citations: data.evidence_citations,
          transcription_engine: "gemini",
          transcribed_offline: false,
          model_used: data.model_used || "gemini-3.5-flash-lite",
        };
        setLatestResult(sanitizedData);
        setEditableQuestionTashkeel(cleanTashkeelText(data.question_tashkeel || sanitizedCleanQ));
        setEditableAnswerTashkeel(cleanTashkeelText(data.answer_tashkeel || finalAnswer));
        setIsEditingTashkeel(false);

        if (isAudioOnly && sanitizedCleanQ) {
          setQuestion(sanitizedCleanQ);
        }

        const isVideoResult = isVideoProcessing || Boolean(audioFile?.isVideo) || mediaMode === "video";
        const hasTashkeelResult = Boolean(data.answer_tashkeel);
        const preferredStyle = getPreferredTemplateStyle();
        // Use preferred default template style (official_khalla) after transcription
        const resolvedStyle = preferredStyle;

        setPreviewCardStyle(resolvedStyle === "uthmanic" ? "uthmanic" : "official_khalla");
        if (hasTashkeelResult || isVideoResult) {
          setResultTextTab("tashkeel");
        }

        // Pass result to parent state
        onTranscribeComplete({
          question_original: sanitizedOrigQ,
          question_clean: sanitizedCleanQ,
          question_tashkeel: cleanTashkeelText(data.question_tashkeel || sanitizedCleanQ),
          fatwaType: isVideoResult ? "moasala" : fatwaType,
          mediaType: isVideoResult ? "video" : audioFile ? "audio" : "text",
          audio_file: audioFile
            ? {
                name: audioFile.name,
                size: audioFile.size,
                duration: audioFile.duration,
                dataUrl: audioFile.dataUrl,
                mimeType: audioFile.mimeType,
                isVideo: isVideoResult,
              }
            : undefined,
          transcription_raw: data.transcription_raw,
          answer_clean: finalAnswer,
          answer_tashkeel: data.answer_tashkeel,
          evidence_citations: data.evidence_citations,
          unclear_segments: data.unclear_segments || [],
          editing_notes: data.editing_notes || [],
          has_wallahu_aalam: data.detected_wallahu_aalam,
          status: data.status || "مسودة",
          transcription_engine: "gemini",
          transcribed_offline: false,
          model_used: data.model_used || "gemini-3.5-flash-lite",
          template_settings: {
            ...DEFAULT_TEMPLATE_SETTINGS,
            templateStyle: resolvedStyle,
            aspectRatio: "1:1",
            theme: "emerald",
            fontSize: "auto",
          },
        });

        showToast("تم تفريغ وتنظيم الفتوى بنجاح!", "success");
        success = true;
      } catch (err: any) {
        // التحقق إن كان الخطأ ناتجاً عن انقطاع الإنترنت للتحويل التلقائي لمحرك Whisper
        const isNetworkError =
          !navigator.onLine ||
          err.message?.includes("Failed to fetch") ||
          err.message?.includes("NetworkError") ||
          err.name === "TypeError";

        if (isNetworkError && audioFile) {
          clearInterval(stepInterval);
          setIsProcessing(false);
          showToast("انقطع الاتصال بالسيرفر، جاري التحويل التلقائي للتفريغ المحلي بـ Whisper...", "info");
          await handleExecuteOfflineTranscription();
          return;
        }

        if (attempt < maxAttempts) {
          // Count down 3 seconds and retry
          for (let c = 3; c > 0; c--) {
            setRetryCountdown(c);
            await new Promise((r) => setTimeout(r, 1000));
          }
          setRetryCountdown(null);
          attempt++;
        } else {
          // All 3 attempts failed -> Show formal error message requested by user
          clearInterval(stepInterval);
          console.error(err);
          setErrorMessage("خوادم المعالجة تشهد ضغطاً مؤقتاً في الوقت الحالي. تم استنفاد محاولات إعادة الإرسال التلقائية (3/3). نرجو المحاولة مرة أخرى بعد قليل.");
          showToast("تعذر إتمام التفريغ بسبب ضغط مؤقت. يرجى المحاولة بعد قليل.", "error");
          break;
        }
      }
    }

    clearInterval(stepInterval);
    setIsProcessing(false);
    setRetryCountdown(null);
    setRetryCount(0);
  };

  // Direct card download & copy handlers
  const directCardRef = useRef<HTMLDivElement | null>(null);
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);
  const [copiedCardImage, setCopiedCardImage] = useState(false);

  const handleDownloadDirectCard = async () => {
    if (!directCardRef.current || !latestResult) return;
    setIsDownloadingCard(true);
    try {
      const dataUrl = await toPng(directCardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
      });
      const link = document.createElement("a");
      const safeTitle = (latestResult.question_clean || "فتوى").slice(0, 25).replace(/\s+/g, "_");
      link.download = `بطاقة_فتوى_${safeTitle}.png`;
      link.href = dataUrl;
      link.click();
      showToast("تم تحميل بطاقة الفتوى صورة (PNG) بنجاح!", "success");
    } catch (err) {
      console.error("Direct card download error:", err);
      showToast("حدث خطأ أثناء تحميل صورة البطاقة.", "error");
    } finally {
      setIsDownloadingCard(false);
    }
  };

  const handleCopyDirectCard = async () => {
    if (!directCardRef.current) return;
    setIsDownloadingCard(true);
    try {
      const blob = await toBlob(directCardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
      });
      if (blob && navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ "image/png": blob }),
        ]);
        setCopiedCardImage(true);
        setTimeout(() => setCopiedCardImage(false), 2500);
        showToast("تم نسخ صورة بطاقة الفتوى إلى الحافظة!", "success");
      } else {
        handleDownloadDirectCard();
      }
    } catch (err) {
      console.error("Direct card copy error:", err);
      handleDownloadDirectCard();
    } finally {
      setIsDownloadingCard(false);
    }
  };

  // Copy WhatsApp Formatted text
  const handleCopyWhatsAppText = () => {
    if (!latestResult) return;
    const formatted = `*السؤال:*\n${latestResult.question_clean}\n\n*الجواب (فضيلة الشيخ د. عبد الباري خلة):*\n${latestResult.answer_clean}\n\nوالله تعالى أعلم.`;
    navigator.clipboard.writeText(formatted);
    setHasCopiedFinal(true);
    showToast("تم نسخ نص الفتوى بتنسيق WhatsApp للنشر", "success");
    setTimeout(() => setHasCopiedFinal(false), 2500);
  };

  // نسخ السؤال المشكول بحركاته العربية
  const handleCopyQuestionTashkeel = (text: string) => {
    const clean = cleanTashkeelText(text);
    navigator.clipboard.writeText(clean);
    setHasCopiedQuestionTashkeel(true);
    showToast("تم نسخ السؤال المشكول بالحركات بنجاح! 📋", "success");
    setTimeout(() => setHasCopiedQuestionTashkeel(false), 2500);
  };

  // نسخ جواب الشيخ المشكول بحركاته العربية
  const handleCopyAnswerTashkeel = (text: string) => {
    const clean = cleanTashkeelText(text);
    navigator.clipboard.writeText(clean);
    setHasCopiedAnswerTashkeel(true);
    showToast("تم نسخ جواب الشيخ المشكول بالحركات بنجاح! 📋", "success");
    setTimeout(() => setHasCopiedAnswerTashkeel(false), 2500);
  };

  // نسخ كامل الفتوى المشكولة (سؤال وجواب) بتنسيق النشر المعتمد
  const handleCopyFullVocalizedFatwa = () => {
    if (!latestResult) return;
    const qText = editableQuestionTashkeel || latestResult.question_tashkeel || latestResult.question_clean;
    const aText = editableAnswerTashkeel || latestResult.answer_tashkeel || latestResult.answer_clean;
    const formatted = formatVocalizedFatwaForCopy({
      question: qText,
      answer: aText,
      fatwaNumber: 1,
      hasWallahuAalam: latestResult.detected_wallahu_aalam ?? true,
    });
    navigator.clipboard.writeText(formatted);
    setHasCopiedFullVocalized(true);
    showToast("تم نسخ الفتوى المشكولة كاملة بتنسيق النشر الرسمي! 📜", "success");
    setTimeout(() => setHasCopiedFullVocalized(false), 2500);
  };

  // حفظ التعديلات اليدوية على السؤال والجواب المشكولين
  const handleSaveTashkeelEdits = () => {
    const rawEditedQ = editableQuestionTashkeel.trim();
    const rawEditedA = editableAnswerTashkeel.trim();
    const cleanQ = cleanTashkeelText(rawEditedQ);
    const cleanA = cleanTashkeelText(rawEditedA);
    setIsEditingTashkeel(false);

    if (latestResult) {
      const updated: TranscribeResponse = {
        ...latestResult,
        question_clean: cleanQ || latestResult.question_clean,
        question_tashkeel: rawEditedQ || latestResult.question_tashkeel,
        answer_clean: cleanA || latestResult.answer_clean,
        answer_tashkeel: rawEditedA || latestResult.answer_tashkeel,
      };
      setLatestResult(updated);

      onTranscribeComplete({
        question_original: question || cleanQ,
        question_clean: cleanQ || latestResult.question_clean,
        question_tashkeel: rawEditedQ || latestResult.question_tashkeel,
        transcription_raw: latestResult.transcription_raw,
        answer_clean: cleanA || latestResult.answer_clean,
        answer_tashkeel: rawEditedA || latestResult.answer_tashkeel,
        fatwaType: mediaMode === "video" || audioFile?.isVideo ? "moasala" : fatwaType,
        mediaType: mediaMode === "video" || audioFile?.isVideo ? "video" : (audioFile ? "audio" : "text"),
        audio_file: audioFile
          ? {
              name: audioFile.name,
              size: audioFile.size,
              duration: audioFile.duration,
              dataUrl: audioFile.dataUrl,
              mimeType: audioFile.mimeType,
              isVideo: mediaMode === "video" || Boolean(audioFile.isVideo),
            }
          : undefined,
        evidence_citations: latestResult.evidence_citations || [],
        unclear_segments: latestResult.unclear_segments || [],
        editing_notes: latestResult.editing_notes || [],
        has_wallahu_aalam: latestResult.detected_wallahu_aalam ?? true,
        status: latestResult.status || "مسودة",
        transcription_engine: latestResult.transcription_engine || "gemini",
        transcribed_offline: latestResult.transcribed_offline,
        model_used: latestResult.model_used,
        template_settings: {
          ...DEFAULT_TEMPLATE_SETTINGS,
          templateStyle: previewCardStyle,
          aspectRatio: "1:1",
          theme: "emerald",
          fontSize: "auto",
        },
      });
    }

    showToast("تم حفظ التعديلات وتحديث القالب بالنص المنقح والمشكول بنجاح! ✓", "success");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Breadcrumb & Live System Status Header - Polished for Mobile & Desktop */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 sm:pb-3 border-b border-stone-200/90">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-cairo">
            <span className="text-stone-400">الرئيسية</span>
            <span className="text-stone-300">/</span>
            <span className="font-bold text-[#0c392c]">تفريغ فتوى جديدة</span>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {isOnline ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-700" />
              <span>نظام هجين متصل</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <WifiOff className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-700" />
              <span>أوفلاين (Whisper)</span>
            </div>
          )}
        </div>
      </div>

      {/* Error alert banner with formal tone and retry */}
      {errorMessage && (!audioFile || !errorMessage.includes("لم يصل ملف تسجيل")) && (
        <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs sm:text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold font-cairo text-amber-950">إشعار النظام:</div>
              <p className="text-amber-900 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {!audioFile && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold font-cairo text-xs shadow-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
              >
                <UploadCloud className="w-4 h-4" />
                <span>اختيار الملف يدوياً من هاتفك</span>
              </button>
            )}
            {audioFile && (
              <button
                onClick={handleExecuteTranscription}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl bg-[#0c392c] hover:bg-[#08281f] text-white font-bold font-cairo text-xs shadow-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة المحاولة الآن</span>
              </button>
            )}
            <button
              onClick={() => setErrorMessage(null)}
              className="p-2 rounded-xl text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
              title="إغلاق التنبيه"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp Share Full-Screen Overlay Loader */}
      {isReceivingShare && (
        <ThinkingLogo variant="page" label="جارٍ استقبال التسجيل من واتساب..." />
      )}

      {shareBlocked && !audioFile && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-right shadow-sm">
          <p className="font-bold font-cairo text-amber-950">المشاركة وصلت بدون التسجيل</p>
          <p className="mt-1 text-sm font-tajawal text-stone-700 leading-relaxed">
            واتساب فتح التطبيق، لكن ملف التسجيل الصوتي لم يُسلَّم. هذا يحدث مع بعض نسخ كروم. اختر نفس التسجيل من هاتفك.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0c392c] px-4 py-2.5 text-sm font-bold font-cairo text-white"
          >
            <UploadCloud className="h-4 w-4" />
            اختيار تسجيل واتساب
          </button>
        </div>
      )}

      {/* Main 2-Card Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        {/* Card 1: 1. مدخلات الفتوى */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 border border-stone-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col justify-between space-y-4 sm:space-y-5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow">
          <div className="space-y-4 sm:space-y-5">
            {/* Card 1 Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg lg:text-xl font-bold font-cairo text-stone-900 flex items-center gap-2">
                <span>1. مدخلات الفتوى</span>
              </h2>
              <span className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold bg-amber-100/80 text-amber-900 border border-amber-300/60 shadow-2xs">
                الخطوة الأولى
              </span>
            </div>

            {/* فصل مسار التفريغ: تفريغ صوتي لحال وتفريغ فيديو لحال */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold font-cairo">
                <span className="text-stone-700">نوع التفريغ المطلوب:</span>
                <span className="text-[11px] text-stone-500 font-normal">
                  {mediaMode === "audio" ? "تسجيلات صوتية (عادية / مؤصلة)" : "مقاطع فيديو مرئية"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100/90 rounded-2xl border border-stone-200/90">
                <button
                  type="button"
                  id="tab-mode-audio"
                  onClick={() => {
                    setMediaMode("audio");
                    if (audioFile?.isVideo) {
                      setAudioFile(null);
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold font-cairo transition-all cursor-pointer min-h-[44px] ${
                    mediaMode === "audio"
                      ? "bg-[#0c392c] text-white shadow-xs"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
                  }`}
                >
                  <Volume2 className="w-4 h-4 text-emerald-300" />
                  <span>تفريغ صوتي 🎙️</span>
                </button>

                <button
                  type="button"
                  id="tab-mode-video"
                  onClick={() => {
                    setMediaMode("video");
                    setRequestTashkeel(true);
                    if (audioFile && !audioFile.isVideo) {
                      setAudioFile(null);
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold font-cairo transition-all cursor-pointer min-h-[44px] ${
                    mediaMode === "video"
                      ? "bg-amber-700 text-white shadow-xs"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
                  }`}
                >
                  <Video className="w-4 h-4 text-amber-200" />
                  <span>تفريغ فيديو 📹</span>
                </button>
              </div>
            </div>

            {/* Field: نص السؤال الأصلي */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-xs sm:text-sm font-bold font-cairo text-stone-800">
                  نص السؤال الأصلي
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="text-[11px] sm:text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>لصق من الحافظة</span>
                  </button>
                  {question && (
                    <button
                      type="button"
                      onClick={() => setQuestion("")}
                      className="text-[11px] sm:text-xs text-stone-400 hover:text-red-600 flex items-center gap-1 transition-colors px-1 py-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>مسح</span>
                    </button>
                  )}
                </div>
              </div>

              <textarea
                id="question-input"
                rows={4}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onPaste={(e) => {
                  const pastedText = e.clipboardData.getData("text");
                  if (pastedText) {
                    const separated = separateQuestionAndAnswer(pastedText);
                    if (separated.wasSeparated) {
                      e.preventDefault();
                      handleInputQuestionText(pastedText);
                    }
                  }
                }}
                onBlur={() => {
                  if (hasQuestionGreetingIssue(question)) {
                    const fixed = sanitizeQuestionGreeting(question);
                    setQuestion(fixed);
                    showToast("تم تعديل بداية السؤال تلقائياً إلى (السلام عليكم ورحمة الله)", "info");
                  }
                }}
                placeholder="انسخ سؤال السائل هنا..."
                className="w-full p-3.5 rounded-xl border border-stone-300 bg-stone-50/50 text-stone-900 placeholder:text-stone-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0c392c] focus:border-transparent transition-all leading-relaxed"
              />

              {hasAnswerInQuestion(question) && (
                <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-300 text-purple-900 text-xs flex items-center justify-between gap-2 animate-fadeIn">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>تنبيه: يبدو أن نص السؤال يشتمل على جواب الشيخ أو أحكام مدمجة بالخطأ.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const separated = separateQuestionAndAnswer(question);
                      setQuestion(separated.question);
                      if (separated.answer && !manualRawText.trim()) {
                        setManualRawText(separated.answer);
                        setShowManualTranscriptInput(true);
                      }
                      showToast("تم فصل السؤال عن جواب الشيخ بدقة!", "success");
                    }}
                    className="px-2.5 py-1 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold shrink-0 transition-colors shadow-xs flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>فصل السؤال عن الجواب</span>
                  </button>
                </div>
              )}

              {hasQuestionGreetingIssue(question) && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-2 animate-fadeIn">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>يبدأ السؤال بـ (وعليكم السلام)، والأصل في السؤال أن يبدأ بـ (السلام عليكم ورحمة الله).</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setQuestion(sanitizeQuestionGreeting(question));
                      showToast("تم تصحيح تحية السؤال بنجاح", "success");
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 transition-colors shadow-xs"
                  >
                    تصحيح فوري
                  </button>
                </div>
              )}

              {/* Sample Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] text-stone-400 font-medium">أمثلة:</span>
                {SAMPLE_QUESTIONS.map((title, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setQuestion(SAMPLE_FULL_QUESTIONS[title])}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-stone-100 hover:bg-emerald-100 hover:text-emerald-900 text-stone-600 border border-stone-200 transition-colors"
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>

            {/* Field: تسجيل جواب الشيخ أو مقطع الفيديو بحسب النمط المختار */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <label className="text-xs sm:text-sm font-bold font-cairo text-stone-800 flex items-center gap-1.5 flex-wrap">
                  {mediaMode === "audio" ? (
                    <>
                      <Volume2 className="w-4 h-4 text-emerald-700" />
                      <span>تسجيل جواب الشيخ (صوتي)</span>
                      {sharedVoiceSenderName && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          مشاركة واتساب من: «{sharedVoiceSenderName}»
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4 text-amber-700" />
                      <span>مقطع جواب الشيخ (فيديو مرئي)</span>
                    </>
                  )}
                </label>
                <span className="text-[10px] sm:text-[11px] text-stone-500 font-sans font-medium bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                  {mediaMode === "audio"
                    ? "WhatsApp (.opus), MP3, M4A, OGG, WAV"
                    : "MP4, MOV, WebM, MKV"}
                </span>
              </div>

              {/* Hidden Official File Picker Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  mediaMode === "audio"
                    ? "audio/*,.opus,.ogg,.mp3,.m4a,.wav,.webm,.amr,.aac,.3gp,video/*"
                    : "video/*,.mp4,.mov,.webm,.mkv,.3gp"
                }
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setShareBlocked(false);
                    handleFileSelect(e.target.files[0]);
                  }
                  e.target.value = "";
                }}
              />

              {/* Upload Drop Area or Active Audio/Video */}
              {!audioFile && !isRecording ? (
                mediaMode === "audio" ? (
                  /* Audio Dropzone */
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFileSelect(e.dataTransfer.files[0]);
                      }
                    }}
                    className="border-2 border-dashed border-emerald-300/80 hover:border-emerald-600 bg-emerald-50/20 hover:bg-emerald-50/40 rounded-2xl p-5 sm:p-6 text-center transition-all flex flex-col items-center justify-center min-h-[150px] group"
                  >
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-emerald-100 text-emerald-800 group-hover:scale-105 flex items-center justify-center mb-2.5 transition-transform shadow-2xs">
                      <UploadCloud className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    
                    <p className="text-xs sm:text-sm font-bold font-cairo text-stone-800">
                      اختر التسجيل الصوتي أو اسحبه هنا
                    </p>
                    <p className="text-[11px] text-stone-500 mt-1 max-w-sm">
                      يدعم مباشرة تسجيلات WhatsApp الصوتية (<span className="font-mono text-emerald-800 font-bold">.opus, .ogg, .amr</span>)، وصيغ <span className="font-mono text-emerald-800 font-bold">MP3, M4A, WAV</span>
                    </p>

                    <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-md">
                      <button
                        type="button"
                        id="upload-audio-file-btn"
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "audio/*,.opus,.ogg,.mp3,.m4a,.wav,.webm,.amr,.aac,.3gp,video/*";
                            fileInputRef.current.click();
                          }
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-cairo bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-all active:scale-95 cursor-pointer min-h-[40px]"
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>🎙️ رفع تسجيل صوتي</span>
                      </button>

                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-stone-300 text-stone-700 hover:bg-red-50 hover:text-red-700 hover:border-red-300 shadow-2xs transition-all cursor-pointer min-h-[40px]"
                      >
                        <Mic className="w-3.5 h-3.5 text-red-500" />
                        <span>تسجيل مباشر</span>
                      </button>

                      <button
                        type="button"
                        id="manual-write-response-btn"
                        onClick={() => {
                          setShowManualTranscriptInput(true);
                          setTimeout(() => {
                            document.getElementById("manual-response-textarea")?.focus();
                          }, 100);
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-cairo bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 hover:border-emerald-500 shadow-2xs transition-all cursor-pointer min-h-[40px]"
                        title="كتابة أو لصق جواب الشيخ كنص مباشر"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>✍️ كتابة الرد</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Video Dropzone */
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFileSelect(e.dataTransfer.files[0]);
                      }
                    }}
                    className="border-2 border-dashed border-amber-300 hover:border-amber-600 bg-amber-50/25 hover:bg-amber-50/50 rounded-2xl p-5 sm:p-6 text-center transition-all flex flex-col items-center justify-center min-h-[150px] group"
                  >
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-100 text-amber-900 group-hover:scale-105 flex items-center justify-center mb-2.5 transition-transform shadow-2xs">
                      <Video className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    
                    <p className="text-xs sm:text-sm font-bold font-cairo text-amber-950">
                      اختر مقطع الفيديو لفضيلة الشيخ أو اسحبه هنا
                    </p>
                    <p className="text-[11px] text-stone-500 mt-1 max-w-sm">
                      يدعم مقاطع (<span className="font-mono text-amber-800 font-bold">MP4, MOV, WebM, MKV</span>) مع التشكيل الكامل التلقائي وبطاقة الخط العثماني
                    </p>

                    <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-sm">
                      <button
                        type="button"
                        id="upload-video-file-btn"
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "video/*,.mp4,.mov,.webm,.mkv";
                            fileInputRef.current.click();
                          }
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-cairo bg-amber-700 hover:bg-amber-800 text-white shadow-xs transition-all active:scale-95 cursor-pointer min-h-[40px]"
                      >
                        <Video className="w-4 h-4 text-amber-200" />
                        <span>📹 رفع مقطع فيديو</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowManualTranscriptInput(true);
                          setTimeout(() => {
                            document.getElementById("manual-response-textarea")?.focus();
                          }, 100);
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-cairo bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 hover:border-amber-500 shadow-2xs transition-all cursor-pointer min-h-[40px]"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                        <span>✍️ كتابة الرد</span>
                      </button>
                    </div>
                  </div>
                )
              ) : isRecording ? (
                /* Recording Active */
                <div className="border-2 border-red-400 bg-red-50/60 rounded-2xl p-5 text-center flex flex-col items-center justify-center min-h-[150px]">
                  <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center animate-pulse mb-2">
                    <Mic className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold font-cairo text-red-900">
                    جاري التسجيل الصوتي المباشر...
                  </p>
                  <p className="text-base font-mono font-bold text-red-700 my-1">
                    {formatDuration(recordingDuration)}
                  </p>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="mt-2 flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 shadow-sm transition-all cursor-pointer min-h-[38px]"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>إنهاء التسجيل</span>
                  </button>
                </div>
              ) : (
                /* Loaded Audio / Video Card */
                <div className="border border-emerald-300 bg-emerald-50/70 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between space-y-3 shadow-xs">
                  {/* Status header */}
                  <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${audioFile?.isVideo ? "bg-amber-500" : "bg-emerald-500"} animate-pulse`} />
                      <span className={`text-xs font-bold font-cairo ${audioFile?.isVideo ? "text-amber-950" : "text-emerald-900"}`}>
                        {audioFile?.isVideo
                          ? "تم اختيار مقطع الفيديو بنجاح (مُفعّل التشكيل الكامل) 📹"
                          : "تم اختيار التسجيل الصوتي بنجاح (جاهز للتفريغ)"}
                      </span>
                    </div>
                    <span className={`text-[10px] sm:text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md ${
                      audioFile?.isVideo ? "bg-amber-200/80 text-amber-950" : "bg-emerald-200/80 text-emerald-900"
                    }`}>
                      {audioFile?.name.split(".").pop()?.toUpperCase() || (audioFile?.isVideo ? "VIDEO" : "AUDIO")}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-2xs ${
                        audioFile?.isVideo ? "bg-amber-700" : "bg-emerald-700"
                      }`}>
                        {audioFile?.isVideo ? (
                          <Video className="w-4 h-4 sm:w-5 sm:h-5" />
                        ) : (
                          <FileAudio className="w-4 h-4 sm:w-5 sm:h-5" />
                        )}
                      </div>
                      <div className="min-w-0 overflow-hidden space-y-0.5">
                        <div className="text-xs sm:text-sm font-bold font-cairo text-stone-900 truncate">
                          {audioFile?.name}
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-stone-600 flex items-center gap-1.5 font-mono truncate">
                          <span className="font-semibold">{formatFileSize(audioFile?.size || 0)}</span>
                          <span>•</span>
                          <span className="text-stone-500 truncate">{audioFile?.mimeType || "audio/opus"}</span>
                          {audioFile?.duration ? <span>• {formatDuration(audioFile.duration)}</span> : null}
                          {audioFile?.isVideo && (
                            <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded text-[10px] font-bold">
                              فيديو
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Remove Audio/Video Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isPlaying && audioPlayerRef.current) {
                          audioPlayerRef.current.pause();
                          setIsPlaying(false);
                        }
                        setAudioFile(null);
                        setSharedVoiceSenderName(null);
                        showToast("تمت إزالة الملف المحدد", "info");
                      }}
                      className="self-end sm:self-center flex items-center gap-1 px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all shrink-0 active:scale-95 cursor-pointer"
                      title="إلغاء واختيار ملف آخر"
                    >
                      <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span>إزالة الملف</span>
                    </button>
                  </div>

                  {/* Video Player Preview or Audio Player bar */}
                  {audioFile?.isVideo && audioFile.dataUrl ? (
                    <div className="bg-black/95 rounded-xl overflow-hidden shadow-inner p-1 max-w-md mx-auto">
                      <video
                        src={audioFile.dataUrl}
                        controls
                        className="w-full max-h-[160px] rounded-lg object-contain bg-black"
                      />
                    </div>
                  ) : (
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between gap-2.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={togglePlayAudio}
                      className="w-8 h-8 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center shrink-0 transition-colors"
                      title={isPlaying ? "إيقاف مؤقت" : "استماع"}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 mr-0.5" />}
                    </button>

                    <div className="flex items-center gap-0.5 flex-1 h-5 px-1">
                      {[40, 75, 30, 90, 100, 60, 45, 80, 50, 70, 90, 40, 60, 85, 35, 90, 55, 75, 45, 60].map((h, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-full transition-all duration-300 ${
                            isPlaying ? "bg-emerald-600 animate-pulse" : "bg-stone-300"
                          }`}
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>

                    <span className="text-[11px] font-mono text-stone-600 shrink-0">
                      {formatDuration(audioFile?.duration || 0)}
                    </span>
                  </div>
                  )}
                </div>
              )}
            </div>

            {/* Optional manual text drawer */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowManualTranscriptInput(!showManualTranscriptInput)}
                className="text-[11px] text-stone-500 hover:text-stone-800 flex items-center gap-1 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManualTranscriptInput ? "rotate-180" : ""}`} />
                <span>أو تفريغ نصي أولي يدوي (بدون صوت)</span>
              </button>

              {showManualTranscriptInput && (
                <div className="mt-2.5 p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold font-cairo text-stone-800">
                    <span className="flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>كتابة جواب الشيخ نصياً (بدون ملف صوتي):</span>
                    </span>
                    {manualRawText && (
                      <button
                        type="button"
                        onClick={() => setManualRawText("")}
                        className="text-[11px] text-red-600 hover:underline"
                      >
                        مسح
                      </button>
                    )}
                  </div>
                  <textarea
                    id="manual-response-textarea"
                    rows={3}
                    value={manualRawText}
                    onChange={(e) => setManualRawText(e.target.value)}
                    placeholder="اكتب أو ألصق نص جواب الشيخ هنا مباشرة ليقوم النظام بتنقيحه وتنسيقه وإعداده للنشر..."
                    className="w-full p-3 rounded-lg border border-stone-300 bg-white text-xs sm:text-sm text-stone-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Offline & Hybrid Mode Selector */}
            <div className="pt-2 border-t border-stone-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-cairo text-stone-800 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-emerald-700" />
                  <span>محرك المعالجة والتفريغ:</span>
                </span>

                <span className="text-[11px] font-tajawal text-stone-500">
                  {!isOnline ? (
                    <span className="text-amber-700 font-bold flex items-center gap-1">
                      <WifiOff className="w-3 h-3" />
                      <span>بدون إنترنت (محلي إجباري)</span>
                    </span>
                  ) : transcribeMode === "gemini" ? (
                    "سحابي حصري (جيميني)"
                  ) : (
                    "محلي في المتصفح"
                  )}
                </span>
              </div>

              {/* Modes Pills */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 rounded-xl text-xs font-cairo">
                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={() => setTranscribeMode("gemini")}
                  className={`py-2 px-2.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all ${
                    transcribeMode === "gemini"
                      ? "bg-white text-[#0c392c] font-bold shadow-2xs border border-stone-200"
                      : !isOnline
                      ? "opacity-40 cursor-not-allowed text-stone-400"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                  title="التفريغ السحابي عبر Gemini 3.5 Flash lite"
                >
                  <div className="flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-teal-600" />
                    <span className="font-bold">سحابي (جيميني)</span>
                  </div>
                  <span className="text-[10px] text-stone-500 font-sans">Gemini 3.5 Flash lite</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTranscribeMode("offline_whisper");
                    if (!isWhisperCached && isOnline && !isPreloadingModel) {
                      handlePreloadWhisper();
                    }
                  }}
                  className={`py-2 px-2.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all ${
                    transcribeMode === "offline_whisper"
                      ? "bg-white text-[#0c392c] font-bold shadow-2xs border border-stone-200"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                  title="تفريغ محلي بدون إنترنت عبر Whisper Tiny"
                >
                  <div className="flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-amber-500" />
                    <span className="font-bold">أوفلاين (بدون نت)</span>
                  </div>
                  <span className="text-[10px] text-stone-500 font-sans">Whisper Tiny (~55MB)</span>
                </button>
              </div>

              {/* Whisper Offline Model Preload / Cache Status Box */}
              {transcribeMode === "offline_whisper" && (
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs animate-in fade-in zoom-in-95 duration-200">
                  {isWhisperCached ? (
                    <div className="space-y-2 text-emerald-950">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="font-bold font-cairo text-xs">
                          نموذج Whisper مثبت ومحفوظ محلياً ({whisperStorage?.cachedMb || "43.6"} MB)
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold shrink-0">
                        جاهز أوفلاين 100% ✅
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-600 font-tajawal leading-relaxed">
                      تم تنزيل النموذج وحفظه لمرة واحدة في الذاكرة الدائمة لجهازك، ويعمل الآن للتفريغ الصوتي دون استهلاك أي إنترنت.
                    </div>

                    <div className="pt-1 border-t border-stone-200/80 text-[10px] text-stone-500 font-tajawal leading-normal">
                      💡 <strong>ملاحظة لأجهزة أندرويد:</strong> يظهر حجم التطبيق في إعدادات النظام كـ ~310 ك.ب (حجم أيقونة PWA)، بينما يُحفظ نموذج الذكاء الاصطناعي بالكامل ({whisperStorage?.cachedMb || "43.6"} MB) داخل ذاكرة المتصفح الدائمة (Cache Storage) ليعمل بدون نت دائماً.
                    </div>
                  </div>
                ) : isPreloadingModel ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-cairo text-stone-800">
                      <span className="flex items-center gap-1.5 font-bold">
                        <HardDriveDownload className="w-4 h-4 text-emerald-700 animate-bounce" />
                        <span>{modelPreloadMessage || "جاري تنزيل وحفظ نموذج Whisper..."}</span>
                      </span>
                      <span className="font-mono font-bold text-emerald-800 text-sm">
                        {Math.round(modelPreloadProgress)}%
                      </span>
                    </div>

                    <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                        style={{ width: `${Math.max(5, modelPreloadProgress)}%` }}
                      />
                    </div>

                    <div className="text-[11px] text-stone-500 font-tajawal flex items-center justify-between">
                      <span>تنزيل لمرة واحدة فقط (~43 ميغابايت) للعمل بدون إنترنت نهائياً.</span>
                      <span className="font-mono font-bold text-stone-700">لا تغلق الصفحة</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="space-y-0.5">
                      <div className="font-bold text-xs text-stone-800 font-cairo flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5 text-amber-700" />
                        <span>تثبيت نموذج التفريغ الصوتي أوفلاين</span>
                      </div>
                      <p className="text-[11px] text-stone-600 font-tajawal">
                        تنزيل النموذج لمرة واحدة فقط (~43 MB) يضمن لك تفريغ التسجيلات حتى في حال انقطاع الإنترنت التام.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handlePreloadWhisper}
                      disabled={!isOnline}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white font-bold font-cairo text-xs flex items-center justify-center gap-1.5 shrink-0 transition-all shadow-xs disabled:opacity-50"
                    >
                      <HardDriveDownload className="w-3.5 h-3.5" />
                      <span>تثبيت النموذج أوفلاين (43 MB)</span>
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Card 1 Bottom Controls & Execution Button */}
          <div className="space-y-3 pt-3 border-t border-stone-200/80">
            {mediaMode === "audio" ? (
              <>
                {/* اختيار نوع الفتوى الصوتي: فتوى عادية / فتوى مؤصلة */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold font-cairo">
                    <span className="flex items-center gap-1.5 text-stone-900">
                      <BookOpen className="w-3.5 h-3.5 text-[#0c392c]" />
                      <span>نوع الفتوى المطلوب تفريغها:</span>
                    </span>
                    <span className="text-[11px] text-stone-500 font-normal">
                      {fatwaType === "moasala" ? "تأصيل فقهي وتخريج للأدلة" : "صياغة فقهية مباشرة وميسرة"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* فتوى عادية */}
                    <button
                      type="button"
                      id="fatwa-type-normal-btn"
                      onClick={() => setFatwaType("normal")}
                      className={`p-2.5 sm:p-3 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        fatwaType === "normal"
                          ? "bg-emerald-50/90 border-[#0c392c] ring-2 ring-emerald-600/20 shadow-xs"
                          : "bg-white border-stone-200 hover:bg-stone-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm font-cairo text-stone-900">
                          فتوى عادية
                        </span>
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center border text-[10px] ${
                            fatwaType === "normal"
                              ? "bg-[#0c392c] border-[#0c392c] text-white"
                              : "border-stone-300 bg-white"
                          }`}
                        >
                          {fatwaType === "normal" && "✓"}
                        </span>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-stone-500 font-tajawal leading-relaxed">
                        إجابة واضحة ومباشرة للسائل مع الأمانة الحرفية لألفاظ الشيخ.
                      </p>
                    </button>

                    {/* فتوى مؤصلة */}
                    <button
                      type="button"
                      id="fatwa-type-moasala-btn"
                      onClick={() => {
                        setFatwaType("moasala");
                        setRequestTashkeel(true);
                      }}
                      className={`p-2.5 sm:p-3 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        fatwaType === "moasala"
                          ? "bg-amber-50/90 border-[#caa24d] ring-2 ring-[#caa24d]/30 shadow-xs"
                          : "bg-white border-stone-200 hover:bg-stone-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs sm:text-sm font-cairo text-stone-900">
                            فتوى مؤصلة
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-bold bg-[#caa24d]/20 text-[#855e16] border border-[#caa24d]/40">
                            تأصيل 📜
                          </span>
                        </div>
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center border text-[10px] ${
                            fatwaType === "moasala"
                              ? "bg-[#caa24d] border-[#caa24d] text-amber-950 font-bold"
                              : "border-stone-300 bg-white"
                          }`}
                        >
                          {fatwaType === "moasala" && "✓"}
                        </span>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-stone-500 font-tajawal leading-relaxed">
                        عزو الأدلة والآيات ﴿ ﴾ والأحاديث مع ضبط مشكول وتنسيق مرجعي رصين.
                      </p>
                    </button>
                  </div>
                </div>

                {/* خيار التشكيل الكامل الصحيح */}
                <div className="p-3 bg-stone-50/90 rounded-2xl border border-stone-200 flex items-center justify-between gap-2.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900 font-cairo">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>تفريغ مشكول بالكامل وصحيح:</span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-stone-600 font-tajawal">
                      ضبط النص بالحركات الإعرابية التامة وتنسيق الآيات والأحاديث برسم صحيح.
                    </p>
                  </div>

                  <button
                    type="button"
                    id="toggle-tashkeel-btn"
                    onClick={() => setRequestTashkeel(!requestTashkeel)}
                    className={`px-3 py-1.5 rounded-xl font-bold font-cairo text-xs shrink-0 transition-all cursor-pointer ${
                      requestTashkeel || fatwaType === "moasala"
                        ? "bg-[#0c392c] text-white shadow-2xs"
                        : "bg-white text-stone-700 border border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {requestTashkeel || fatwaType === "moasala" ? "مُفعّل ✓" : "تفعيل"}
                  </button>
                </div>
              </>
            ) : (
              /* وضع تفريغ الفيديو */
              <div className="p-3.5 bg-amber-50/90 rounded-2xl border border-amber-200/90 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold font-cairo text-amber-950">
                    <Video className="w-4 h-4 text-amber-700" />
                    <span>تفريغ مقاطع الفيديو مع التشكيل والخط العثماني</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                    تشكيل تلقائي ✓
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 font-tajawal leading-relaxed">
                  يتم استخراج كلام الشيخ من الفيديو بدقة، مع الضبط الإعرابي والتشكيل الكامل تلقائياً، وتوثيق الآيات القرآنية بالأقواس ﴿ ﴾ والأحاديث، وتجهيز بطاقة النشر بالخط العثماني.
                </p>
              </div>
            )}

            {/* زرا بدء التفريغ: تفريغ عادي + تفريغ من التسجيل الصوتي فقط */}
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. زر التفريغ العادي (مع السؤال المكتوب) */}
                <button
                  id="transcribe-submit-btn"
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleExecuteTranscription("normal")}
                  className={`w-full py-3 sm:py-3.5 px-3 rounded-2xl font-bold font-cairo text-xs sm:text-sm flex flex-col items-center justify-center gap-1 shadow-sm transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer border min-h-[58px] text-center ${
                    isProcessing && currentTranscribeAction === "normal"
                      ? "bg-stone-400 text-white border-transparent cursor-not-allowed shadow-none"
                      : isProcessing
                      ? "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed shadow-none opacity-60"
                      : "bg-white hover:bg-stone-50 text-stone-800 border-stone-300 hover:border-[#0c392c] shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-md"
                  }`}
                  title="تفريغ الفتوى بالاعتماد على نص السؤال المدخل مع تسجيل الشيخ"
                >
                  {isProcessing && currentTranscribeAction === "normal" ? (
                    <div className="flex items-center gap-1.5 text-white">
                      <ThinkingLogo variant="inline" size={18} label="" />
                      <span className="text-xs">
                        {retryCountdown !== null
                          ? `إعادة المحاولة خلال ${retryCountdown} ث...`
                          : "جاري التفريغ العادي..."}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 font-bold text-stone-900 text-xs sm:text-sm">
                        <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>تفريغ عادي (سؤال + تسجيل)</span>
                      </div>
                      <span className="text-[10px] text-stone-500 font-sans font-normal leading-tight">
                        يربط السؤال المكتوب بجواب الشيخ
                      </span>
                    </>
                  )}
                </button>

                {/* 2. زر التفريغ الحصري من التسجيل الصوتي فقط (استخراج السؤال والجواب من نطق الشيخ حصراً) */}
                <button
                  id="transcribe-audio-only-btn"
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleExecuteTranscription("audio_only")}
                  className={`w-full py-3 sm:py-3.5 px-3 rounded-2xl font-bold font-cairo text-xs sm:text-sm flex flex-col items-center justify-center gap-1 shadow-md transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer min-h-[58px] text-center ${
                    isProcessing && currentTranscribeAction === "audio_only"
                      ? "bg-stone-400 text-white cursor-not-allowed shadow-none"
                      : isProcessing
                      ? "bg-stone-200 text-stone-400 cursor-not-allowed shadow-none opacity-60"
                      : mediaMode === "video"
                      ? "bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-[0_6px_20px_rgba(180,83,9,0.35)]"
                      : transcribeMode === "offline_whisper" || !isOnline
                      ? "bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-white shadow-[0_6px_20px_rgba(217,119,6,0.3)]"
                      : "bg-gradient-to-r from-[#0c392c] via-[#0f4939] to-emerald-900 hover:from-emerald-900 hover:to-[#0c392c] text-white shadow-[0_6px_22px_rgba(12,57,44,0.38)]"
                  }`}
                  title="استخراج السؤال والجواب حصراً من نطق الشيخ في التسجيل الصوتي دون تأليف أو استنتاج خارجي"
                >
                  {isProcessing && currentTranscribeAction === "audio_only" ? (
                    <div className="flex items-center gap-1.5 text-white">
                      <ThinkingLogo variant="inline" size={18} label="" />
                      <span className="text-xs">
                        {retryCountdown !== null
                          ? `إعادة المحاولة خلال ${retryCountdown} ث...`
                          : "جاري الاستخراج من التسجيل..."}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 font-bold text-amber-200 text-xs sm:text-sm">
                        <Volume2 className="w-4 h-4 text-amber-300 shrink-0" />
                        <span>تفريغ من التسجيل الصوتي فقط 🎙️</span>
                      </div>
                      <span className="text-[10px] text-emerald-100/90 font-sans font-normal leading-tight">
                        يستخرج السؤال والجواب من صوت الشيخ دون تأليف
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* بطاقة توضيحية لخدمة المفرغين */}
              <div className="flex items-start gap-2 p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-[11px] text-emerald-950 leading-relaxed">
                <span className="text-emerald-700 font-bold shrink-0 mt-0.5">💡 فائدة:</span>
                <span>
                  زر <strong>(تفريغ من التسجيل فقط)</strong> مخصص للحالات التي يقرأ فيها الشيخ السؤال بنفسه في بداية التسجيل؛ حيث يستخرج السؤال والجواب حرفياً من صوت الشيخ دون الحاجة لكتابة السؤال ودون أي استنتاج خارجي.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: 2. المعالجة والمراجعة */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 border border-stone-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col justify-between min-h-[460px] space-y-4 sm:space-y-5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow">
          <div className="space-y-4 sm:space-y-5">
            {/* Card 2 Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg lg:text-xl font-bold font-cairo text-stone-900 flex items-center gap-2">
                <span>2. المعالجة والمراجعة</span>
              </h2>
              <span className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold bg-stone-100/80 text-stone-600 border border-stone-200/60 shadow-2xs">
                {latestResult ? "النتيجة المفرغة" : "النتيجة المتوقعة"}
              </span>
            </div>

            {/* Empty State when no processing done yet (matching screenshot) */}
            {!isProcessing && !latestResult && (
              <div className="border border-stone-200/50 bg-stone-50/50 rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[300px] space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-white border border-stone-100 text-stone-300 flex items-center justify-center shadow-sm">
                  <FileAudio className="w-8 h-8" />
                </div>
                <p className="text-sm font-medium text-stone-500 font-tajawal max-w-sm leading-relaxed">
                  بانتظار رفع الملف والبدء في المعالجة الآلية. سيظهر هنا التفريغ المنظم للفتوى.
                </p>
                <div className="flex items-center gap-2 text-[11px] text-emerald-700/70 pt-2 font-medium bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>نظام أمانة النقل والتعديل الأدنى</span>
                </div>
              </div>
            )}

            {/* Processing State */}
            {isProcessing && (
              <div className="border border-emerald-200 bg-emerald-50/30 rounded-2xl p-6 sm:p-8 text-center space-y-5 animate-in fade-in">
                <ThinkingLogo
                  variant="block"
                  size={140}
                  label={localProgressInfo?.message || "جاري المعالجة والتحليل الدقيق"}
                  hint={
                    localProgressInfo
                      ? "تجري المعالجة محلياً على جهازك باستخدام نموذج Whisper المدمج وبدون إنترنت"
                      : "يتم استخراج الصوت وتنقيح النص طبقاً لقواعد الأمانة الحرفية"
                  }
                />

                {/* Local Progress Bar if running in browser */}
                {localProgressInfo && localProgressInfo.progress !== undefined && (
                  <div className="max-w-md mx-auto space-y-1.5 pt-1 text-right">
                    <div className="flex items-center justify-between text-xs font-mono text-stone-600">
                      <span>التقدم الإجمالي:</span>
                      <span className="font-bold text-emerald-800">{Math.round(localProgressInfo.progress)}%</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-600 h-full transition-all duration-200 rounded-full"
                        style={{ width: `${Math.max(5, localProgressInfo.progress)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 4 Step Progress Indicators */}
                <div className="grid grid-cols-2 gap-2 text-right text-xs pt-2">
                  <div className={`p-2 rounded-xl border flex items-center gap-2 ${
                    processingStep >= 1 ? "bg-white border-emerald-300 text-emerald-950 font-bold" : "bg-stone-50 border-stone-200 text-stone-400"
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      processingStep > 1 ? "bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-900"
                    }`}>1</span>
                    <span>قراءة الصوت</span>
                  </div>

                  <div className={`p-2 rounded-xl border flex items-center gap-2 ${
                    processingStep >= 2 ? "bg-white border-emerald-300 text-emerald-950 font-bold" : "bg-stone-50 border-stone-200 text-stone-400"
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      processingStep > 2 ? "bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-900"
                    }`}>2</span>
                    <span>التفريغ الحرفي</span>
                  </div>

                  <div className={`p-2 rounded-xl border flex items-center gap-2 ${
                    processingStep >= 3 ? "bg-white border-emerald-300 text-emerald-950 font-bold" : "bg-stone-50 border-stone-200 text-stone-400"
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      processingStep > 3 ? "bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-900"
                    }`}>3</span>
                    <span>التنقيح والترقيم</span>
                  </div>

                  <div className={`p-2 rounded-xl border flex items-center gap-2 ${
                    processingStep >= 4 ? "bg-white border-emerald-300 text-emerald-950 font-bold" : "bg-stone-50 border-stone-200 text-stone-400"
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      processingStep >= 4 ? "bg-emerald-700 text-white" : "bg-stone-200 text-stone-600"
                    }`}>4</span>
                    <span>تجهيز البطاقة</span>
                  </div>
                </div>
              </div>
            )}

            {/* Ready Result State */}
            {latestResult && !isProcessing && (
              <div className="space-y-5 animate-in fade-in">
                {/* Offline Draft Banner & Gemini Polish Action */}
                {latestResult.transcribed_offline && (
                  <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-200/80 text-amber-900 flex items-center justify-center shrink-0 mt-0.5">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs sm:text-sm font-cairo flex items-center gap-2">
                          <span>تم التفريغ محلياً بدون إنترنت (Whisper أوفلاين)</span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 text-[10px] font-mono font-bold">
                            مسودة محلية
                          </span>
                        </div>
                        <p className="text-xs text-amber-900/90 mt-1 leading-relaxed font-tajawal">
                          النص حرفي وأمين من تسجيل الشيخ. عند توفر اتصال بالإنترنت، يمكنك ترقية المسودة وتشكيل الآيات وتخريج الأحاديث بلمسة زر عبر Gemini.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isPolishingWithGemini || !isOnline}
                      onClick={handlePolishOfflineWithGemini}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold font-cairo flex items-center gap-2 shrink-0 transition-all shadow-xs ${
                        !isOnline
                          ? "bg-stone-200 text-stone-500 cursor-not-allowed border border-stone-300"
                          : "bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white border border-emerald-600 cursor-pointer"
                      }`}
                      title={!isOnline ? "يتطلب اتصالاً بالإنترنت" : "تنقيح وتشكيل وتخريج بالذكاء الاصطناعي"}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>{isPolishingWithGemini ? "جاري الترقية بـ Gemini..." : "✨ ترقية وتنقيح بـ Gemini"}</span>
                    </button>
                  </div>
                )}

                {/* 1. أول شيء: شريط النموذج المستخدم وبطاقة قالب الفتوى */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-stone-500 font-cairo">نموذج التفريغ:</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold font-mono text-[11px] bg-emerald-100 text-emerald-900 border border-emerald-300">
                      <Sparkles className="w-3 h-3 text-emerald-700" />
                      <span>{latestResult.model_used || (latestResult.transcribed_offline ? "Whisper Tiny (محلي أوفلاين)" : "Gemini 3.5 Flash lite")}</span>
                    </span>
                  </div>
                  <span className="text-[11px] text-stone-500 font-tajawal">
                    {latestResult.transcribed_offline ? "🔒 معالجة داخلية 100% بدون إنترنت" : "⚡ تفريغ سحابي فائق الدقة والأمانة"}
                  </span>
                </div>

                {/* 🌟 شاشة نسخ الفتوى المشكولة (خاصة بتفريغ الفيديو والتشكيل التام) مع زر التعديل */}
                <div className="rounded-3xl border-2 border-emerald-600/30 bg-gradient-to-b from-white via-[#fbfaf6] to-stone-50 p-4 sm:p-5 shadow-sm space-y-4">
                  {/* شريط عنوان الشاشة وأزرار التحكم */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#0c392c] to-[#145340] text-white flex items-center justify-center shrink-0 shadow-xs border border-emerald-700/30">
                        <Sparkles className="w-4 h-4 text-amber-300" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold font-cairo text-stone-900 text-sm sm:text-base">
                            شاشة نسخ الفتوى المشكولة بالحركات
                          </h3>
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-950 font-bold text-[10px]">
                            {mediaMode === "video" || audioFile?.isVideo ? "تفريغ فيديو 📹" : "مشكول 📜"}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 font-tajawal">
                          السؤال والجواب مضبوطان بالحركات العربية، مع إمكانية التعديل والنسخ المباشر
                        </p>
                      </div>
                    </div>

                    {/* أزرار التعديل ونسخ الكل */}
                    <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
                      <button
                        type="button"
                        id="toggle-edit-tashkeel-btn"
                        onClick={() => {
                          if (!isEditingTashkeel) {
                            setEditableQuestionTashkeel(cleanTashkeelText(editableQuestionTashkeel || latestResult.question_tashkeel || latestResult.question_clean));
                            setEditableAnswerTashkeel(cleanTashkeelText(editableAnswerTashkeel || latestResult.answer_tashkeel || latestResult.answer_clean));
                            setIsEditingTashkeel(true);
                          } else {
                            setIsEditingTashkeel(false);
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold font-cairo text-xs transition-all cursor-pointer ${
                          isEditingTashkeel
                            ? "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                            : "bg-white text-stone-700 border border-stone-300 hover:bg-stone-50 hover:border-emerald-600 shadow-2xs"
                        }`}
                        title="تعديل نص السؤال والجواب المشكولين"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{isEditingTashkeel ? "إلغاء التعديل ✕" : "تعديل ✏️"}</span>
                      </button>

                      <button
                        type="button"
                        id="copy-full-vocalized-btn"
                        onClick={handleCopyFullVocalizedFatwa}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0c392c] hover:bg-[#07251d] text-white font-bold font-cairo text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
                        title="نسخ السؤال والجواب معاً مشكولين بتنسيق WhatsApp للنشر"
                      >
                        {hasCopiedFullVocalized ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-300 stroke-[3]" />
                            <span className="text-emerald-200">تم النسخ ✓</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-amber-300" />
                            <span>نسخ الكل مشكولاً 📋</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* وضع العرض العادي (شاشة النسخ المشكولة) */}
                  {!isEditingTashkeel ? (
                    <div className="space-y-3.5">
                      {/* 1. صندوق السؤال المشكول */}
                      <div className="bg-[#fbfbf9] rounded-2xl p-3.5 border border-stone-200/90 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold font-cairo text-stone-800 flex items-center gap-1.5">
                            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                            <span>السؤال (مشكول بالحركات):</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyQuestionTashkeel(editableQuestionTashkeel || latestResult.question_tashkeel || latestResult.question_clean)}
                            className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                          >
                            {hasCopiedQuestionTashkeel ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-700 stroke-[3]" />
                                <span>تم نسخ السؤال ✓</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-emerald-700" />
                                <span>نسخ السؤال</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-stone-200 text-stone-900 font-uthmanic text-sm sm:text-base leading-relaxed text-right">
                          {cleanTashkeelText(editableQuestionTashkeel || latestResult.question_tashkeel || latestResult.question_clean)}
                        </div>
                      </div>

                      {/* 2. صندوق الجواب المشكول */}
                      <div className="bg-[#fbfbf9] rounded-2xl p-3.5 border border-stone-200/90 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold font-cairo text-stone-800 flex items-center gap-1.5">
                            <FileCheck2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span>جواب الشيخ (مشكول بالحركات والتأصيل):</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyAnswerTashkeel(editableAnswerTashkeel || latestResult.answer_tashkeel || latestResult.answer_clean)}
                            className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                          >
                            {hasCopiedAnswerTashkeel ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-700 stroke-[3]" />
                                <span>تم نسخ الجواب ✓</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-emerald-700" />
                                <span>نسخ الجواب</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="p-3 sm:p-3.5 rounded-xl bg-white border border-stone-200 text-stone-900 font-uthmanic text-sm sm:text-base leading-relaxed text-right whitespace-pre-line max-h-64 overflow-y-auto">
                          {cleanTashkeelText(editableAnswerTashkeel || latestResult.answer_tashkeel || latestResult.answer_clean)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* وضع التعديل المباشر (Inline Edit Mode) */
                    <div className="space-y-3.5 bg-amber-50/50 p-4 rounded-2xl border border-amber-300">
                      <div className="flex items-center justify-between text-xs font-bold font-cairo text-amber-950">
                        <span>✏️ تعديل السؤال والجواب المشكولين:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditableQuestionTashkeel(cleanTashkeelText(editableQuestionTashkeel));
                            setEditableAnswerTashkeel(cleanTashkeelText(editableAnswerTashkeel));
                            showToast("تم تنظيف التشكيلات الزائدة بنجاح ✨", "success");
                          }}
                          className="text-[11px] text-amber-800 hover:text-amber-950 underline cursor-pointer"
                        >
                          تنظيف العلامات والتشكيلات الغريبة ✨
                        </button>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold font-cairo text-stone-700">نص السؤال المشكول:</label>
                        <textarea
                          rows={3}
                          value={editableQuestionTashkeel}
                          onChange={(e) => setEditableQuestionTashkeel(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-uthmanic text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          dir="rtl"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold font-cairo text-stone-700">نص جواب الشيخ المشكول:</label>
                        <textarea
                          rows={6}
                          value={editableAnswerTashkeel}
                          onChange={(e) => setEditableAnswerTashkeel(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-uthmanic text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          dir="rtl"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsEditingTashkeel(false)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold font-cairo bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 cursor-pointer"
                        >
                          إلغاء ✕
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveTashkeelEdits}
                          className="px-4 py-1.5 rounded-xl text-xs font-bold font-cairo bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-200" />
                          <span>حفظ التعديلات ✓</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* زر شاشة تفاصيل الفتوى العربية (السؤال لحال والجواب بالحركات) */}
                <div className="p-3.5 bg-gradient-to-r from-amber-50 via-emerald-50 to-amber-50 rounded-2xl border-2 border-amber-300/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0c392c] to-[#124e3c] text-amber-300 flex items-center justify-center shrink-0 shadow-xs border border-amber-300/40">
                      <BookOpen className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold font-cairo text-stone-900 flex items-center gap-1.5">
                        <span>شاشة تفاصيل الفتوى والبطاقة العثمانية</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900 border border-amber-300">
                          شاملة 📜
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-600 font-tajawal">
                        السؤال لحال، وجواب الشيخ بالرسم العثماني التام بالحركات والتشكيل الدقيق
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const detailsFatwa: Fatwa = {
                        id: `temp-${Date.now()}`,
                        fatwaNumber: 1,
                        question_original: question || latestResult.question_clean,
                        question_clean: latestResult.question_clean,
                        question_tashkeel: editableQuestionTashkeel || latestResult.question_tashkeel || latestResult.question_clean,
                        transcription_raw: latestResult.transcription_raw || latestResult.answer_clean || "",
                        answer_clean: latestResult.answer_clean,
                        answer_tashkeel: editableAnswerTashkeel || latestResult.answer_tashkeel || "",
                        fatwaType: mediaMode === "video" || audioFile?.isVideo ? "moasala" : fatwaType,
                        mediaType: mediaMode === "video" || audioFile?.isVideo ? "video" : (audioFile ? "audio" : "text"),
                        evidence_citations: latestResult.evidence_citations || [],
                        unclear_segments: latestResult.unclear_segments || [],
                        editing_notes: latestResult.editing_notes || [],
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        version: 1,
                        deleted: false,
                        pendingSync: false,
                        status: "مسودة",
                        reviewed: false,
                        approved: false,
                        has_wallahu_aalam: latestResult.detected_wallahu_aalam ?? true,
                        category: "فتاوى عامة",
                        tags: [],
                        template_settings: {
                          ...DEFAULT_TEMPLATE_SETTINGS,
                          templateStyle: previewCardStyle,
                          aspectRatio: "1:1",
                          theme: "emerald",
                          fontSize: "auto",
                        },
                      };
                      if (onOpenArabicDetails) {
                        onOpenArabicDetails(detailsFatwa);
                      } else {
                        setIsArabicDetailsModalOpen(true);
                      }
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0c392c] to-[#124e3c] hover:from-[#082920] hover:to-[#0c392c] text-amber-200 font-bold font-cairo text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-95 border border-amber-300/40"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                    <span>عرض الشاشة العربية الشاملة 📜</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Card Template Selector */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl border border-stone-200 text-xs">
                      <button
                        type="button"
                        id="select-card-style-official"
                        onClick={() => {
                          setPreviewCardStyle("official_khalla");
                          setPreferredTemplateStyle("official_khalla");
                          showToast("تم ضبط قالب الصفحة الرسمية كقالب افتراضي بعد التفريغ", "success");
                        }}
                        className={`px-3 py-1.5 rounded-lg font-bold font-cairo transition-all cursor-pointer flex items-center gap-1.5 ${
                          previewCardStyle === "official_khalla"
                            ? "bg-[#0c392c] text-amber-300 shadow-xs"
                            : "text-stone-600 hover:text-stone-900"
                        }`}
                      >
                        <Check className={`w-3.5 h-3.5 ${previewCardStyle === "official_khalla" ? "opacity-100" : "opacity-0"}`} />
                        <span>القالب الرسمي (الافتراضي) 🌟</span>
                      </button>

                      <button
                        type="button"
                        id="select-card-style-uthmanic"
                        onClick={() => setPreviewCardStyle("uthmanic")}
                        className={`px-3 py-1.5 rounded-lg font-bold font-cairo transition-all cursor-pointer flex items-center gap-1.5 ${
                          previewCardStyle === "uthmanic"
                            ? "bg-[#0c392c] text-amber-200 shadow-xs"
                            : "text-stone-600 hover:text-stone-900"
                        }`}
                      >
                        <span>بطاقة الخط العثماني 📜</span>
                      </button>
                    </div>

                    {onNavigateToCard && (
                      <button
                        onClick={onNavigateToCard}
                        className="text-[11px] font-cairo font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>تخصيص القالب والخط</span>
                      </button>
                    )}
                  </div>

                  {/* The Live Rendered Card Component */}
                  <div className="flex justify-center overflow-x-auto py-1">
                    <div
                      ref={directCardRef}
                      dir="rtl"
                      className={`w-full max-w-[460px] rounded-3xl p-3 sm:p-4 flex flex-col justify-between relative shadow-xl select-none text-right transition-all ${
                        previewCardStyle === "uthmanic"
                          ? "bg-[#fbf9f4] border-[3px] border-[#0c392c] outline outline-1 outline-[#caa24d] outline-offset-[-6px]"
                          : "bg-[#fbfaf3] border-[3px] border-[#0c392c]"
                      }`}
                    >
                      {/* Inner gold frame for official template */}
                      {previewCardStyle === "official_khalla" ? (
                        <div className="bg-[#fbfaf3] border-[1.5px] border-[#caa24d] rounded-[18px] p-3.5 sm:p-4 flex-1 flex flex-col justify-between relative">
                          {/* Official Top Emblem */}
                          <div className="flex flex-col items-center justify-center pt-1 pb-2">
                            <img
                              src="/sheikh-emblem-complete.png"
                              alt="فضيلة الدكتور عبد الباري محمد خلة"
                              className="w-28 h-28 sm:w-32 sm:h-32 object-contain drop-shadow-2xs select-none"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/sheikh-emblem-perfect.png";
                              }}
                            />
                          </div>

                          {/* Question and Answer Boxes Stack */}
                          <div className="space-y-3.5 my-1 flex-1 flex flex-col justify-start">
                            {/* Question Box */}
                            <div className="rounded-xl overflow-hidden shadow-2xs">
                              <div className="bg-[#0c3a2d] text-white font-bold text-center py-1.5 px-3 text-xs sm:text-sm font-cairo flex items-center justify-center">
                                <span>السؤال:</span>
                              </div>
                              <div className="bg-white border-x-[1.6px] border-b-[1.6px] border-[#caa24d] rounded-b-xl p-3 text-right">
                                <p className="font-tajawal text-xs sm:text-sm font-semibold text-stone-900 leading-relaxed">
                                  {cleanTashkeelText(editableQuestionTashkeel || latestResult.question_tashkeel || latestResult.question_clean)}
                                </p>
                              </div>
                            </div>

                            {/* Answer Box */}
                            <div className="rounded-xl overflow-hidden shadow-2xs flex-1 flex flex-col">
                              <div className="bg-[#0c3a2d] text-white font-bold text-center py-1.5 px-3 text-xs sm:text-sm font-cairo flex items-center justify-center">
                                <span>جواب فضيلة الشيخ د. عبد الباري محمد خلة:</span>
                              </div>
                              <div className="bg-white border-x-[1.6px] border-b-[1.6px] border-[#caa24d] rounded-b-xl p-3 sm:p-4 text-right flex-1 flex flex-col justify-between">
                                <div className="leading-7 font-tajawal text-xs sm:text-sm text-stone-900 whitespace-pre-line">
                                  {cleanTashkeelText(editableAnswerTashkeel || latestResult.answer_tashkeel || latestResult.answer_clean)}
                                </div>
                                <div className="text-left font-amiri font-bold text-[#0c392c] text-xs sm:text-sm mt-3 pt-1 border-t border-stone-200/60">
                                  والله تعالى أعلم
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Bottom Footer Ribbon */}
                          <div className="pt-3 mt-2 flex items-center justify-center gap-2 text-[#0c3a2d] text-[11px] font-bold font-cairo select-none">
                            <div className="h-[1px] bg-gradient-to-r from-transparent via-[#caa24d] to-[#caa24d] flex-1 max-w-[50px]" />
                            <span className="text-[#caa24d]">✦</span>
                            <span>الصفحة الرسمية للفتاوى</span>
                            <span className="text-[#caa24d]">✦</span>
                            <div className="h-[1px] bg-gradient-to-l from-transparent via-[#caa24d] to-[#caa24d] flex-1 max-w-[50px]" />
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 sm:p-3 flex-1 flex flex-col justify-between relative">
                          {/* Islamic Decorative Corners */}
                          <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-[#caa24d] rounded-tr-lg opacity-90" />
                          <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-[#caa24d] rounded-tl-lg opacity-90" />
                          <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-[#caa24d] rounded-br-lg opacity-90" />
                          <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-[#caa24d] rounded-bl-lg opacity-90" />

                          {/* Header */}
                          <div className="border-b pb-3 mb-3 border-[#caa24d]/30 text-center space-y-1">
                            <div className="text-sm font-amiri font-bold text-[#855e16] tracking-wider mb-0.5">
                              بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
                            </div>
                            <div className="text-[11px] uppercase tracking-wide font-bold text-[#0c392c] font-cairo flex items-center justify-center gap-1.5">
                              <span>✍🏻 اطرح سؤالك والشيخ يجيب 📚</span>
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-[#855e16] font-cairo text-[9px] font-bold border border-amber-300">
                                رسم عثماني مشكول
                              </span>
                            </div>
                            <h1 className="text-base sm:text-lg font-bold font-cairo text-stone-900 mt-0.5">
                              فتاوى فضيلة الشيخ د. عبد الباري خلة
                            </h1>
                            <div className="text-[11px] font-cairo text-[#caa24d] font-semibold">
                              ﴿ فَاسْأَلُوا أَهْلَ الذِّكْرِ إِن كُنتُمْ لَا تَعْلَمُونَ ﴾
                            </div>
                          </div>

                          {/* Question & Answer Body */}
                          <div className="space-y-3 my-1">
                            {/* Question Box */}
                            <div className="p-3 rounded-2xl space-y-1 bg-[#f5efe2] border border-[#e2d5bd]">
                              <div className="flex items-center gap-1 text-[11px] font-bold font-cairo text-stone-700">
                                <HelpCircle className="w-3 h-3 text-amber-600" />
                                <span>السؤال:</span>
                              </div>
                              <p className="text-xs sm:text-sm font-semibold text-stone-900 leading-relaxed font-uthmanic text-[14px]">
                                {cleanTashkeelText(editableQuestionTashkeel || latestResult.question_tashkeel || latestResult.question_clean)}
                              </p>
                            </div>

                            {/* Answer */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-[11px] font-bold font-cairo text-stone-700">
                                  <FileCheck2 className="w-3 h-3 text-emerald-600" />
                                  <span>الجواب:</span>
                                </div>
                                {latestResult.answer_tashkeel && (
                                  <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                                    تشكيل صحيح كامل ✨
                                  </span>
                                )}
                              </div>
                              <div className="leading-7 text-[#132a22] whitespace-pre-line font-uthmanic text-[14px] sm:text-[15px] tracking-wide">
                                {cleanTashkeelText(editableAnswerTashkeel || latestResult.answer_tashkeel || latestResult.answer_clean)}
                              </div>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="pt-3 mt-3 border-t border-[#caa24d]/30 flex items-center justify-between text-[10px] text-stone-500">
                            <span className="font-amiri text-xs font-bold text-[#0c392c]">
                              والله تعالى أعلم
                            </span>
                            <span className="font-tajawal font-medium">
                              فتاوى الشيخ د. عبد الباري خلة
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* زر تحميل القالب مباشرة تحته (Under the Card) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={handleDownloadDirectCard}
                      disabled={isDownloadingCard}
                      className="py-3 px-4 rounded-xl bg-[#0c392c] hover:bg-[#08281f] active:scale-98 text-white font-bold font-cairo text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-amber-300" />
                      <span>{isDownloadingCard ? "جارٍ تجهيز الصورة..." : `تحميل ${previewCardStyle === "uthmanic" ? "بطاقة الخط العثماني" : "بطاقة الفتوى"} صورة (PNG)`}</span>
                    </button>

                    <button
                      onClick={handleCopyDirectCard}
                      disabled={isDownloadingCard}
                      className="py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white font-bold font-cairo text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                    >
                      {copiedCardImage ? <Check className="w-4 h-4 text-amber-300" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedCardImage ? "تم نسخ الصورة بالحافظة!" : "نسخ البطاقة كصورة"}</span>
                    </button>
                  </div>
                </div>

                {/* 2. تحته باقي الأشياء: زر الواتساب، النصوص المنقحة، والملاحظات */}
                <div className="pt-3 border-t border-stone-200 space-y-4">
                  {/* زر نسخ للنشر واتساب */}
                  <button
                    onClick={handleCopyWhatsAppText}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold font-cairo text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    {hasCopiedFinal ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>نسخ نص الفتوى للنشر (WhatsApp)</span>
                  </button>

                  {/* Clean Question Box */}
                  <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                    <div className="flex items-center justify-between text-xs text-stone-500 font-cairo">
                      <span className="font-bold text-stone-700">السؤال المنقّح:</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(latestResult.question_clean);
                          showToast("تم نسخ السؤال المنقح", "info");
                        }}
                        className="text-stone-400 hover:text-stone-800"
                        title="نسخ السؤال"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-stone-900 font-tajawal leading-relaxed">
                      {latestResult.question_clean}
                    </p>
                  </div>

                  {/* Sheikh's Clean Answer with Tashkeel Toggle */}
                  <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-950 font-cairo">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                        <span className="font-bold">نص جواب فضيلة الشيخ د. عبد الباري خلة:</span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {/* Tabs for Clean vs Tashkeel */}
                        {latestResult.answer_tashkeel && (
                          <div className="flex items-center p-0.5 bg-emerald-100/80 rounded-lg text-[11px] font-cairo">
                            <button
                              type="button"
                              onClick={() => setResultTextTab("clean")}
                              className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                                resultTextTab === "clean"
                                  ? "bg-white text-emerald-950 shadow-2xs"
                                  : "text-emerald-800 hover:text-emerald-950"
                              }`}
                            >
                              النص المنقح
                            </button>
                            <button
                              type="button"
                              onClick={() => setResultTextTab("tashkeel")}
                              className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center gap-1 ${
                                resultTextTab === "tashkeel"
                                  ? "bg-[#0c392c] text-amber-200 shadow-2xs"
                                  : "text-emerald-800 hover:text-emerald-950"
                              }`}
                            >
                              <span>المشكول بالكامل 📜</span>
                            </button>
                          </div>
                        )}

                        <button
                          onClick={() => {
                            const textToCopy =
                              resultTextTab === "tashkeel" && latestResult.answer_tashkeel
                                ? latestResult.answer_tashkeel
                                : latestResult.answer_clean;
                            navigator.clipboard.writeText(textToCopy);
                            showToast("تم نسخ نص الجواب", "info");
                          }}
                          className="text-emerald-700 hover:text-emerald-950 flex items-center gap-1 text-[11px] font-bold bg-white px-2 py-1 rounded-lg border border-emerald-200"
                          title="نسخ نص الجواب"
                        >
                          <Copy className="w-3 h-3" />
                          <span>نسخ الجواب</span>
                        </button>
                      </div>
                    </div>

                    <div className={`text-stone-800 leading-relaxed whitespace-pre-wrap ${
                      resultTextTab === "tashkeel" && latestResult.answer_tashkeel
                        ? "font-uthmanic text-base sm:text-lg leading-8 tracking-wide text-stone-900 bg-white/70 p-3 rounded-xl border border-emerald-100"
                        : "font-tajawal text-xs sm:text-sm leading-6"
                    }`}>
                      {resultTextTab === "tashkeel" && latestResult.answer_tashkeel
                        ? latestResult.answer_tashkeel
                        : latestResult.answer_clean}
                    </div>
                  </div>

                  {/* Unclear Terms Notice (if any) */}
                  {latestResult.unclear_segments && latestResult.unclear_segments.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1 text-amber-800">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>مقاطع تحتاج تأكيد المحرر:</span>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {latestResult.unclear_segments.map((seg, idx) => (
                          <span key={idx} className="bg-white border border-amber-300 px-2 py-0.5 rounded-md font-mono text-[11px]">
                            {seg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Additional Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    {onNavigateToReview && (
                      <button
                        onClick={onNavigateToReview}
                        className="py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold font-cairo text-xs flex items-center justify-center gap-1.5 border border-stone-300 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-stone-500" />
                        <span>فتح شاشة المراجعة والتنقيح الكاملة</span>
                      </button>
                    )}

                    {onNavigateToCard && (
                      <button
                        onClick={onNavigateToCard}
                        className="py-2.5 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold font-cairo text-xs flex items-center justify-center gap-1.5 border border-teal-200 transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
                        <span>استوديو القوالب المتقدم (أبعاد وثيمات أخرى)</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Word Document Import Feature Card */}
      <div className="bg-gradient-to-l from-emerald-950 via-[#0c392c] to-[#082a20] rounded-3xl p-5 sm:p-6 border border-emerald-700/50 shadow-md text-white space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 shadow-inner shrink-0 mt-1 sm:mt-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-800/80 text-amber-300 border border-emerald-600/40 text-[11px] font-bold font-cairo">
                <Sparkles className="w-3 h-3" />
                <span>ميزة جديدة: تفريغ واستيراد ملفات Word (.docx)</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold font-cairo text-white">
                هل لديك ملف وورد يحتوي على فتاوى مفرغة مسبقاً؟
              </h3>
              <p className="text-xs text-emerald-200/90 font-tajawal max-w-2xl leading-relaxed">
                ارفع ملف Word بالكامل، وسيقوم الذكاء الاصطناعي باستخراج كافة الفتاوى، وفصل كل سؤال وجواب بدقة وترتيبها، وإدراجها في الأرشيف لتتمكن من فحصها ومراجعتها بالترتيب ثم اعتمادها بنقرة واحدة.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsWordModalOpen(true)}
            className="w-full md:w-auto px-5 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-emerald-950 font-bold font-cairo text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-emerald-900" />
            <span>تفريغ ملف وورد الآن</span>
          </button>
        </div>
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

      {/* شاشة تفاصيل الفتوى والبطاقة العثمانية (السؤال لحال والجواب بالحركات) */}
      {latestResult && (
        <ArabicFatwaDetailsModal
          isOpen={isArabicDetailsModalOpen}
          onClose={() => setIsArabicDetailsModalOpen(false)}
          fatwa={{
            id: `temp-${Date.now()}`,
            fatwaNumber: 1,
            question_original: question || latestResult.question_clean,
            question_clean: latestResult.question_clean,
            transcription_raw: latestResult.transcription_raw || latestResult.answer_clean || "",
            answer_clean: latestResult.answer_clean,
            answer_tashkeel: latestResult.answer_tashkeel || "",
            fatwaType: mediaMode === "video" || audioFile?.isVideo ? "moasala" : fatwaType,
            mediaType: mediaMode === "video" || audioFile?.isVideo ? "video" : (audioFile ? "audio" : "text"),
            evidence_citations: latestResult.evidence_citations || [],
            unclear_segments: latestResult.unclear_segments || [],
            editing_notes: latestResult.editing_notes || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: 1,
            deleted: false,
            pendingSync: false,
            status: "مسودة",
            reviewed: false,
            approved: false,
            has_wallahu_aalam: latestResult.detected_wallahu_aalam ?? true,
            category: "فتاوى عامة",
            tags: [],
            template_settings: {
              ...DEFAULT_TEMPLATE_SETTINGS,
              templateStyle: previewCardStyle,
              aspectRatio: "1:1",
              theme: "emerald",
              fontSize: "auto",
            },
          }}
          onNavigateToCard={onNavigateToCard}
          showToast={showToast}
        />
      )}

      {/* Bottom Disclaimer Banner matching Screenshot */}
      <div className="p-3.5 rounded-xl bg-[#f4ede0]/80 border border-[#e4d7c0] text-[#4a3928] text-xs font-tajawal flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-[#8c6d48]" />
          <span>
            تنبيه: هذا النظام مخصص للتفريغ والتنظيم فقط، تجب مراجعة النص من قبل المختصين قبل النشر.
          </span>
        </div>
        <div className="text-[11px] text-[#7a6042] font-semibold">
          جميع الحقوق محفوظة © {new Date().getFullYear()} د. عبد الباري خلة
        </div>
      </div>
    </div>
  );
};
