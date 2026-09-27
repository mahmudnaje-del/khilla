import { pipeline, env } from "@huggingface/transformers";
import { TranscribeResponse, Fatwa } from "../types";

// Configure Hugging Face Transformers.js for browser client-side execution
env.allowLocalModels = false;
env.useBrowserCache = true;
env.allowRemoteModels = true;

// Disable multi-threading in wasm for reliable mobile execution
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

export interface OfflineTranscribeProgress {
  status: "idle" | "downloading" | "loading" | "decoding" | "transcribing" | "ready" | "error";
  progress?: number; // 0 to 100
  loadedBytes?: number;
  totalBytes?: number;
  message: string;
}

export interface OfflineTranscribeResult {
  text: string;
  transcription_raw: string;
  answer_clean: string;
  question_clean: string;
  duration?: number;
  model: string;
  is_offline: boolean;
}

export interface WhisperStorageInfo {
  isCached: boolean;
  cachedBytes: number;
  cachedMb: string;
  persisted: boolean;
  totalFiles: number;
}

// Global cached pipeline instance for direct fallback
let cachedTranscriber: any = null;
let isModelLoading = false;
const MODEL_ID = "onnx-community/whisper-tiny";

// Web Worker instance
let whisperWorker: Worker | null = null;

function getWhisperWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (!whisperWorker) {
    try {
      whisperWorker = new Worker(new URL("../workers/whisperWorker.ts", import.meta.url), {
        type: "module",
      });
    } catch (e) {
      console.warn("Web Worker creation failed, fallback to main thread:", e);
      whisperWorker = null;
    }
  }
  return whisperWorker;
}

/**
 * Get detailed storage status of the Whisper model from CacheStorage
 */
export async function getWhisperStorageDetails(): Promise<WhisperStorageInfo> {
  let isCached = false;
  let cachedBytes = 0;
  let persisted = false;
  let totalFiles = 0;

  try {
    if (typeof window !== "undefined" && "navigator" in window && navigator.storage) {
      if (navigator.storage.persisted) {
        persisted = await navigator.storage.persisted().catch(() => false);
      }
    }

    if (typeof window !== "undefined" && "caches" in window) {
      const cacheNames = await window.caches.keys();
      for (const name of cacheNames) {
        if (name.includes("transformers") || name.includes("onnx")) {
          const cache = await window.caches.open(name);
          const requests = await cache.keys();
          totalFiles += requests.length;

          let hasEncoder = false;
          let hasDecoder = false;
          let hasTokenizer = false;

          for (const req of requests) {
            const url = req.url.toLowerCase();
            if (url.includes("encoder_model")) hasEncoder = true;
            if (url.includes("decoder_model")) hasDecoder = true;
            if (url.includes("tokenizer")) hasTokenizer = true;

            const res = await cache.match(req);
            if (res) {
              const blob = await res.clone().blob().catch(() => null);
              if (blob) cachedBytes += blob.size;
            }
          }

          if (hasEncoder && hasDecoder && hasTokenizer && cachedBytes > 30 * 1024 * 1024) {
            isCached = true;
          }
        }
      }
    }

    if (isCached) {
      localStorage.setItem("khilla_whisper_cached", "true");
    } else if (localStorage.getItem("khilla_whisper_cached") === "true" && cachedBytes > 20 * 1024 * 1024) {
      isCached = true;
    } else if (cachedBytes === 0 && localStorage.getItem("khilla_whisper_cached") !== "true") {
      localStorage.removeItem("khilla_whisper_cached");
    }
  } catch (err) {
    console.warn("Could not check storage details for Whisper:", err);
  }

  const cachedMb = (cachedBytes / (1024 * 1024)).toFixed(1);
  return { isCached, cachedBytes, cachedMb, persisted, totalFiles };
}

/**
 * Check if the Whisper model is truly downloaded and cached locally in CacheStorage
 */
export async function isWhisperModelCached(): Promise<boolean> {
  const details = await getWhisperStorageDetails();
  return details.isCached;
}

