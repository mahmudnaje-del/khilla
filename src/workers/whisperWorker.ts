import { pipeline, env } from "@huggingface/transformers";

// Configure Hugging Face Transformers.js environment in Web Worker
env.allowLocalModels = false;
env.useBrowserCache = true;
env.allowRemoteModels = true;

// Disable multi-threading in worker to avoid unsupported nested workers in mobile Chrome
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

let transcriber: any = null;
const MODEL_ID = "onnx-community/whisper-tiny";

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, payload, id } = event.data || {};

  if (type === "preload" || type === "load") {
    try {
      if (!transcriber) {
        let maxProgress = 5;
        const fileProgress = new Map<string, { loaded: number; total: number }>();
        const ESTIMATED_TOTAL_BYTES = 55 * 1024 * 1024; // ~55 MB for whisper-tiny fp32 encoder + q4 decoder

        self.postMessage({
          type: "progress",
          id,
          payload: {
            status: "downloading",
            progress: maxProgress,
            message: "جاري الاتصال لتحميل نموذج Whisper Tiny المخصص للعمل بدون إنترنت (~55 ميغابايت)...",
          },
        });

        let retries = 3;
        let lastError: any = null;
        
        while (retries > 0) {
          try {
            transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
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
                  
                  self.postMessage({
                    type: "progress",
                    id,
                    payload: {
                      status: "downloading",
                      progress: maxProgress,
                      loadedBytes: totalLoaded,
                      totalBytes: ESTIMATED_TOTAL_BYTES,
                      message: `جاري تنزيل ملفات النموذج (${mbLoaded} من ~${mbTotal} ميغابايت - ${maxProgress}%)...`,
                    },
                  });
                } else if (p.status === "ready" || p.status === "done") {
                  if (p.status === "ready") {
                    maxProgress = Math.max(maxProgress, 96);
                    self.postMessage({
                      type: "progress",
                      id,
                      payload: {
                        status: "loading",
                        progress: maxProgress,
                        message: "اكتمل التنزيل بنجاح! جاري تثبيت المحرك في الذاكرة الدائمة...",
                      },
                    });
                  }
                }
              },
            });
            break; // Success
          } catch (e) {
            console.warn(`[WhisperWorker] Pipeline load failed, retrying... (${retries} left)`, e);
            lastError = e;
            retries--;
            if (retries > 0) {
              self.postMessage({
                type: "progress",
                id,
                payload: {
                  status: "downloading",
                  progress: maxProgress,
                  message: `انقطع الاتصال، جاري إعادة المحاولة والاستئناف تلقائياً... (${retries})`,
                },
              });
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }
        
        if (!transcriber) {
          throw lastError || new Error("فشل تحميل النموذج بعد عدة محاولات");
        }
      }

      self.postMessage({
        type: "ready",
        id,
        payload: {
          status: "ready",
          progress: 100,
          message: "نموذج التفريغ المحلي (Whisper) مثبت ومحفوظ محلياً وجاهز للعمل أوفلاين!",
        },
      });
    } catch (err: any) {
      console.error("[WhisperWorker] Preload error:", err);
      self.postMessage({
        type: "error",
        id,
        error: err?.message || "فشل تحميل نموذج Whisper",
      });
    }
  } else if (type === "transcribe") {
    try {
      const { float32Data, duration } = payload || {};
      if (!float32Data) {
        throw new Error("لم يتم تمرير البيانات الصوتية للمعالجة");
      }

      if (!transcriber) {
        self.postMessage({
          type: "progress",
          id,
          payload: {
            status: "loading",
            message: "جاري استدعاء نموذج التفريغ من الذاكرة المحلية...",
          },
        });
        transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
          dtype: {
            encoder_model: "fp32",
            decoder_model_merged: "q4",
          },
        });
      }

      self.postMessage({
        type: "progress",
        id,
        payload: {
          status: "transcribing",
          message: `جاري تحليل الصوت وتفريغه محلياً (${Math.round(duration || 0)} ثانية)...`,
        },
      });

      const output = await transcriber(float32Data, {
        language: "arabic",
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      });

      const text = (typeof output === "string" ? output : output?.text || "").trim();

      self.postMessage({
        type: "transcribed",
        id,
        payload: {
          text,
          duration,
        },
      });
    } catch (err: any) {
      console.error("[WhisperWorker] Transcribe error:", err);
      self.postMessage({
        type: "error",
        id,
        error: err?.message || "حدث خطأ أثناء التفريغ الصوتي المحلي",
      });
    }
  }
});