/**
 * Request permanent storage from browser to prevent automatic cache eviction
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof window !== "undefined" && "navigator" in window && navigator.storage?.persist) {
    try {
      const granted = await navigator.storage.persist();
      console.log("Persistent storage granted:", granted);
      return granted;
    } catch (e) {
      console.warn("Could not request persistent storage:", e);
    }
  }
  return false;
}

/**
 * Preload and cache the Whisper model locally while online
 */
export async function preloadWhisperModel(
  onProgress?: (info: OfflineTranscribeProgress) => void
): Promise<boolean> {
  // Check if already cached
  const initialCheck = await getWhisperStorageDetails();
  if (initialCheck.isCached) {
    onProgress?.({
      status: "ready",
      progress: 100,
      message: `النموذج مثبت ومحفوظ محلياً بالفعل (${initialCheck.cachedMb} MB) وجاهز للعمل بدون إنترنت!`,
    });
    return true;
  }

  if (isModelLoading) {
    onProgress?.({
      status: "loading",
      message: "النموذج قيد التنزيل والتثبيت حالياً، يرجى الانتظار...",
    });
    return false;
  }

  isModelLoading = true;

  // Attempt persistent storage
  await requestPersistentStorage().catch(() => {});

  const worker = getWhisperWorker();

  if (worker) {
    return new Promise((resolve) => {
      const reqId = "preload-" + Date.now();

      const handleMsg = async (e: MessageEvent) => {
        const { type, id, payload, error } = e.data || {};
        if (id !== reqId) return;

        if (type === "progress" && payload) {
          onProgress?.(payload);
        } else if (type === "ready") {
          worker.removeEventListener("message", handleMsg);
          isModelLoading = false;
          
          // Verify actual cache on disk
          const finalCheck = await getWhisperStorageDetails();
          const sizeMsg = finalCheck.cachedBytes > 0 ? ` (${finalCheck.cachedMb} MB)` : "";
          
          localStorage.setItem("khilla_whisper_cached", "true");
          onProgress?.({
            status: "ready",
            progress: 100,
            message: `اكتمل تثبيت نموذج Whisper${sizeMsg}! يمكنك الآن استخدامه بدون إنترنت نهائياً.`,
          });
          resolve(true);
        } else if (type === "error") {
          worker.removeEventListener("message", handleMsg);
          isModelLoading = false;
          console.warn("Worker preload failed, falling back to direct:", error);
          // Fallback to direct thread
          preloadDirect(onProgress).then(resolve);
        }
      };

      worker.addEventListener("message", handleMsg);
      worker.postMessage({ type: "preload", id: reqId });
    });
  }

  return preloadDirect(onProgress);
}

async function preloadDirect(
  onProgress?: (info: OfflineTranscribeProgress) => void
): Promise<boolean> {
  try {
    let maxProgress = 5;
    const fileProgress = new Map<string, { loaded: number; total: number }>();
    const ESTIMATED_TOTAL_BYTES = 55 * 1024 * 1024; // ~55 MB

    onProgress?.({
      status: "downloading",
      progress: maxProgress,
      message: "جاري الاتصال لتحميل نموذج Whisper Tiny المخصص للهواتف والمتصفح (~55 MB)...",
    });

    let retries = 3;
    let lastError: any = null;
    
    while (retries > 0) {
      try {
        cachedTranscriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
          dtype: {
            encoder_model: "fp32",
            decoder_model_merged: "q4",
          },
          progress_callback: (p: any) => {
            if (p.status === "initiate") {
              fileProgress.set(p.file || "unknown", { loaded: 0, total: p.total || 0 });
            } else if (p.status === "progress") {
              if (p.file) {
                fileProgress.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
              }
              let totalLoaded = 0;
              fileProgress.forEach((val) => {
                totalLoaded += (val.loaded || 0);
              });
              
              const calculatedPercent = Math.min(96, Math.max(5, Math.round((totalLoaded / ESTIMATED_TOTAL_BYTES) * 100)));
              maxProgress = Math.max(maxProgress, calculatedPercent);
              
              const mbLoaded = (totalLoaded / (1024 * 1024)).toFixed(1);
              const mbTotal = (ESTIMATED_TOTAL_BYTES / (1024 * 1024)).toFixed(0);
              
              onProgress?.({
                status: "downloading",
                progress: maxProgress,
                loadedBytes: totalLoaded,
                totalBytes: ESTIMATED_TOTAL_BYTES,
                message: `جاري تنزيل ملفات النموذج (${mbLoaded} من ~${mbTotal} ميغابايت - ${maxProgress}%)...`,
              });
            } else if (p.status === "ready" || p.status === "done") {
              if (p.status === "ready") {
                maxProgress = Math.max(maxProgress, 96);
                onProgress?.({
                  status: "loading",
                  progress: maxProgress,
                  message: "اكتمل التنزيل بنجاح! جاري تثبيت المحرك في الذاكرة الدائمة...",
                });
              }
            }
          },
        });
        break; // Success
      } catch (e) {
        console.warn(`Direct Pipeline load failed, retrying... (${retries} left)`, e);
        lastError = e;
        retries--;
        if (retries > 0) {
          onProgress?.({
            status: "downloading",
            progress: maxProgress,
            message: `انقطع الاتصال، جاري إعادة المحاولة والاستئناف تلقائياً... (${retries})`,
          });
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    
    if (!cachedTranscriber) {
      throw lastError || new Error("فشل تحميل النموذج بعد عدة محاولات");
    }

    const finalCheck = await getWhisperStorageDetails();
    const sizeMsg = finalCheck.cachedBytes > 0 ? ` (${finalCheck.cachedMb} MB)` : "";

    localStorage.setItem("khilla_whisper_cached", "true");
    onProgress?.({
      status: "ready",
      progress: 100,
      message: `تم تثبيت نموذج Whisper${sizeMsg} بنجاح! التطبيق جاهز للتفريغ بدون نت.`,
    });
    isModelLoading = false;
    return true;
  } catch (err: any) {
    isModelLoading = false;
    console.error("Failed to preload Whisper model directly:", err);
    onProgress?.({
      status: "error",
      message: `تعذر تجهيز النموذج: ${err?.message || "خطأ غير متوقع"}`,
    });
    return false;
  }
}

/**
 * Remove Whisper cached models to free storage if requested
 */
export async function clearWhisperCache(): Promise<boolean> {
  try {
    if (typeof window !== "undefined" && "caches" in window) {
      const cacheNames = await window.caches.keys();
      for (const name of cacheNames) {
        if (name.includes("transformers") || name.includes("onnx")) {
          await window.caches.delete(name);
        }
      }
    }
    localStorage.removeItem("khilla_whisper_cached");
    cachedTranscriber = null;
    return true;
  } catch (e) {
    console.error("Could not clear whisper cache:", e);
    return false;
  }
}

/**
 * Decode any audio input (File, Blob, or DataURL) into a 16000 Hz Mono Float32Array
 */
export async function decodeAudioTo16kMono(
  audioSource: File | Blob | string
): Promise<{ float32Data: Float32Array; duration: number }> {
  let arrayBuffer: ArrayBuffer;

  if (typeof audioSource === "string") {
    if (audioSource.startsWith("data:")) {
      const base64Data = audioSource.split(",")[1];
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer;
    } else {
      const res = await fetch(audioSource);
      arrayBuffer = await res.arrayBuffer();
    }
  } else {
    arrayBuffer = await audioSource.arrayBuffer();
  }

  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  const tempCtx = new AudioCtxClass();
  let decodedBuffer: AudioBuffer;
  try {
    decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    tempCtx.close().catch(() => {});
  }

  const duration = decodedBuffer.duration;
  const targetSampleRate = 16000;
  const numChannels = 1;
  const targetLength = Math.max(1, Math.round(duration * targetSampleRate));

  const offlineCtx = new OfflineAudioContext(numChannels, targetLength, targetSampleRate);
  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = decodedBuffer;
  sourceNode.connect(offlineCtx.destination);
  sourceNode.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const float32Data = renderedBuffer.getChannelData(0);

  return { float32Data, duration };
}

/**
 * Run client-side speech-to-text directly in the user's browser without internet
 */
export async function transcribeAudioLocally(
  audioSource: File | Blob | string,
  questionText?: string,
  onProgress?: (info: OfflineTranscribeProgress) => void
): Promise<OfflineTranscribeResult> {
  onProgress?.({
    status: "decoding",
    message: "جاري فك تشفير المقطع الصوتي وضبط التردد (16kHz)...",
  });

  const { float32Data, duration } = await decodeAudioTo16kMono(audioSource);

  const worker = getWhisperWorker();

  let rawText = "";

  if (worker) {
    try {
      rawText = await new Promise<string>((resolve, reject) => {
        const reqId = "transcribe-" + Date.now();

        const handleMsg = (e: MessageEvent) => {
          const { type, id, payload, error } = e.data || {};
          if (id !== reqId) return;

          if (type === "progress" && payload) {
            onProgress?.(payload);
          } else if (type === "transcribed" && payload) {
            worker.removeEventListener("message", handleMsg);
            resolve(payload.text || "");
          } else if (type === "error") {
            worker.removeEventListener("message", handleMsg);
            reject(new Error(error || "فشل التفريغ في Worker"));
          }
        };

        worker.addEventListener("message", handleMsg);
        // Post message without neutering buffer so fallback remains valid
        worker.postMessage({
          type: "transcribe",
          id: reqId,
          payload: {
            float32Data,
            duration,
          },
        });
      });
    } catch (workerErr) {
      console.warn("Worker transcription encountered an issue, trying in-thread:", workerErr);
      rawText = await transcribeInThread(float32Data, duration, onProgress);
    }
  } else {
    rawText = await transcribeInThread(float32Data, duration, onProgress);
  }

  // Formatting for offline output
  let cleanedAnswer = rawText.trim();
  if (cleanedAnswer && !cleanedAnswer.includes("والله أعلم") && !cleanedAnswer.includes("والله تعالى أعلم")) {
    cleanedAnswer = `${cleanedAnswer}\n\nوالله أعلم.`;
  }

  cleanedAnswer = cleanedAnswer
    .replace(/\s+/g, " ")
    .replace(/([.؟!\n])\s*/g, "$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let cleanQuestion = (questionText || "").trim();
  cleanQuestion = cleanQuestion.replace(/^(?:و\s*عليكم\s+السلام)/i, "السلام عليكم");

  onProgress?.({
    status: "ready",
    progress: 100,
    message: "تم التفريغ المحلي بنجاح وبدون استهلاك أي بيانات إنترنت!",
  });

  return {
    text: rawText,
    transcription_raw: rawText,
    answer_clean: cleanedAnswer,
    question_clean: cleanQuestion || "سؤال من التسجيل الصوتي",
    duration,
    model: "Whisper-Tiny (محلي بدون إنترنت)",
    is_offline: true,
  };
}

async function transcribeInThread(
  float32Data: Float32Array,
  duration: number,
  onProgress?: (info: OfflineTranscribeProgress) => void
): Promise<string> {
  if (!cachedTranscriber) {
    onProgress?.({
      status: "loading",
      message: "جاري تحميل محرك التفريغ المحلي في المتصفح...",
    });
    const loaded = await preloadDirect(onProgress);
    if (!loaded || !cachedTranscriber) {
      throw new Error("تعذر تحميل نموذج التفريغ المحلي. يرجى التأكد من توفر اتصال بالإنترنت في المرة الأولى.");
    }
  }

  onProgress?.({
    status: "transcribing",
    message: `جاري التفريغ الصوتي على المعالج الداخلي للجهاز (${Math.round(duration)} ثانية)...`,
  });

  const output = await cachedTranscriber(float32Data, {
    language: "arabic",
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  });

  return (typeof output === "string" ? output : output?.text || "").trim();
}

/**
 * Polish / Refine an offline transcribed fatwa using Gemini AI once online
 */
export async function polishOfflineFatwaWithGemini(params: {
  question: string;
  rawText: string;
  strictMode?: boolean;
}): Promise<TranscribeResponse> {
  const payload = {
    question_original: params.question.trim(),
    text_raw_answer: params.rawText.trim(),
    strict_mode: params.strictMode ?? true,
  };

  const res = await fetch("/api/transcribe-fatwa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `فشل تنقيح الفتوى عبر الذكاء الاصطناعي (${res.status})`);
  }

  const data: TranscribeResponse = await res.json();
  return {
    ...data,
    transcription_engine: "gemini",
    transcribed_offline: false,
  };
}
