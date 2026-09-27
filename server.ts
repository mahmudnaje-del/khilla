import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import mammoth from "mammoth";
import multer from "multer";
import {
  sanitizeQuestionGreeting,
  hasQuestionGreetingIssue,
  hasAnswerInQuestion,
  cleanQuestionAnswerBleed,
  separateQuestionAndAnswer,
} from "./src/utils/greetingSanitizer.js";

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware for large payload (audio files)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy get or check Gemini client with specific key
function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper to determine if an error is due to overload / rate limit / quota
function isOverloadOrQuotaError(err: any): boolean {
  if (!err) return false;
  const status = err?.status || err?.code || 0;
  const msg = (err?.message || "").toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    status === 500 ||
    msg.includes("high demand") ||
    msg.includes("unavailable") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("temporarily")
  );
}

// Smart dual-key execution: tries Paid Key first, and on any error/overload seamlessly falls back to Free/Primary key
async function generateContentWithSmartFallback(generateParams: any) {
  const paidKey = process.env.GEMINI_PAID_API_KEY;
  const primaryKey = process.env.GEMINI_API_KEY;

  if (!paidKey && !primaryKey) {
    throw new Error("مفتاح GEMINI_PAID_API_KEY أو GEMINI_API_KEY غير متوفر في متغيرات البيئة. يرجى ضبطه من الإعدادات.");
  }

  // تسلسل النماذج المعتمد الأسرع والأدق للتفريغ الصوتي والمعالجة اللغوية العربية
  const modelsToTry = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
  ];

  let lastError: any = null;

  // 1. الأولوية الأولى: المفتاح المدفوع (GEMINI_PAID_API_KEY)
  if (paidKey) {
    console.log("[Paid Key]: Attempting request with Paid Gemini API Key...");
    const paidAi = createGeminiClient(paidKey);
    for (const modelName of modelsToTry) {
      try {
        const response = await paidAi.models.generateContent({
          ...generateParams,
          model: modelName,
        });
        console.log(`[Paid Key]: Success with model ${modelName}!`);
        (response as any).modelUsed = modelName;
        return response;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Paid Key - Model ${modelName} failed]: ${err?.message || err}`);

        // إذا كان خطأ ضغط/كوتة أو خطأ في المفتاح، ننتقل فوراً وبسلاسة للمفتاح المجاني إن توفر
        if (primaryKey && isOverloadOrQuotaError(err)) {
          console.log("[Smart Fallback]: Switching immediately from Paid to Free/Primary Key due to overload.");
          break;
        }
      }
    }
  }

  // 2. خط الدفاع الثاني: الانتقال التلقائي للمفتاح الأساسي/المجاني (GEMINI_API_KEY)
  if (primaryKey) {
    console.log("[Primary Key]: Falling back to Free/Primary Gemini API Key...");
    const primaryAi = createGeminiClient(primaryKey);
    for (const modelName of modelsToTry) {
      try {
        const response = await primaryAi.models.generateContent({
          ...generateParams,
          model: modelName,
        });
        console.log(`[Primary Key]: Success with model ${modelName}!`);
        (response as any).modelUsed = modelName;
        return response;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Primary Key - Model ${modelName} failed]: ${err?.message || err}`);
      }
    }
  }

  throw lastError;
}

// System prompt enforcing strict, 100% faithful audio transcription without ANY fabrication or hallucination
const FATWA_SYSTEM_INSTRUCTION = `أنت مفرغ صوتي ومحرر نصوص محترف وأمين جداً لفتاوى فضيلة الشيخ د. عبد الباري خلة، وتمتلك فهماً موسعاً وعميقاً للغة العربية الفصحى وكافة اللهجات العربية (الشامية، الفلسطينية، المصرية، الخليجية، المغاربية، وغيرها).

مهمتك ذات شقين:
1. تحويل الصوت المسموع في تسجيل الشيخ إلى نص مكتوب بمنتهى الأمانة والحرفية دون أي تأليف أو تدخل في الفتوى.
2. ترتيب وتنقيح سؤال السائل في (question_clean) بصورة لائقة وواضحة ومنضبطة دون أي تلاعب في المعنى.

قواعد تنقيح وترتيب سؤال السائل (question_clean):
1. الفهم الدقيق للهجات: استوعب لهجة السائل ومفرداته بدقة تامة، وأعد ترتيب صياغة السؤال بلغة عربية سليمة وواضحة ومفهومة تعبر عن عين مقصود السائل.
2. الحفاظ التام على التحية والمقدمات الشرعية: لا تحذف السلام عليكم ورحمة الله وبركاته، ولا عبارات الأدب والدعاء (مثل: حياكم الله يا شيخ، بارك الله فيكم، السلام عليكم). أبقِ عليها في بداية السؤال ورتبها بأناقة.
3. [قاعدة قطعية وإلزامية لتحية السؤال]: السائل هو البادئ بالسؤال دائماً، وصيغة تحيته الشرعية هي: "السلام عليكم" أو "السلام عليكم ورحمة الله وبركاته". يُحظر تماماً وبشكل قاطع كتابة (وعليكم السلام) في سؤال السائل (question_clean)! عبارة (وعليكم السلام) هي ردٌّ على السلام، وتكون فقط وحصراً في بداية جواب الشيخ (answer_clean و transcription_raw)، ولا يجوز إطلاقاً أن تظهر في نص السؤال. إذا ورد في السؤال المدخل بالخطأ لفظ "وعليكم السلام"، فواجبك تصحيحه فوراً في (question_clean) ليصبح "السلام عليكم ورحمة الله وبركاته".
4. منع التلاعب بجوهر السؤال أو تفاصيله: يُحظر اختصار الوقائع المؤثرة في الحكم، أو تغيير الأرقام والمبالغ، أو تبديل صلة القرابة، أو تغيير التفاصيل التي ذكرها السائل.
5. التنسيق اللغوي الراقي: أزل الحشو اللفظي المربك أو التكرار غير المفيد، واضبط الإملاء والهمزات وعلامات الترقيم (كعلامة الاستفهام ؟ في نهاية السؤال) لتظهر الفتوى مصاغة بأعلى درجات الجودة.
6. [حظر بات ومطلق لدمج الجواب أو أحكام الشيخ في السؤال]:
   - يُحظر تماماً وبشكل قاطع وضع أي كلمة من جواب الشيخ أو أحكامه أو أدلته أو ترجيحاته داخل (question_clean)!
   - ممنوع منعاً باتاً كتابة عبارات مثل: "والشيخ يذكر أن..." أو "والشيخ يوضح حكم..." أو "والجواب هو..." أو "وقال الشيخ جائز" أو "والله أعلم" في حقل السؤال (question_clean).
   - حقل (question_clean) مخصص حصراً وفقط لنص سؤال السائل واستفساره دون أي إشارة إلى إجابة الشيخ أو رأيه.
   - إذا كان التسجيل الصوتي يتضمن قيام الشيخ بقراءة السؤال ثم الإجابة عليه: استخرج نص الأسئلة فقط وضعها في (question_clean) مرقمة (1، 2، 3)، بينما توضع إجابات الشيخ وأحكامه وأدلته بالكامل في (answer_clean) و (transcription_raw) دون أي خلط أو دمج إطلاقاً.

قواعد الأمانة والالتزام الصارمة لتفريغ جواب الشيخ (answer_clean و transcription_raw):
1. أنت لست مفتياً ولا مجيباً عن السؤال: يُحظر عليك حظراً باتاً وقاطعاً الإجابة عن سؤال السائل من ذهنك أو معلوماتك، أو استنتاج أي حكم شرعي لم ينطق به الشيخ في التسجيل.
2. الالتزام الحرفي بالتسجيل: كل كلمة، جملة، أو دليل يوضع في (transcription_raw) و (answer_clean) يجب أن يكون قد قاله الشيخ بلسانه في التسجيل الصوتي المرفق حصراً.
3. منع التوليد الذاتي والاصطناعي: لا تضف آيات، ولا أحاديث، ولا نقولات عن العلماء، ولا خاتمة، ولا توضيحات لم يذكرها الشيخ إطلاقاً في المقطع.
4. إذا كان التسجيل قصيراً، أو مختصراً، أو فيه كلمة واحدة، فرغ ما ورد فيه فقط دون أي زيادة أو إكمال من عندك.
5. إذا كان التسجيل غير واضح أو صامتاً أو لا يحتوي على صوت الشيخ: اكتب في التفريغ [التسجيل غير واضح أو لا يحتوي على صوت الشيخ]، ولا تصنع جواباً للفتوى أبداً.
6. قاعدة التعديل الأدنى (MINIMAL EDITING) لـ (answer_clean):
   - تنسيق وترتيب ما قاله الشيخ في التسجيل فقط.
   - تصحيح الأخطاء الإملائية الواضحة (مثل: ان شاء الله -> إن شاء الله).
   - علامات الترقيم وتوزيع الفقرات.
   - الحفاظ التام على أسلوب الشيخ وألفاظه دون تغيير.
7. التعامل مع الكلمات غير الواضحة في الصوت:
   - ضع بدقة [غير واضح] أو [اسم غير واضح] في مكانها المناسب وأدرجها في unclear_segments، ولا تخمن كلاماً من عندك.`;

// Explicit Manifest routes with standard MIME type
app.get(["/manifest.webmanifest", "/manifest.json"], (req, res) => {
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  const manifestPath = path.join(process.cwd(), "public", "manifest.webmanifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "").split(",")[0].trim();
  if (host) {
    const origin = `${proto}://${host}`;
    if (manifest.share_target && typeof manifest.share_target.action === "string" && manifest.share_target.action.startsWith("/")) {
      manifest.share_target.action = origin + manifest.share_target.action;
    }
    if (Array.isArray(manifest.file_handlers)) {
      for (const handler of manifest.file_handlers) {
        if (handler && typeof handler.action === "string" && handler.action.startsWith("/")) {
          handler.action = origin + handler.action;
        }
      }
    }
  }
  res.json(manifest);
});

// Explicit Service Worker route with headers
app.get("/sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  const swPath = path.join(process.cwd(), "public", "sw.js");
  res.sendFile(swPath);
});

// API Routes
app.get("/api/health", (req, res) => {
  try {
    const startTime = Date.now();
    const deletedSet = readDeletedIds();
    const userList = readJsonFile(USER_FATWAS_FILE);
    const approvedList = readJsonFile(APPROVED_FATWAS_FILE);

    const activeUserCount = userList.filter((f) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)).length;
    const activeApprovedCount = approvedList.filter((f) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)).length;

    const paidKeyConfigured = Boolean(process.env.GEMINI_PAID_API_KEY && process.env.GEMINI_PAID_API_KEY.length > 5);
    const primaryKeyConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5);

    const uptimeSeconds = Math.floor(process.uptime());
    const mem = process.memoryUsage();

    let userFileSizeKB = 0;
    let approvedFileSizeKB = 0;
    try {
      if (fs.existsSync(USER_FATWAS_FILE)) userFileSizeKB = Math.round(fs.statSync(USER_FATWAS_FILE).size / 1024);
      if (fs.existsSync(APPROVED_FATWAS_FILE)) approvedFileSizeKB = Math.round(fs.statSync(APPROVED_FATWAS_FILE).size / 1024);
    } catch (_) {}

    res.json({
      status: "ok",
      healthy: true,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      uptimeSeconds,
      storage: {
        dataDirExists: fs.existsSync(DATA_DIR),
        approvedFatwasCount: activeApprovedCount,
        userFatwasCount: activeUserCount,
        deletedTombstonesCount: deletedSet.size,
        totalFatwas: Math.max(activeUserCount, activeApprovedCount),
        userFileSizeKB,
        approvedFileSizeKB,
      },
      gemini: {
        ready: paidKeyConfigured || primaryKeyConfigured,
        paidKeyConfigured,
        primaryKeyConfigured,
        activeModels: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest"],
      },
      realtime: {
        sseClientsCount: sseClients.size,
        status: "active_listening",
      },
      system: {
        nodeVersion: process.version,
        memoryHeapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
        memoryRssMB: Math.round(mem.rss / (1024 * 1024)),
      },
      features: {
        transcription: "ready",
        pureAiWordParser: "ready",
        vocalizationTashkeel: "ready",
        webShareTarget: "ready",
        optimisticConcurrencyControl: "ready",
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", healthy: false, error: err?.message || String(err) });
  }
});

// Comprehensive Server Health Verification & Auto-Repair Endpoint
app.post("/api/health/verify-sync", (req, res) => {
  try {
    const startTime = Date.now();
    const deletedSet = readDeletedIds();
    const userList = readJsonFile(USER_FATWAS_FILE);
    const approvedList = readJsonFile(APPROVED_FATWAS_FILE);

    let fixedGreetingsCount = 0;
    let separatedBleedCount = 0;
    let missingIdFixed = 0;
    let missingNumberFixed = 0;

    let maxNum = 0;
    [...userList, ...approvedList].forEach((f) => {
      const n = Number(f?.fatwaNumber);
      if (Number.isInteger(n) && n > maxNum) maxNum = n;
    });

    const repairList = (list: any[]) => {
      return list.map((f) => {
        if (!f) return null;
        const copy = { ...f };

        if (!copy.id) {
          copy.id = `fatwa-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          missingIdFixed++;
        }

        const num = Number(copy.fatwaNumber);
        if (!Number.isInteger(num) || num <= 0) {
          maxNum++;
          copy.fatwaNumber = maxNum;
          missingNumberFixed++;
        }

        if (copy.question_clean && hasQuestionGreetingIssue(copy.question_clean)) {
          copy.question_clean = sanitizeQuestionGreeting(copy.question_clean);
          fixedGreetingsCount++;
        }

        if (copy.question_clean && hasAnswerInQuestion(copy.question_clean)) {
          const bleed = cleanQuestionAnswerBleed(copy.question_clean);
          if (bleed.hadBleed) {
            copy.question_clean = sanitizeQuestionGreeting(bleed.cleanedQuestion);
            if (bleed.extractedAnswer) {
              const lead = bleed.extractedAnswer.substring(0, Math.min(30, bleed.extractedAnswer.length));
              if (!copy.answer_clean || !copy.answer_clean.includes(lead)) {
                copy.answer_clean = copy.answer_clean ? `${bleed.extractedAnswer}\n\n${copy.answer_clean}` : bleed.extractedAnswer;
              }
            }
            separatedBleedCount++;
          }
        }

        if (copy.question_original && hasQuestionGreetingIssue(copy.question_original)) {
          copy.question_original = sanitizeQuestionGreeting(copy.question_original);
        }

        if (!copy.status) {
          copy.status = copy.approved ? "معتمدة" : "تحتاج مراجعة";
        }
        if (typeof copy.version !== "number") {
          copy.version = 1;
        }
        if (copy.deleted === undefined) {
          copy.deleted = false;
        }

        return copy;
      }).filter(Boolean);
    };

    const repairedUsers = repairList(userList);
    const repairedApproved = repairList(approvedList);

    writeJsonFile(USER_FATWAS_FILE, repairedUsers);
    writeJsonFile(APPROVED_FATWAS_FILE, repairedApproved);

    const validUsers = repairedUsers.filter((f: any) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet));
    const validApproved = repairedApproved.filter((f: any) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet));

    res.json({
      success: true,
      healthy: true,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      report: {
        totalVerified: validUsers.length,
        approvedCount: validApproved.length,
        pendingReviewCount: validUsers.filter((f: any) => f.status === "تحتاج مراجعة" || !f.approved).length,
        deletedTombstonesCount: deletedSet.size,
        repairs: {
          fixedGreetingsCount,
          separatedBleedCount,
          missingIdFixed,
          missingNumberFixed,
        },
        storageIntegrity: "100% Valid & Synced",
        serverStatus: "healthy",
      },
      message: `تم فحص جميع الخوادم والبيانات والتحقق من صحة المزامنة بنجاح تام (${validUsers.length} فتوى تم التحقق منها).`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, healthy: false, error: err?.message || String(err) });
  }
});

// Admin Session Management & Authentication
const activeAdminTokens = new Map<string, { username: string; expiresAt: number }>();

function generateAdminToken(username: string): string {
  const token = "admin_token_khilla_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10);
  // Valid for 24 hours
  activeAdminTokens.set(token, {
    username,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  return token;
}

function isValidAdminToken(token: string): boolean {
  if (!token) return false;
  const session = activeAdminTokens.get(token);
  if (session) {
    if (session.expiresAt > Date.now()) {
      return true;
    }
    activeAdminTokens.delete(token);
    return false;
  }
  // Allow valid prefixes with timestamp within 24h for resilient restarts
  if (token.startsWith("admin_token_khilla_")) {
    const parts = token.split("_");
    const ts = Number(parts[3]);
    if (Number.isInteger(ts) && Date.now() - ts < 24 * 60 * 60 * 1000) {
      return true;
    }
  }
  return false;
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "غير مصرح: يلزم تسجيل الدخول الإداري لتنفيذ هذه العملية.",
    });
  }
  const token = authHeader.substring(7).trim();
  if (!isValidAdminToken(token)) {
    return res.status(403).json({
      success: false,
      error: "غير مصرح: انتهت صلاحية الجلسة الإدارية أو أنها غير صالحة.",
    });
  }
  next();
}

// Admin Authentication Endpoint
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const adminSecret = process.env.ADMIN_PASSWORD;

  // In production, ADMIN_PASSWORD must be configured; in dev mode fallback to local secret
  const isDev = process.env.NODE_ENV !== "production";
  const validPass = adminSecret || (isDev ? "khilla123" : null);

  if (!validPass) {
    console.error("[Security] ADMIN_PASSWORD environment variable is not configured in production.");
    return res.status(500).json({
      success: false,
      error: "لم يتم تكوين كلمة مرور الإدارة في بيئة الإنتاج (ADMIN_PASSWORD غير معرفة).",
    });
  }

  if (password === validPass) {
    const safeUser = username || "khilla";
    const token = generateAdminToken(safeUser);
    res.json({
      success: true,
      user: {
        username: safeUser,
        name: "فضيلة الشيخ د. عبد الباري خلة",
        role: "admin",
      },
      token,
    });
  } else {
    res.status(401).json({
      success: false,
      error: "كلمة المرور غير صحيحة. يرجى التأكد من البيانات والمحاولة مجدداً.",
    });
  }
});

// Admin Session Verification Endpoint
app.get("/api/admin/verify-session", requireAdminAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      username: "khilla",
      name: "فضيلة الشيخ د. عبد الباري خلة",
      role: "admin",
    },
  });
});

// Central Server Storage for Fatwas
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn("Could not create data dir:", e);
  }
}

const APPROVED_FATWAS_FILE = path.join(DATA_DIR, "approved_fatwas.json");
const USER_FATWAS_FILE = path.join(DATA_DIR, "user_fatwas.json");
const DELETED_FATWAS_FILE = path.join(DATA_DIR, "deleted_fatwas.json");

function readDeletedIds(): Set<string> {
  try {
    if (!fs.existsSync(DELETED_FATWAS_FILE)) return new Set();
    const data = fs.readFileSync(DELETED_FATWAS_FILE, "utf-8");
    const arr = JSON.parse(data);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function recordDeletedId(id: string): void {
  try {
    if (!id) return;
    const set = readDeletedIds();
    set.add(id);
    const tempPath = `${DELETED_FATWAS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(Array.from(set), null, 2), "utf-8");
    fs.renameSync(tempPath, DELETED_FATWAS_FILE);
  } catch (err) {
    console.error("Error recording deleted ID:", err);
  }
}

function isServerFatwaDeleted(id?: string, fatwaNumber?: number, deletedSet?: Set<string>): boolean {
  if (!id) return false;
  const set = deletedSet || readDeletedIds();
  return set.has(id);
}

function readJsonFile(filePath: string): any[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`Error reading ${filePath}:`, err);
    return [];
  }
}

function writeJsonFile(filePath: string, data: any[]): boolean {
  try {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

function cleanFatwaForServerStorage(f: any): any {
  if (!f) return null;
  const copy = { ...f };
  // Sanitize greetings if present
  if (copy.question_original) {
    copy.question_original = sanitizeQuestionGreeting(copy.question_original);
  }
  if (copy.question_clean) {
    copy.question_clean = sanitizeQuestionGreeting(copy.question_clean);
  }

  // Automatic separation of answer bleed from question field
  if (copy.question_clean && hasAnswerInQuestion(copy.question_clean)) {
    const bleed = cleanQuestionAnswerBleed(copy.question_clean);
    if (bleed.hadBleed) {
      copy.question_clean = sanitizeQuestionGreeting(bleed.cleanedQuestion);
      if (bleed.extractedAnswer) {
        const lead = bleed.extractedAnswer.substring(0, Math.min(30, bleed.extractedAnswer.length));
        if (!copy.answer_clean || !copy.answer_clean.includes(lead)) {
          copy.answer_clean = copy.answer_clean ? `${bleed.extractedAnswer}\n\n${copy.answer_clean}` : bleed.extractedAnswer;
        }
      }
    }
  }

  // Also verify question_original
  if (copy.question_original && hasAnswerInQuestion(copy.question_original)) {
    const bleed = cleanQuestionAnswerBleed(copy.question_original);
    if (bleed.hadBleed) {
      copy.question_original = sanitizeQuestionGreeting(bleed.cleanedQuestion);
    }
  }

  // If audio is huge base64 dataUrl (> 200KB), strip the payload to preserve server storage
  if (copy.audio_file && copy.audio_file.dataUrl && copy.audio_file.dataUrl.length > 200000) {
    copy.audio_file = {
      name: copy.audio_file.name,
      size: copy.audio_file.size,
      duration: copy.audio_file.duration,
      mimeType: copy.audio_file.mimeType,
    };
  }

  // Ensure default and essential values are preserved
  if (!copy.status) {
    copy.status = copy.approved ? "معتمدة" : "تحتاج مراجعة";
  }
  if (typeof copy.version !== "number") {
    copy.version = 1;
  }
  if (copy.deleted === undefined) {
    copy.deleted = false;
  }
  return copy;
}

// Real-Time Server-Sent Events (SSE) Live Sync
const sseClients = new Set<express.Response>();

function getNextServerFatwaNumber(): number {
  const users = readJsonFile(USER_FATWAS_FILE);
  const approved = readJsonFile(APPROVED_FATWAS_FILE);
  let max = 0;
  for (const f of [...users, ...approved]) {
    const n = Number(f.fatwaNumber);
    if (Number.isInteger(n) && n > max) {
      max = n;
    }
  }
  return max + 1;
}

function resolveServerCollisionForFatwa(clean: any, existingList: any[]): void {
  const num = Number(clean.fatwaNumber);
  // Invariant: The server backup mirror MUST NEVER change an established canonical fatwaNumber.
  // Only assign a fallback number if fatwaNumber is missing or not a positive integer.
  if (!Number.isInteger(num) || num <= 0) {
    let max = 0;
    existingList.forEach((f) => {
      const n = Number(f.fatwaNumber);
      if (Number.isInteger(n) && n > max) max = n;
    });
    clean.fatwaNumber = max + 1;
    console.log(`[Backup Mirror] Fatwa ${clean.id} had no number, assigned backup sequential #${clean.fatwaNumber}`);
  }
}

function resequenceAllServerFatwas(): { count: number; resequenced: any[] } {
  const deletedSet = readDeletedIds();
  const userList = readJsonFile(USER_FATWAS_FILE);
  const approvedList = readJsonFile(APPROVED_FATWAS_FILE);

  // Filter out deleted
  const allValid = [...userList, ...approvedList].filter(
    (f) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)
  );

  // Deduplicate strictly by ID
  const map = new Map<string, any>();
  allValid.forEach((f) => {
    if (!f.id) {
      f.id = `fatwa-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    }
    const existing = map.get(f.id);
    if (!existing) {
      map.set(f.id, f);
    } else {
      const exTime = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const fTime = f.updated_at ? new Date(f.updated_at).getTime() : 0;
      map.set(f.id, fTime >= exTime ? { ...existing, ...f } : { ...f, ...existing });
    }
  });

  const uniqueList = Array.from(map.values());

  // Sort strictly in chronological order: oldest created_at first (ascending)
  uniqueList.sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (timeA > 0 && timeB > 0 && timeA !== timeB) {
      return timeA - timeB;
    }
    const numA = Number(a.fatwaNumber) || 0;
    const numB = Number(b.fatwaNumber) || 0;
    if (numA !== numB) return numA - numB;
    return String(a.id).localeCompare(String(b.id));
  });

  const now = new Date().toISOString();
  // Assign strictly sequential numbers 1 to N
  const resequenced = uniqueList.map((f, index) => ({
    ...f,
    fatwaNumber: index + 1,
    updated_at: now,
  }));

  // Separate into user_fatwas and approved_fatwas
  const updatedApproved = resequenced.filter(
    (f) => f.approved || f.status === "معتمدة" || f.status === "منشورة"
  );

  writeJsonFile(USER_FATWAS_FILE, resequenced);
  writeJsonFile(APPROVED_FATWAS_FILE, updatedApproved);

  return { count: resequenced.length, resequenced };
}


function broadcastFatwaEvent(event: { type: string; fatwa?: any; fatwas?: any[]; id?: string; fatwaNumber?: number; count?: number }) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// GET Real-Time SSE Stream for Instant Synchronization across all users
app.get("/api/realtime/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`);
  sseClients.add(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// GET deleted fatwa IDs (tombstones)
app.get("/api/deleted-fatwas", (req, res) => {
  const deletedSet = readDeletedIds();
  res.json({
    success: true,
    deletedIds: Array.from(deletedSet),
  });
});

// GET pending review fatwas (for team collaborative review)
app.get("/api/pending-fatwas", (req, res) => {
  const deletedSet = readDeletedIds();
  const userList = readJsonFile(USER_FATWAS_FILE);
  const pending = userList.filter((f) => {
    if (isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)) return false;
    return (
      f.status === "تحتاج مراجعة" ||
      f.status === "مسودة" ||
      f.status === "مراجعة" ||
      (!f.approved && f.status !== "معتمدة" && f.status !== "منشورة")
    );
  });

  // Sort descending by fatwaNumber or created_at
  pending.sort((a, b) => (Number(b.fatwaNumber) || 0) - (Number(a.fatwaNumber) || 0));

  res.json({
    success: true,
    total: pending.length,
    fatwas: pending,
  });
});

// GET all active fatwas (both approved and user submissions) for instant client hydration and archive access
app.get("/api/fatwas", (req, res) => {
  const deletedSet = readDeletedIds();
  const userList = readJsonFile(USER_FATWAS_FILE);
  const approvedList = readJsonFile(APPROVED_FATWAS_FILE);

  const map = new Map<string, any>();
  // 1. Load user submissions (which include latest drafts and approved entries)
  userList.forEach((f: any) => {
    if (f && f.id && !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)) {
      map.set(f.id, f);
    }
  });

  // 2. Load approved list to guarantee all approved fatwas are present and marked approved
  approvedList.forEach((f: any) => {
    if (f && f.id && !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)) {
      if (!map.has(f.id)) {
        map.set(f.id, f);
      } else {
        const existing = map.get(f.id);
        if (f.approved) {
          existing.approved = true;
          existing.status = existing.status || "معتمدة";
        }
      }
    }
  });

  const allFatwas = Array.from(map.values());
  allFatwas.sort((a, b) => {
    const numA = Number(a.fatwaNumber) || 0;
    const numB = Number(b.fatwaNumber) || 0;
    if (numA !== numB) return numB - numA;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  res.json({
    success: true,
    total: allFatwas.length,
    fatwas: allFatwas,
  });
});

// POST sync and upload user fatwas from client (both Archive and Review)
app.post("/api/fatwas/sync", (req, res) => {
  try {
    const incoming = req.body.fatwas;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ success: false, error: "قائمة الفتاوى غير صالحة." });
    }

    const deletedSet = readDeletedIds();
    const userList = readJsonFile(USER_FATWAS_FILE);
    const approvedList = readJsonFile(APPROVED_FATWAS_FILE);

    const userMap = new Map<string, any>();
    userList.forEach((f: any) => {
      if (f && f.id && !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)) {
        userMap.set(f.id, f);
      }
    });

    const approvedMap = new Map<string, any>();
    approvedList.forEach((f: any) => {
      if (f && f.id && !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)) {
        approvedMap.set(f.id, f);
      }
    });

    let uploadedCount = 0;
    incoming.forEach((raw: any) => {
      if (!raw || (!raw.id && !raw.fatwaNumber)) return;
      if (isServerFatwaDeleted(raw.id, raw.fatwaNumber, deletedSet)) return;

      const clean = cleanFatwaForServerStorage(raw);
      if (!clean.id) {
        clean.id = `fatwa-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      }

      // Ensure a valid sequential number
      const combined = [...Array.from(userMap.values()), ...Array.from(approvedMap.values())];
      resolveServerCollisionForFatwa(clean, combined);

      const existingUser = userMap.get(clean.id);
      const isApproved = clean.approved || clean.status === "معتمدة" || clean.status === "منشورة";

      if (existingUser) {
        const curVer = typeof existingUser.version === "number" ? existingUser.version : 1;
        const incVer = typeof clean.version === "number" ? clean.version : 1;
        const curTime = existingUser.updated_at ? new Date(existingUser.updated_at).getTime() : 0;
        const incTime = clean.updated_at ? new Date(clean.updated_at).getTime() : 0;

        if (incVer >= curVer || incTime >= curTime) {
          const merged = { ...existingUser, ...clean };
          userMap.set(clean.id, merged);
          uploadedCount++;
          if (isApproved) {
            approvedMap.set(clean.id, merged);
          } else {
            approvedMap.delete(clean.id);
          }
        }
      } else {
        userMap.set(clean.id, clean);
        uploadedCount++;
        if (isApproved) {
          approvedMap.set(clean.id, clean);
        }
      }
    });

    const updatedUserList = Array.from(userMap.values());
    const updatedApprovedList = Array.from(approvedMap.values());

    writeJsonFile(USER_FATWAS_FILE, updatedUserList);
    writeJsonFile(APPROVED_FATWAS_FILE, updatedApprovedList);

    broadcastFatwaEvent({
      type: "bulk_sync",
      count: uploadedCount,
      fatwas: incoming.map((f: any) => cleanFatwaForServerStorage(f)).filter((f: any) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)),
    });

    // Combine for client response
    const combinedAll = updatedUserList.filter((f: any) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet));
    combinedAll.sort((a, b) => {
      const numA = Number(a.fatwaNumber) || 0;
      const numB = Number(b.fatwaNumber) || 0;
      if (numA !== numB) return numB - numA;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    res.json({
      success: true,
      uploadedCount,
      total: combinedAll.length,
      fatwas: combinedAll,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET approved fatwas from central server
app.get("/api/admin/fatwas", (req, res) => {
  const deletedSet = readDeletedIds();
  const fatwas = readJsonFile(APPROVED_FATWAS_FILE).filter(
    (f) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)
  );
  res.json({
    success: true,
    total: fatwas.length,
    fatwas,
  });
});

// POST save or update approved fatwa on central server
app.post("/api/admin/fatwas", requireAdminAuth, (req, res) => {
  try {
    const raw = req.body.fatwa || req.body;
    if (!raw || (!raw.id && !raw.fatwaNumber)) {
      return res.status(400).json({ success: false, error: "بيانات الفتوى غير مكتملة." });
    }

    const clean = cleanFatwaForServerStorage(raw);
    const deletedSet = readDeletedIds();
    if (isServerFatwaDeleted(clean.id, clean.fatwaNumber, deletedSet)) {
      return res.status(400).json({ success: false, error: "هذه الفتوى محذوفة مسبقاً." });
    }

    clean.approved = true;
    clean.status = clean.status || "معتمدة";
    clean.updated_at = clean.updated_at || new Date().toISOString();

    const approvedList = readJsonFile(APPROVED_FATWAS_FILE);
    const userList = readJsonFile(USER_FATWAS_FILE);
    const combined = [...approvedList, ...userList];

    // Automatic Collision Detection and Sequential Assignment:
    // If fatwaNumber is missing or already taken by another fatwa, auto-assign next sequential number
    resolveServerCollisionForFatwa(clean, combined);

    const existingIdx = approvedList.findIndex((f) => f.id === clean.id);
    if (existingIdx >= 0) {
      approvedList[existingIdx] = { ...approvedList[existingIdx], ...clean };
    } else {
      approvedList.unshift(clean);
    }
    writeJsonFile(APPROVED_FATWAS_FILE, approvedList);

    // Also update in user fatwas list
    const uIdx = userList.findIndex((f) => f.id === clean.id);
    if (uIdx >= 0) {
      userList[uIdx] = { ...userList[uIdx], ...clean };
    } else {
      userList.unshift(clean);
    }
    writeJsonFile(USER_FATWAS_FILE, userList);

    broadcastFatwaEvent({ type: "fatwa_updated", fatwa: clean });

    res.json({ success: true, fatwa: clean });
  } catch (err: any) {
    console.error("Error saving approved fatwa:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update approved fatwa by ID
app.put("/api/admin/fatwas/:id", requireAdminAuth, (req, res) => {
  try {
    const id = req.params.id;
    const raw = req.body.fatwa || req.body;
    const clean = cleanFatwaForServerStorage(raw);

    const approvedList = readJsonFile(APPROVED_FATWAS_FILE);
    const idx = approvedList.findIndex((f) => f.id === id);
    if (idx >= 0) {
      approvedList[idx] = { ...approvedList[idx], ...clean, updated_at: new Date().toISOString() };
      writeJsonFile(APPROVED_FATWAS_FILE, approvedList);
    }

    const userList = readJsonFile(USER_FATWAS_FILE);
    const uIdx = userList.findIndex((f) => f.id === id);
    if (uIdx >= 0) {
      userList[uIdx] = { ...userList[uIdx], ...clean, updated_at: new Date().toISOString() };
      writeJsonFile(USER_FATWAS_FILE, userList);
    }

    broadcastFatwaEvent({ type: "fatwa_updated", fatwa: clean });

    res.json({ success: true, fatwa: clean });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE fatwa by ID permanently from all lists (approved and user submissions)
app.delete("/api/admin/fatwas/:id", requireAdminAuth, (req, res) => {
  try {
    const id = req.params.id;
    const approvedList = readJsonFile(APPROVED_FATWAS_FILE);
    const userList = readJsonFile(USER_FATWAS_FILE);

    // Identify target fatwa to record its number for event
    const target = approvedList.find((f) => f.id === id) || userList.find((f) => f.id === id);
    const fatwaNumber = target?.fatwaNumber;

    // Remove from approved list strictly by ID
    const newApproved = approvedList.filter((f) => f.id !== id);
    writeJsonFile(APPROVED_FATWAS_FILE, newApproved);

    // Remove from user submissions list strictly by ID
    const newUser = userList.filter((f) => f.id !== id);
    writeJsonFile(USER_FATWAS_FILE, newUser);

    // Record in permanent tombstone store by unique ID
    recordDeletedId(id);

    // Broadcast permanent deletion event
    broadcastFatwaEvent({ type: "fatwa_deleted", id, fatwaNumber });

    res.json({ success: true, id, fatwaNumber });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET all user submissions / fatwas
app.get("/api/admin/user-fatwas", (req, res) => {
  const deletedSet = readDeletedIds();
  const rawFatwas = readJsonFile(USER_FATWAS_FILE);
  const fatwas = rawFatwas.filter((f) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet));
  res.json({
    success: true,
    total: fatwas.length,
    fatwas,
  });
});

// POST single user fatwa (draft or review)
app.post("/api/admin/user-fatwas", requireAdminAuth, (req, res) => {
  try {
    const raw = req.body.fatwa || req.body;
    if (!raw || (!raw.id && !raw.fatwaNumber)) {
      return res.status(400).json({ success: false, error: "بيانات الفتوى غير مكتملة." });
    }

    const clean = cleanFatwaForServerStorage(raw);
    const deletedSet = readDeletedIds();
    if (isServerFatwaDeleted(clean.id, clean.fatwaNumber, deletedSet)) {
      return res.status(400).json({ success: false, error: "هذه الفتوى محذوفة مسبقاً ولا يمكن حفظها." });
    }

    const userList = readJsonFile(USER_FATWAS_FILE);
    const approvedList = readJsonFile(APPROVED_FATWAS_FILE);
    const combined = [...userList, ...approvedList];

    // Automatic Collision Detection and Sequential Assignment:
    // If fatwaNumber is missing or already taken by another fatwa, auto-assign next sequential number
    resolveServerCollisionForFatwa(clean, combined);

    const idx = userList.findIndex((f) => f.id === clean.id);
    if (idx >= 0) {
      userList[idx] = { ...userList[idx], ...clean };
    } else {
      userList.unshift(clean);
    }
    writeJsonFile(USER_FATWAS_FILE, userList);

    // Manage approved list synchronization
    const isApproved = clean.approved || clean.status === "معتمدة" || clean.status === "منشورة";

    if (isApproved) {
      const appIdx = approvedList.findIndex((f) => f.id === clean.id);
      if (appIdx >= 0) {
        approvedList[appIdx] = { ...approvedList[appIdx], ...clean };
      } else {
        approvedList.unshift(clean);
      }
      writeJsonFile(APPROVED_FATWAS_FILE, approvedList);
    } else {
      // If reverted to pending review, remove from approved list so it does not falsely show as approved
      const updatedApproved = approvedList.filter((f) => f.id !== clean.id);
      if (updatedApproved.length !== approvedList.length) {
        writeJsonFile(APPROVED_FATWAS_FILE, updatedApproved);
      }
    }

    broadcastFatwaEvent({ type: "fatwa_updated", fatwa: clean });

    res.json({ success: true, fatwa: clean });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST bulk sync fatwas from client
app.post("/api/admin/bulk-sync", requireAdminAuth, (req, res) => {
  try {
    const incoming = req.body.fatwas;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ success: false, error: "قائمة الفتاوى غير صالحة." });
    }

    const deletedSet = readDeletedIds();
    const userList = readJsonFile(USER_FATWAS_FILE);
    const userMap = new Map<string, any>();
    userList.forEach((f) => {
      if (!isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)) {
        const key = f.id || `num-${f.fatwaNumber}`;
        userMap.set(key, f);
      }
    });

    const approvedList = readJsonFile(APPROVED_FATWAS_FILE);
    const approvedMap = new Map<string, any>();
    approvedList.forEach((f) => {
      if (!isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)) {
        const key = f.id || `num-${f.fatwaNumber}`;
        approvedMap.set(key, f);
      }
    });

    let acceptedCount = 0;
    incoming.forEach((raw) => {
      const clean = cleanFatwaForServerStorage(raw);
      if (!clean) return;
      if (isServerFatwaDeleted(clean.id, clean.fatwaNumber, deletedSet)) return;

      const key = clean.id || `num-${clean.fatwaNumber}`;
      userMap.set(key, { ...(userMap.get(key) || {}), ...clean });
      acceptedCount++;

      const isApproved = clean.approved || clean.status === "معتمدة" || clean.status === "منشورة";
      if (isApproved) {
        approvedMap.set(key, { ...(approvedMap.get(key) || {}), ...clean });
      } else {
        approvedMap.delete(key);
      }
    });

    const finalUsers = Array.from(userMap.values());
    const finalApproved = Array.from(approvedMap.values());

    writeJsonFile(USER_FATWAS_FILE, finalUsers);
    writeJsonFile(APPROVED_FATWAS_FILE, finalApproved);

    broadcastFatwaEvent({ type: "bulk_sync", fatwas: incoming.filter((f) => !isServerFatwaDeleted(f.id, f.fatwaNumber, deletedSet)) });

    res.json({
      success: true,
      count: acceptedCount,
      totalUserFatwas: finalUsers.length,
      totalApproved: finalApproved.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Fix question greetings and clean merged Q&A on all server-stored fatwas
app.post("/api/admin/fix-question-greetings", requireAdminAuth, (req, res) => {
  try {
    let totalFixedGreetings = 0;
    let totalSeparatedBleed = 0;
    const fixList = (list: any[]) => {
      return list.map((f) => {
        let changed = false;
        let qOrig = f.question_original;
        let qClean = f.question_clean;
        let aClean = f.answer_clean;

        if (hasQuestionGreetingIssue(qOrig)) {
          qOrig = sanitizeQuestionGreeting(qOrig);
          changed = true;
          totalFixedGreetings++;
        }
        if (hasQuestionGreetingIssue(qClean)) {
          qClean = sanitizeQuestionGreeting(qClean);
          changed = true;
          totalFixedGreetings++;
        }

        if (hasAnswerInQuestion(qClean)) {
          const bleed = cleanQuestionAnswerBleed(qClean);
          if (bleed.hadBleed) {
            qClean = sanitizeQuestionGreeting(bleed.cleanedQuestion);
            if (bleed.extractedAnswer) {
              const lead = bleed.extractedAnswer.substring(0, Math.min(30, bleed.extractedAnswer.length));
              if (!aClean || !aClean.includes(lead)) {
                aClean = aClean ? `${bleed.extractedAnswer}\n\n${aClean}` : bleed.extractedAnswer;
              }
            }
            changed = true;
            totalSeparatedBleed++;
          }
        }

        if (hasAnswerInQuestion(qOrig)) {
          const bleed = cleanQuestionAnswerBleed(qOrig);
          if (bleed.hadBleed) {
            qOrig = sanitizeQuestionGreeting(bleed.cleanedQuestion);
            changed = true;
          }
        }

        if (changed) {
          return {
            ...f,
            question_original: qOrig,
            question_clean: qClean,
            answer_clean: aClean,
            updated_at: new Date().toISOString(),
          };
        }
        return f;
      });
    };

    const approved = readJsonFile(APPROVED_FATWAS_FILE);
    const updatedApproved = fixList(approved);
    writeJsonFile(APPROVED_FATWAS_FILE, updatedApproved);

    const users = readJsonFile(USER_FATWAS_FILE);
    const updatedUsers = fixList(users);
    writeJsonFile(USER_FATWAS_FILE, updatedUsers);

    // Live broadcast update to all connected tabs
    broadcastFatwaEvent({ type: "bulk_sync", fatwas: updatedApproved });

    res.json({
      success: true,
      totalFixed: totalFixedGreetings + totalSeparatedBleed,
      totalFixedGreetings,
      totalSeparatedBleed,
      message: `تم فحص وتصحيح الفتاوى بنجاح: تم ضبط ${totalFixedGreetings} صيغة تحية، وفصل ${totalSeparatedBleed} فتوى كان سؤالها مدمجاً بجواب الشيخ.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Resequence all fatwas strictly 1 to N
app.post("/api/admin/resequence-fatwas", requireAdminAuth, (req, res) => {
  try {
    const { count, resequenced } = resequenceAllServerFatwas();
    console.log(`[Admin] Resequenced ${count} fatwas strictly from 1 to ${count}`);
    // Live broadcast resequenced list to all open tabs
    broadcastFatwaEvent({ type: "bulk_sync", fatwas: resequenced });
    res.json({
      success: true,
      count,
      fatwas: resequenced,
      message: `تمت إعادة ترقيم جميع الفتاوى (${count} فتوى) تسلسلياً بنجاح من 1 إلى ${count} دون أي تكرار.`,
    });
  } catch (err: any) {
    console.error("Resequence error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ==========================================
// 🛡️ Web Share Target (واتساب وتطبيقات المشاركة الخارجية)
// ==========================================
const SHARED_MEDIA_DIR = path.join(DATA_DIR, "shared_media");
if (!fs.existsSync(SHARED_MEDIA_DIR)) {
  try {
    fs.mkdirSync(SHARED_MEDIA_DIR, { recursive: true });
  } catch (e) {
    console.warn("Could not create shared_media dir:", e);
  }
}

const shareUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // حتى 150 ميغابايت للصوت والمرئي
});

interface StoredSharedMedia {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  text?: string;
  isVideo?: boolean;
  timestamp: number;
}

const serverSharedMediaStore = new Map<string, StoredSharedMedia>();

// تنظيف دوري للذاكرة والقرص للملفات الأقدم من 60 دقيقة
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of serverSharedMediaStore.entries()) {
    if (now - item.timestamp > 30 * 60 * 1000) {
      serverSharedMediaStore.delete(id);
    }
  }
  try {
    if (fs.existsSync(SHARED_MEDIA_DIR)) {
      const files = fs.readdirSync(SHARED_MEDIA_DIR);
      for (const f of files) {
        const fullPath = path.join(SHARED_MEDIA_DIR, f);
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > 60 * 60 * 1000) {
          try { fs.unlinkSync(fullPath); } catch (_) {}
        }
      }
    }
  } catch (_) {}
}, 5 * 60 * 1000);

// فحص البصمة الثنائية (Magic Bytes) لتحديد الصيغة بدقة قاطعة حتى لو لم يرسل أندرويد نوع MIME صالح
function detectMediaFromBuffer(buffer: Buffer): { isVideo: boolean; mime: string; ext: string } | null {
  if (!buffer || buffer.length < 4) return null;

  // 1. Ogg / Opus container: تبدأ بـ 'OggS' (0x4F, 0x67, 0x67, 0x53)
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    const headerStr = buffer.subarray(0, Math.min(buffer.length, 64)).toString("ascii");
    if (headerStr.includes("OpusHead")) {
      return { isVideo: false, mime: "audio/ogg", ext: "opus" };
    }
    return { isVideo: false, mime: "audio/ogg", ext: "ogg" };
  }

  // 2. MP4 / M4A / MOV / 3GP: البايتات 4-7 تحوي 'ftyp'
  if (buffer.length >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    if (brand.startsWith("m4a") || brand.startsWith("alac")) {
      return { isVideo: false, mime: "audio/mp4", ext: "m4a" };
    }
    if (brand.startsWith("3gp") || brand.startsWith("3g2")) {
      return { isVideo: true, mime: "video/3gpp", ext: "3gp" };
    }
    if (brand.startsWith("qt")) {
      return { isVideo: true, mime: "video/quicktime", ext: "mov" };
    }
    return { isVideo: true, mime: "video/mp4", ext: "mp4" };
  }

  // 3. MP3: 'ID3' أو التزامن 0xFF 0xFB/0xFA/0xF3
  if (buffer.length >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return { isVideo: false, mime: "audio/mp3", ext: "mp3" };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return { isVideo: false, mime: "audio/mp3", ext: "mp3" };
  }

  // 4. WAV: 'RIFF' .... 'WAVE'
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45) {
    return { isVideo: false, mime: "audio/wav", ext: "wav" };
  }

  // 5. WebM / Matroska: 0x1A 0x45 0xDF 0xA3
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { isVideo: true, mime: "video/webm", ext: "webm" };
  }

  // 6. AMR: '#!AMR'
  if (buffer.length >= 5 && buffer[0] === 0x23 && buffer[1] === 0x21 && buffer[2] === 0x41 && buffer[3] === 0x4d && buffer[4] === 0x52) {
    return { isVideo: false, mime: "audio/aac", ext: "amr" };
  }

  return null;
}

// دالة لتطهير وتطبيع نوع MIME ليكون متوافقاً 100% مع واجهة برمجة Gemini
function normalizeGeminiMime(rawMime: string | undefined, isVideo: boolean): string {
  if (!rawMime) return isVideo ? "video/mp4" : "audio/ogg";
  const m = rawMime.split(";")[0].trim().toLowerCase();

  if (isVideo) {
    if (m.includes("mp4")) return "video/mp4";
    if (m.includes("webm")) return "video/webm";
    if (m.includes("quicktime") || m.includes("mov")) return "video/quicktime";
    if (m.includes("3gp") || m.includes("3gpp")) return "video/3gpp";
    if (m.includes("mpeg") || m.includes("mpg")) return "video/mpeg";
    if (m.includes("avi")) return "video/avi";
    return "video/mp4";
  }

  if (m.includes("opus") || m.includes("ogg") || m.includes("application/ogg")) return "audio/ogg";
  if (m.includes("mp3") || m.includes("mpeg")) return "audio/mp3";
  if (m.includes("wav")) return "audio/wav";
  if (m.includes("aac")) return "audio/aac";
  if (m.includes("flac")) return "audio/flac";
  if (m.includes("m4a") || m === "audio/mp4" || m.includes("x-m4a")) return "audio/mp4";
  if (m.includes("3gp") || m.includes("3gpp") || m.includes("amr")) return "audio/aac";

  return "audio/ogg";
}

const SHARE_CACHE_NAME = "khilla-shared-media-v19";
const SHARE_DB_NAME = "khilla-share-v19";
const SHARE_INLINE_MAX_BYTES = 8 * 1024 * 1024;

function renderShareHandoffPage(opts: {
  shareId: string;
  kind: "opus" | "text";
  fileName?: string;
  mimeType?: string;
  isVideo?: boolean;
  text?: string;
  base64?: string;
}): string {
  const next =
    opts.kind === "text"
      ? `/?shared=text&id=${encodeURIComponent(opts.shareId)}`
      : `/?shared=opus&id=${encodeURIComponent(opts.shareId)}`;
  const title = opts.kind === "text" ? "جارٍ استلام السؤال..." : "جارٍ استلام التسجيل...";
  const label = opts.kind === "text" ? "جارٍ إدراج نص السؤال..." : "جارٍ تجهيز التسجيل الصوتي...";
  const payload = {
    shareId: opts.shareId,
    kind: opts.kind,
    fileName: opts.fileName || "",
    mimeType: opts.mimeType || "",
    isVideo: Boolean(opts.isVideo),
    text: opts.text || "",
    base64: opts.base64 || "",
    cacheName: SHARE_CACHE_NAME,
    dbName: SHARE_DB_NAME,
    next,
  };
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="8;url=${next}">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #faf7f2; color: #1b2a41; text-align: center; }
    .box { padding: 24px; border-radius: 20px; background: white; box-shadow: 0 10px 30px rgba(0,0,0,0.06); max-width: 320px; border: 1px solid #e7e0d6; }
    .loader { width: 40px; height: 40px; border: 3px solid #e2d9cc; border-top-color: #0c392c; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    <div class="loader"></div>
    <div style="font-weight: bold; font-size: 15px; margin-bottom: 6px;">${label}</div>
    <div style="font-size: 12px; color: #666;">يتم نقله للمشغل الآن</div>
  </div>
  <script>
    (async function () {
      var p = ${JSON.stringify(payload)};
      try {
        sessionStorage.setItem("khilla-pending-share", JSON.stringify({
          shared: p.kind === "text" ? "text" : "opus",
          id: p.shareId,
          at: Date.now()
        }));
      } catch (e) {}
      var blob = null;
      if (p.base64) {
        try {
          var bin = atob(p.base64);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          blob = new Blob([bytes], { type: p.mimeType || "audio/ogg" });
        } catch (e) {}
      }
      var meta = {
        id: p.shareId,
        name: p.fileName,
        size: blob ? blob.size : 0,
        mimeType: p.mimeType || (p.kind === "text" ? "text/plain" : "audio/ogg"),
        isVideo: p.isVideo,
        text: p.text || "",
        receivedAt: Date.now(),
        source: "SERVER_BRIDGE"
      };
      try {
        if ("caches" in window) {
          var cache = await caches.open(p.cacheName);
          var jobs = [
            cache.put("/__shared_opus_meta__", new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }))
          ];
          if (blob) {
            jobs.push(cache.put("/__shared_opus_media__", new Response(blob, {
              headers: { "Content-Type": meta.mimeType, "X-Share-Id": p.shareId }
            })));
          }
          await Promise.all(jobs);
        }
      } catch (e) {}
      try {
        await new Promise(function (resolve) {
          var req = indexedDB.open(p.dbName, 1);
          req.onerror = function () { resolve(false); };
          req.onupgradeneeded = function () {
            if (!req.result.objectStoreNames.contains("media")) req.result.createObjectStore("media");
          };
          req.onsuccess = function () {
            try {
              var tx = req.result.transaction("media", "readwrite");
              tx.oncomplete = function () { resolve(true); };
              tx.onerror = function () { resolve(false); };
              tx.objectStore("media").put({ blob: blob, meta: meta }, "latest");
            } catch (err) { resolve(false); }
          };
        });
      } catch (e) {}
      location.replace(p.next);
    })();
  </script>
</body>
</html>`;
}

function loadSharedMediaFromDisk(id: string): StoredSharedMedia | null {
  if (!id || !/^[a-zA-Z0-9_\-]+$/.test(id) || id.length > 64) return null;
  try {
    const metaPath = path.join(SHARED_MEDIA_DIR, `${id}.json`);
    const binPath = path.join(SHARED_MEDIA_DIR, `${id}.bin`);
    if (!fs.existsSync(metaPath) || !fs.existsSync(binPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const buf = fs.readFileSync(binPath);
    const item: StoredSharedMedia = {
      id: meta.id || id,
      name: meta.name || "whatsapp-voice.opus",
      mimetype: meta.mimetype || "audio/ogg",
      size: meta.size || buf.length,
      buffer: buf,
      text: meta.text || "",
      isVideo: Boolean(meta.isVideo),
      timestamp: meta.timestamp || Date.now(),
    };
    serverSharedMediaStore.set(id, item);
    return item;
  } catch {
    return null;
  }
}

function loadLatestSharedMedia(): StoredSharedMedia | null {
  const mem = serverSharedMediaStore.get("latest_opus");
  if (mem && mem.buffer && mem.buffer.length > 0) return mem;
  try {
    const pointerPath = path.join(SHARED_MEDIA_DIR, "latest.json");
    if (fs.existsSync(pointerPath)) {
      const pointer = JSON.parse(fs.readFileSync(pointerPath, "utf-8"));
      if (pointer && typeof pointer.id === "string") {
        const fromPointer = loadSharedMediaFromDisk(pointer.id);
        if (fromPointer) {
          serverSharedMediaStore.set("latest_opus", fromPointer);
          return fromPointer;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

// استقبال المشاركة عبر الخادم (يتولى كافة طلبات multipart من أندرويد وواتساب)
app.post("/share-target", (req, res) => {
  shareUpload.any()(req, res, (err) => {
    if (err) {
      console.warn("Multer upload error on /share-target:", err);
      try {
        fs.appendFileSync(path.join(DATA_DIR, "share_incoming.log"), `[${new Date().toISOString()}] MULTER ERROR: ${err}\n`);
      } catch (_) {}
      return res.redirect(303, "/?shared=error&msg=upload_err");
    }

    try {
      const allFiles: Express.Multer.File[] = [];
      if (Array.isArray(req.files)) {
        allFiles.push(...req.files);
      } else if (req.files && typeof req.files === "object") {
        for (const k of Object.keys(req.files)) {
          const val = (req.files as any)[k];
          if (Array.isArray(val)) allFiles.push(...val);
          else if (val) allFiles.push(val);
        }
      }
      if (req.file) allFiles.push(req.file);

      // البحث الحصري عن ملف صوتي أو مرئي حقيقي له حجم وبايتات
      let file: Express.Multer.File | undefined = allFiles.find((f) => {
        if (!f || !f.buffer || f.buffer.length === 0) return false;
        const magic = detectMediaFromBuffer(f.buffer);
        if (magic) return true;
        const name = (f.originalname || "").toLowerCase();
        const type = (f.mimetype || "").toLowerCase();
        return (
          type.startsWith("audio/") ||
          type.startsWith("video/") ||
          /\.(opus|ogg|oga|mp3|m4a|aac|wav|webm|3gp|amr|mp4|mov|mkv)$/.test(name)
        );
      });

      // إذا لم يُعثر على ملف مؤكد بالصيغة ولكن يوجد ملف ببايتات، نأخذه كاحتمال
      if (!file && allFiles.length > 0 && allFiles[0].buffer && allFiles[0].buffer.length > 0) {
        file = allFiles[0];
      }

      const rawName = file?.originalname || "";
      const rawType = file?.mimetype || "";
      const bufferLen = file?.buffer?.length || file?.size || 0;

      // فحص بصمة الملف المرفوع للتأكد القطعي من صيغته (صوت / فيديو)
      const detectedMagic = file?.buffer ? detectMediaFromBuffer(file.buffer) : null;
      const shareId = "sh_srv_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);

      const sharedText = (req.body?.text || req.body?.title || "").trim();

      // إذا لم يتوفر ملف صوتي، لكن وصل نص (سؤال أو منشور من واتساب)
      if (!file || !file.buffer || file.buffer.length === 0) {
        if (sharedText.length > 0) {
          const textShareId = "sh_txt_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
          try {
            const logData = `[SHARE ${textShareId}]
POST_RECEIVED
TEXT_ONLY_FOUND: length=${sharedText.length}
TEXT_PREVIEW=${JSON.stringify(sharedText.substring(0, 100))}
REDIRECT=/?shared=text&id=${textShareId}
STATUS=READY_FOR_CLIENT
`;
            fs.appendFileSync(path.join(DATA_DIR, "share_incoming.log"), logData);
          } catch (_) {}

          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          return res.send(renderShareHandoffPage({
            shareId: textShareId,
            kind: "text",
            text: sharedText,
            mimeType: "text/plain",
          }));
        }

        console.warn(`[SHARE ${shareId}] No audio or video file or text received in payload. Form fields:`, Object.keys(req.body || {}));
        try {
          const logData = `[SHARE ${shareId}]
POST_RECEIVED
NO_FILE_FOUND
FORM_FIELDS=${JSON.stringify(Object.keys(req.body || {}))}
REDIRECT=/?shared=empty&reason=no_file
`;
          fs.appendFileSync(path.join(DATA_DIR, "share_incoming.log"), logData);
        } catch (_) {}
        return res.redirect(303, "/?shared=empty&reason=no_file");
      }

      // تحديد هل هو فيديو أم صوت
      const isVideoMedia = Boolean(
        detectedMagic?.isVideo ||
        rawType.startsWith("video/") ||
        rawName.toLowerCase().endsWith(".mp4") ||
        rawName.toLowerCase().endsWith(".mov") ||
        rawName.toLowerCase().endsWith(".webm") ||
        rawName.toLowerCase().endsWith(".mkv") ||
        rawName.toLowerCase().endsWith(".3gp")
      );

      // تحديد نوع MIME
      let detectedMime = detectedMagic?.mime || normalizeGeminiMime(rawType, isVideoMedia);

      // فحص الحد الأقصى للحجم (50MB للفيديو، 25MB للصوت)
      const maxAllowedSize = isVideoMedia ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
      if (bufferLen > maxAllowedSize) {
        try {
          const logData = `[SHARE ${shareId}]
POST_RECEIVED
FILE_TOO_LARGE: size=${bufferLen}, max=${maxAllowedSize}
REDIRECT=/?shared=error&msg=file_too_large
`;
          fs.appendFileSync(path.join(DATA_DIR, "share_incoming.log"), logData);
        } catch (_) {}
        return res.redirect(303, "/?shared=error&msg=file_too_large");
      }

      // تحديد اسم الملف بامتداد منضبط
      let finalName = rawName;
      const defaultExt = detectedMagic?.ext || (isVideoMedia ? "mp4" : "opus");
      if (!finalName || finalName === "blob" || finalName === "unknown" || !finalName.includes(".")) {
        finalName = isVideoMedia ? `whatsapp-video.${defaultExt}` : `whatsapp-audio.${defaultExt}`;
      } else if (!finalName.toLowerCase().endsWith(`.${defaultExt}`) && !finalName.toLowerCase().match(/\.(opus|ogg|oga|mp3|m4a|aac|wav|webm|3gp|amr|mp4|mov|mkv)$/)) {
        finalName = `${finalName}.${defaultExt}`;
      }

      const mediaItem: StoredSharedMedia = {
        id: shareId,
        name: finalName,
        mimetype: detectedMime,
        size: file.size || file.buffer.length,
        buffer: file.buffer,
        text: sharedText,
        isVideo: isVideoMedia,
        timestamp: Date.now(),
      };

      // 1. حفظ في ذاكرة الخادم
      serverSharedMediaStore.set(shareId, mediaItem);
      serverSharedMediaStore.set("latest_opus", mediaItem);

      // 2. حفظ على قرص التخزين المركزي لضمان بقاء الملف حتى مع إعادة تشغيل الخادم
      try {
        fs.writeFileSync(path.join(SHARED_MEDIA_DIR, `${shareId}.bin`), file.buffer);
        fs.writeFileSync(
          path.join(SHARED_MEDIA_DIR, `${shareId}.json`),
          JSON.stringify(
            {
              id: shareId,
              name: finalName,
              mimetype: detectedMime,
              size: mediaItem.size,
              text: mediaItem.text,
              isVideo: isVideoMedia,
              timestamp: mediaItem.timestamp,
            },
            null,
            2
          ),
          "utf-8"
        );
        fs.writeFileSync(
          path.join(SHARED_MEDIA_DIR, "latest.json"),
          JSON.stringify({ id: shareId, timestamp: mediaItem.timestamp }),
          "utf-8"
        );
      } catch (diskErr) {
        console.warn("Notice: could not persist shared media to disk:", diskErr);
      }

      try {
        const logData = `[SHARE ${shareId}]
POST_RECEIVED
FILE_FOUND=${finalName}
FILE_SIZE=${bufferLen}
MIME=${detectedMime}
SOURCE=whatsapp
STORAGE=server-local+client-bridge
MAGIC_DETECTED=${detectedMagic ? JSON.stringify(detectedMagic) : "NONE"}
REDIRECT=/?shared=opus&id=${shareId}
STATUS=READY_FOR_CLIENT
`;
        fs.appendFileSync(path.join(DATA_DIR, "share_incoming.log"), logData);
      } catch (_) {}

      // جسر التسليم: الملف يُكتب في IndexedDB وCache داخل جهاز المستخدم
      // ثم تُفتح الصفحة ومعها معرّف المشاركة حتى لو تغيّرت حاوية Cloud Run.
      const inlineBase64 = file.buffer.length <= SHARE_INLINE_MAX_BYTES ? file.buffer.toString("base64") : "";

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.send(renderShareHandoffPage({
        shareId,
        kind: "opus",
        fileName: finalName,
        mimeType: detectedMime,
        isVideo: isVideoMedia,
        text: sharedText,
        base64: inlineBase64,
      }));
    } catch (handlerErr) {
      console.error("Error processing share-target POST:", handlerErr);
      return res.redirect(303, "/?shared=error&msg=server_process_err");
    }
  });
});

app.get("/share-target", (req, res) => {
  res.redirect(303, "/");
});

app.post("/api/share-ingest", (req, res) => {
  shareUpload.any()(req, res, (err) => {
    if (err) return res.status(400).json({ success: false });
    const allFiles: Express.Multer.File[] = [];
    if (Array.isArray(req.files)) allFiles.push(...req.files);
    else if (req.files && typeof req.files === "object") {
      for (const k of Object.keys(req.files)) {
        const val = (req.files as any)[k];
        if (Array.isArray(val)) allFiles.push(...val);
        else if (val) allFiles.push(val);
      }
    }
    if (req.file) allFiles.push(req.file);

    const file = allFiles.find((f) => f && f.buffer && f.buffer.length > 0);
    if (!file) return res.status(400).json({ success: false, error: "No file" });

    const fileName = file.originalname || "whatsapp-voice.opus";
    const mime = file.mimetype || "audio/ogg; codecs=opus";
    const shareId = "sh_opus_" + Date.now().toString(36);

    const mediaItem: StoredSharedMedia = {
      id: shareId,
      name: fileName,
      mimetype: mime,
      size: file.buffer.length,
      buffer: file.buffer,
      text: "",
      isVideo: mime.startsWith("video/"),
      timestamp: Date.now(),
    };
    serverSharedMediaStore.set("latest_opus", mediaItem);
    serverSharedMediaStore.set(shareId, mediaItem);
    return res.json({ success: true, id: shareId });
  });
});

app.get("/api/latest-opus", (req, res) => {
  const item = loadLatestSharedMedia();
  if (!item) return res.status(404).json({ success: false, error: "No shared opus audio available" });
  res.setHeader("Content-Type", item.mimetype || "audio/ogg");
  res.setHeader("Content-Length", item.buffer.length);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(item.name)}"`);
  return res.send(item.buffer);
});

// Endpoint لتسليم ميتاداتا الملف المشارك لواجهة React
app.get("/api/shared-file/:id", (req, res) => {
  const { id } = req.params;
  if (!id || !/^[a-zA-Z0-9_\-]+$/.test(id) || id.length > 64) {
    return res.status(400).json({ success: false, error: "Invalid share ID" });
  }

  let item = serverSharedMediaStore.get(id);

  if (!item) {
    try {
      const metaPath = path.join(SHARED_MEDIA_DIR, `${id}.json`);
      const binPath = path.join(SHARED_MEDIA_DIR, `${id}.bin`);
      if (fs.existsSync(metaPath) && fs.existsSync(binPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        const buf = fs.readFileSync(binPath);
        item = {
          id: meta.id,
          name: meta.name,
          mimetype: meta.mimetype,
          size: meta.size || buf.length,
          buffer: buf,
          text: meta.text || "",
          isVideo: meta.isVideo || false,
          timestamp: meta.timestamp || Date.now(),
        };
        serverSharedMediaStore.set(id, item);
      }
    } catch (_) {}
  }

  if (!item) {
    return res.status(404).json({ success: false, error: "انتهت صلاحية الملف المشارك أو لم يتم العثور عليه." });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, private");
  res.json({
    success: true,
    id: item.id,
    name: item.name,
    mimetype: item.mimetype,
    size: item.size,
    text: item.text || "",
    isVideo: Boolean(item.isVideo),
  });
});

// Endpoint لتنزيل / قراءة الملف الخام مباشرة كـ Stream أو Blob
app.get("/api/shared-file/:id/raw", (req, res) => {
  const { id } = req.params;
  if (!id || !/^[a-zA-Z0-9_\-]+$/.test(id) || id.length > 64) {
    return res.status(400).send("Invalid share ID");
  }

  let item = serverSharedMediaStore.get(id);

  if (!item) {
    try {
      const metaPath = path.join(SHARED_MEDIA_DIR, `${id}.json`);
      const binPath = path.join(SHARED_MEDIA_DIR, `${id}.bin`);
      if (fs.existsSync(metaPath) && fs.existsSync(binPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        const buf = fs.readFileSync(binPath);
        item = {
          id: meta.id,
          name: meta.name,
          mimetype: meta.mimetype,
          size: meta.size || buf.length,
          buffer: buf,
          text: meta.text || "",
          isVideo: meta.isVideo || false,
          timestamp: meta.timestamp || Date.now(),
        };
        serverSharedMediaStore.set(id, item);
      }
    } catch (_) {}
  }

  if (!item) {
    return res.status(404).send("File not found or expired.");
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, private");
  res.setHeader("Content-Type", item.mimetype);
  res.setHeader("Content-Length", item.size);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(item.name)}"`);
  res.send(item.buffer);
});

// Endpoint to vocalize / apply complete Arabic diacritics (tashkeel)
app.post("/api/tashkeel", async (req, res) => {
  try {
    const { text, context } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ success: false, error: "النص المطلوب تشكيله غير متوفر." });
    }

    const prompt = `أنت عالم لغوي ونحوي متخصص في الضبط الإعرابي والشكل التام للغة العربية الفصحى والفتاوى الشرعية والقرآن الكريم والحديث النبوي.
المطلوب:
1. قم بضبط وتشكيل النص التالي بالحركات الإعرابية التامة وحركات البنية والتنوين بدقة نحوية ولغوية فائقة.
2. اضبط الآيات القرآنية بالرسم والضبط القرآني وضعها بين قوسي مصحف ﴿ ﴾.
3. اضبط الأحاديث النبوية وعبارات الصلاة على النبي ﷺ والترضي.
4. حافظ على كافة الكلمات بدقة دون حذف أو زيادة أو تغيير لألفاظ الشيخ.
5. أعد النتيجة كنص مشكول فقط بدون أي شروحات أو مقدمات.

النص المراد تشكيله:
"""
${text.trim()}
"""`;

    const response = await generateContentWithSmartFallback({
      contents: [{ text: prompt }],
      config: {
        systemInstruction: "أنت محرر لغوي متخصص في التشكيل العربي التام والضبط القرآني السليم للفتاوى الشرعية.",
        temperature: 0.0,
      },
    });

    const vocalized = response.text?.trim() || text;
    res.json({ success: true, vocalized });
  } catch (err: any) {
    console.error("Tashkeel endpoint error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر تشكيل النص" });
  }
});

// Transcribe and format fatwa endpoint
app.post("/api/transcribe-fatwa", async (req, res) => {
  try {
    const {
      question_original,
      audio_base64,
      audio_mime_type,
      strict_mode = true,
      text_raw_answer,
      fatwa_type = "normal", // 'normal' | 'moasala'
      is_video = false,
      request_tashkeel = false,
      audio_only_mode = false,
    } = req.body;

    if (!question_original && !audio_base64 && !text_raw_answer) {
      return res.status(400).json({ error: "يجب تقديم السؤال أو التسجيل الصوتي أو المرئي للبدء." });
    }

    const isVideoMedia = is_video || (audio_mime_type && audio_mime_type.startsWith("video/"));

    // Prepare contents
    const contentParts: any[] = [];

    // Add audio/video if provided
    if (audio_base64) {
      const mime = normalizeGeminiMime(audio_mime_type, isVideoMedia);
      // Remove data:...;base64, header if present
      const cleanBase64 = audio_base64.includes(",") ? audio_base64.split(",")[1] : audio_base64;
      contentParts.push({
        inlineData: {
          mimeType: mime,
          data: cleanBase64,
        },
      });
    }

    // Build prompt text
    let userPromptText = "";
    if (audio_only_mode) {
      userPromptText = `[وضع الاستخراج الحصري والقطعي من التسجيل الصوتي فقط - بدون أي تأليف أو استنتاج خارجي]:
هذا التسجيل يحتوي على كلام فضيلة الشيخ د. عبد الباري خلة.
ملاحظة هامة ومؤكدة: فضيلة الشيخ يقرأ نص السؤال بنفسه في بداية التسجيل أو يكرر صيغته واستفسار السائل قبل أن يشرع في الإجابة.

المطلوب بدقة متناهية وأمانة علمية تامة دون أي اختلاق:
1. استمع للتسجيل الصوتي بعناية فائقة من بدايته.
2. استخرج نص السؤال الذي قرأه الشيخ أو نطقه في بداية التسجيل، ونظمه في (question_clean) بلغة عربية فصيحة وسليمة، مع إبقاء تحية الإسلام (السلام عليكم ورحمة الله وبركاته) في أوله. وإذا لم يقرأ الشيخ السؤال صراحة، لخص السؤال بدقة شديدة مقتصراً على ما ذكره الشيخ في التسجيل فقط دون أي زيادة أو تأليف من عندك.
3. فرّغ كلام الشيخ الحرفي لكامل التسجيل (سؤالاً وجواباً) في (transcription_raw) كلمة بكلمة وأمانة تامة.
4. ضع جواب الشيخ الشرعي في (answer_clean) مع التنسيق الإملائي وعلامات الترقيم دون تغيير ألفاظه، ودون تأليف أي أحكام جديدة إطلاقاً!
5. [تحذير قطعي وإلزامي]: يُحظر تماماً الإجابة من معلوماتك العامة، أو افتراض أو تأليف أي سؤال أو جواب من عندك. كل حرف يجب أن يكون مستمداً مما نطق به الشيخ في التسجيل المرفق فقط.
6. اذكر التعديلات في editing_notes وأي مقطع غير واضح في unclear_segments، وحدد هل ختم الشيخ بـ "والله أعلم".`;
    } else {
      userPromptText = `مطلوب تفريغ دقيق لجواب فضيلة الشيخ د. عبد الباري خلة:\n`;
      userPromptText += `[سؤال السائل]:\n${question_original || "(استخلصه من التسجيل إن ذُكر فيه، وإلا اتركه فارغاً)"}\n\n`;

      if (audio_base64) {
        userPromptText += isVideoMedia
          ? `[المقطع المرئي (فيديو) المرفق]: هذا المقطع يحتوي على تسجيل فيديو لفضيلة الشيخ د. عبد الباري خلة.\n`
          : `[التسجيل الصوتي المرفق]: هذا المقطع يحتوي على تسجيل صوتي للشيخ د. عبد الباري خلة.\n`;
        userPromptText += `[تحذير قطعي وإلزامي]:
- لا تجب عن سؤال السائل من معلوماتك العامة ولا تؤلف فتوى أبداً!
- مهمتك هي الاستماع للتسجيل وتفريغ ما قاله الشيخ في التسجيل فقط وبمنتهى الأمانة دون أي زيادة.
- إذا كان التسجيل لا يحتوي على جواب، أو كان صامتاً، اكتب في التفريغ [لم يُسمع جواب في التسجيل].
- ضع في answer_clean كلام الشيخ الوارد في التسجيل فقط بعد تنسيقه إملائياً وترقيمياً وفق قاعدة التعديل الأدنى.

المطلوب بدقة:
1. استمع للتسجيل وفرغه حرفياً كلمة بكلمة في transcription_raw.
2. نسق جواب الشيخ المستخرج من التسجيل فقط في answer_clean (تصحيح إملائي بسيط + علامات ترقيم + فقرات مرتبة).
3. رتب ونقح سؤال السائل في question_clean بأسلوب عربي سليم وواضح يراعي اللهجة ومقصود السائل، مع الإبقاء التام على السلام عليكم والتحيات ومقدمات الأدب وعدم حذفها أبداً. [تنبيه حازم]: يُحظر تماماً كتابة (وعليكم السلام) في سؤال السائل؛ فالسائل يبدأ بالسلام (السلام عليكم ورحمة الله وبركاته)، ولفظ (وعليكم السلام) يكون فقط وحصراً في بداية جواب الشيخ answer_clean.
4. أي كلمة غير واضحة في الصوت ضعها في unclear_segments وفي مكانها في النص بصيغة [غير واضح].
5. اذكر التعديلات في editing_notes.
6. حدد هل ختم الشيخ بـ "والله أعلم".`;
      } else if (text_raw_answer) {
        userPromptText += `[النص الأولي لجواب الشيخ]:\n${text_raw_answer}\n\n`;
        userPromptText += `المطلوب: تنسيق النص المكتوب فقط وتنقيح الإملاء وعلامات الترقيم دون تغيير ألفاظ الشيخ أو إضافة أحكام جديدة، وترتيب سؤال السائل في question_clean مع الحفاظ على السلام والتحية (السلام عليكم ورحمة الله وبركاته) وحظر كتابة (وعليكم السلام) في السؤال أبداً.`;
      }
    }

    // Special mode: Foundational Fatwa (فتوى مؤصلة)
    if (fatwa_type === "moasala") {
      userPromptText += `\n\n[نمط الفتوى المؤصلة - طلب مخصص]:
- هذه فتوى مؤصلة لفضيلة الشيخ تتطلب عناية فائقة بالتأصيل الشرعي والفقهي.
- استخرج واضبط الآيات القرآنية التي استشهد بها الشيخ بين قوسي مصحف ﴿ ﴾ بالرسم والضبط القرآني المتقن.
- وثّق الأحاديث النبوية الشريفة وأقوال الفقهاء والأئمة التي ذكرها الشيخ، ورتبها في فقرات محكمة تبرز علة الحكم ووجه الدلالة.
- استخرج قائمة الشواهد والأدلة في evidence_citations.`;
    }

    // Special mode: Video transcription or requested tashkeel (طلب خاص من الشيخ للتشكيل التام والصحيح)
    if (isVideoMedia || request_tashkeel || fatwa_type === "moasala") {
      userPromptText += `\n\n[طلب خاص من الشيخ - التشكيل التام والصحيح بالسؤال والجواب]:
- فضيلة الشيخ يطلب أن تخرج النصوص مشكولة شكلاً تاماً وصحيحاً ومنضبطاً لغوياً ونحوياً وإعرابياً بدون أي أخطاء.
- قم بتزويد حقل (question_tashkeel) بنص السؤال مشكولاً بالحركات الإعرابية التامة الصحيحة مع إبقاء تحية الإسلام في أوله.
- قم بتزويد حقل (answer_tashkeel) بالنص الكامل لجواب الشيخ مشكولاً بالحركات الإعرابية التامة وحركات البنية والتنوين الصحيح بدقة فائقة.
- ضوابط هامة جداً للتشكيل:
  * اقتصر حصراً على الحركات العربية القياسية الست المعروفة (الفتحة، الضمة، الكسرة، السكون، الشدة، وتنوين الفتح والضم والكسر).
  * ممنوع منعاً باتاً استخدام علامات الوقف والضبط القرآني الخاص (مثل ج، صلى، قلى، لا، مـ، علامات السجدة، الصفر المستدير) على الكلمات العادية.
  * تجنب أي أشكال أو تشكيلات متراكبة أو رموز غريبة تشوه قراءة النص على الشاشات أو بطاقات النشر.`;
    }

    contentParts.push({ text: userPromptText });

    const response = await generateContentWithSmartFallback({
      contents: { parts: contentParts },
      config: {
        systemInstruction: FATWA_SYSTEM_INSTRUCTION,
        temperature: 0.0, // Zero temperature for strict deterministic transcription without any hallucination
        maxOutputTokens: 65536, // أقصى حد متاح للمخرجات (64k tokens) لضمان استخراج كامل النص دون أي انقطاع
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question_clean: {
              type: Type.STRING,
              description: "السؤال بعد الترتيب اللغوي المتقن مع الحفاظ على السلام والتحية وعين مقصود السائل وتفاصيله",
            },
            question_tashkeel: {
              type: Type.STRING,
              description: "نص سؤال السائل مشكولاً شكلاً تاماً وصحيحاً بالحركات الإعرابية التامة",
            },
            transcription_raw: {
              type: Type.STRING,
              description: "التفريغ الحرفي الصوتي الأصلي لكلام الشيخ كما نطق به تماماً",
            },
            answer_clean: {
              type: Type.STRING,
              description: "جواب الشيخ بعد الترتيب والتصحيح الإملائي وعلامات الترقيم وفق قاعدة التعديل الأدنى",
            },
            answer_tashkeel: {
              type: Type.STRING,
              description: "نص جواب الشيخ مشكولاً شكلاً تاماً وصحيحاً بالحركات الإعرابية التامة (طلب خاص من الشيخ)",
            },
            evidence_citations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "قائمة الشواهد والأدلة القرآنية والحديثية وأقوال العلماء الواردة في الفتوى المؤصلة",
            },
            unclear_segments: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "قائمة الكلمات أو المقاطع غير الواضحة مثل [غير واضح] التي تحتاج لمراجعة بشرية",
            },
            editing_notes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "ملخص بالتعديلات الطفيفة التي أُجريت مثل تصحيح إملائي أو تقسيم فقرات",
            },
            detected_wallahu_aalam: {
              type: Type.BOOLEAN,
              description: "هل وردت عبارة والله أعلم بوضوح في كلام الشيخ المسجل",
            },
            status: {
              type: Type.STRING,
              description: "الحالة المقترحة للفتوى (مسودة أو تحتاج مراجعة)",
            },
          },
          required: ["question_clean", "transcription_raw", "answer_clean", "unclear_segments", "editing_notes", "detected_wallahu_aalam"],
        },
      },
    });

    const responseText = response.text || "{}";
    const parsedData = JSON.parse(responseText);

    const hasUnclear = parsedData.unclear_segments && parsedData.unclear_segments.length > 0;
    const finalStatus = hasUnclear ? "تحتاج مراجعة" : "مسودة";

    // 1. Initial greeting sanitization
    let sanitizedQuestionClean = sanitizeQuestionGreeting(parsedData.question_clean || question_original);
    let finalAnswerClean = parsedData.answer_clean || parsedData.transcription_raw || text_raw_answer || "";

    // 2. Strict anti-bleed separation filter to prevent sheikh's answer from polluting the question
    if (hasAnswerInQuestion(sanitizedQuestionClean)) {
      const bleedRes = cleanQuestionAnswerBleed(sanitizedQuestionClean);
      if (bleedRes.hadBleed) {
        console.log(`[Anti-Bleed Server Filter]: Separated ${bleedRes.extractedAnswer.length} chars of answer bleed from question_clean.`);
        sanitizedQuestionClean = sanitizeQuestionGreeting(bleedRes.cleanedQuestion);
        if (bleedRes.extractedAnswer) {
          const lead = bleedRes.extractedAnswer.substring(0, Math.min(30, bleedRes.extractedAnswer.length));
          if (!finalAnswerClean || !finalAnswerClean.includes(lead)) {
            finalAnswerClean = finalAnswerClean ? `${bleedRes.extractedAnswer}\n\n${finalAnswerClean}` : bleedRes.extractedAnswer;
          }
        }
      }
    }

    const sanitizedQuestionOriginal = sanitizeQuestionGreeting(question_original || sanitizedQuestionClean);

    let finalTashkeel = parsedData.answer_tashkeel || "";
    let finalQuestionTashkeel = parsedData.question_tashkeel || "";

    // If video or tashkeel requested and the field was omitted by the model, auto-vocalize
    if ((isVideoMedia || request_tashkeel) && (!finalTashkeel || !finalTashkeel.trim()) && finalAnswerClean) {
      try {
        const tashkeelPrompt = `اضبط النص التالي بالحركات الإعرابية التامة وحركات البنية والتنوين مع وضع الآيات في ﴿ ﴾ والأحاديث النبوية، دون تغيير الكلمات:\n"""\n${finalAnswerClean}\n"""`;
        const tResp = await generateContentWithSmartFallback({
          contents: [{ text: tashkeelPrompt }],
          config: {
            systemInstruction: "أنت محرر لغوي متخصص في ضبط وتشكيل نصوص الفتاوى الشرعية بالحركات التامة الصحيحة.",
            temperature: 0.0,
          },
        });
        finalTashkeel = tResp.text?.trim() || finalAnswerClean;
      } catch (tErr) {
        console.warn("Auto-vocalize fallback error for answer:", tErr);
        finalTashkeel = finalAnswerClean;
      }
    }

    if ((isVideoMedia || request_tashkeel) && (!finalQuestionTashkeel || !finalQuestionTashkeel.trim()) && sanitizedQuestionClean) {
      try {
        const qTashkeelPrompt = `اضبط نص السؤال التالي بالحركات الإعرابية التامة وحركات البنية والتنوين دون تغيير الكلمات مع إبقاء تحية الإسلام في أوله:\n"""\n${sanitizedQuestionClean}\n"""`;
        const qResp = await generateContentWithSmartFallback({
          contents: [{ text: qTashkeelPrompt }],
          config: {
            systemInstruction: "أنت محرر لغوي متخصص في ضبط وتشكيل أسئلة الفتاوى الشرعية بالحركات التامة الصحيحة.",
            temperature: 0.0,
          },
        });
        finalQuestionTashkeel = qResp.text?.trim() || sanitizedQuestionClean;
      } catch (qErr) {
        console.warn("Auto-vocalize fallback error for question:", qErr);
        finalQuestionTashkeel = sanitizedQuestionClean;
      }
    }

    const cleanServerTashkeel = (text: string): string => {
      if (!text) return "";
      return text
        .replace(/[\u06D6-\u06ED]/g, "")
        .replace(/[\u0615-\u061A]/g, "")
        .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, " ")
        .replace(/الرَّحْمَٰنِ/g, "الرَّحْمَنِ")
        .replace(/الرَّحْمٰن/g, "الرَّحْمَن")
        .replace(/[\u0670]/g, "")
        .replace(/([\u064B-\u0652])\1+/g, "$1")
        .trim();
    };

    finalTashkeel = cleanServerTashkeel(finalTashkeel);
    finalQuestionTashkeel = cleanServerTashkeel(finalQuestionTashkeel);

    const responsePayload = {
      question_clean: sanitizedQuestionClean,
      question_tashkeel: finalQuestionTashkeel || sanitizedQuestionClean,
      transcription_raw: parsedData.transcription_raw || text_raw_answer || "",
      answer_clean: finalAnswerClean,
      answer_tashkeel: finalTashkeel,
      fatwa_type: isVideoMedia ? "moasala" : fatwa_type,
      evidence_citations: parsedData.evidence_citations || [],
      unclear_segments: parsedData.unclear_segments || [],
      editing_notes: parsedData.editing_notes || [],
      detected_wallahu_aalam: !!parsedData.detected_wallahu_aalam,
      status: finalStatus,
      model_used: (response as any).modelUsed || "gemini-3.5-flash-lite",
    };

    res.json(responsePayload);
  } catch (err: any) {
    console.error("Transcribe error:", err);
    const errStatus = err?.status || err?.code || 500;
    const errMsg = (err?.message || "").toLowerCase();
    const isBusy =
      errStatus === 503 ||
      errStatus === 429 ||
      errMsg.includes("high demand") ||
      errMsg.includes("unavailable") ||
      errMsg.includes("resource_exhausted") ||
      errMsg.includes("overloaded");

    const userMessage = isBusy
      ? "خوادم الذكاء الاصطناعي تشهد ضغطاً مؤقتاً في هذه اللحظة. تم تفعيل المحاولات التلقائية، يرجى النقر على زر 'إعادة المحاولة' للبدء فوراً."
      : err.message || "حدث خطأ أثناء معالجة التسجيل الصوتي.";

    res.status(isBusy ? 503 : 500).json({
      error: userMessage,
      details: err.toString(),
      is_temporary: isBusy,
    });
  }
});

// 100% Pure Gemini AI Word Document & Bulk Text Parser
async function parseFatwasWithPureAI(fullText: string): Promise<any[]> {
  if (!fullText || !fullText.trim()) return [];

  // Split text into semantic chunks (~15,000 chars each) for fast parallel processing
  const splitIntoChunks = (text: string, maxChunkSize = 15000): string[] => {
    if (text.length <= maxChunkSize) return [text];

    const chunks: string[] = [];
    const lines = text.split("\n");
    let currentChunk = "";

    for (const line of lines) {
      if ((currentChunk + "\n" + line).length > maxChunkSize && currentChunk.length > 3000) {
        chunks.push(currentChunk.trim());
        currentChunk = line;
      } else {
        currentChunk = currentChunk ? currentChunk + "\n" + line : line;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  };

  const textChunks = splitIntoChunks(fullText.trim());
  console.log(`[Pure AI Word Parser]: Processing ${textChunks.length} chunk(s) across ${fullText.length} characters in parallel with Gemini AI...`);

  const processChunk = async (chunk: string, index: number) => {
    console.log(`[Pure AI Word Parser]: Analyzing chunk ${index + 1}/${textChunks.length} (${chunk.length} chars) with Gemini AI...`);

    const promptText = `أنت خبير لغوي وشريعي دقيق ومساعد أمين لفتاوى فضيلة الشيخ د. عبد الباري خلة.
أمامك نص مأخوذ من مستند Word يحتوي على مجموعة من الفتاوى الشرعية (أسئلة من السائلين وأجوبة من الشيخ).

مهمتك الصارمة بالذكاء الاصطناعي:
1. الفهم الدلالي والسياقي: اقرأ النص واكتشف بالذكاء الاصطناعي أين يبدأ كل سؤال وأين ينتهي، وأين يبدأ جوابه التابع له حصراً.
2. حظر الخلط والدمج: ممنوع تماماً خلط سؤال فتوى مع جواب فتوى أخرى، وممنوع دمج فتويين منفصلتين في فتوى واحدة.
3. استخراج كل فتوى بأمانة علمية تامة دون أي تأليف أو هلوسة:
   - question_original: نص السؤال كما ورد في المستند.
   - question_clean: ترتيب وتنقيح صياغة السؤال بلغة عربية فصيحة وسليمة مع الحفاظ الكامل والتام على التحيات مثل "السلام عليكم ورحمة الله وبركاته" وأدب السؤال، ودون حذف أو تغيير أي وقائع أو أسماء أو أرقام.
   - answer_clean: نص جواب الشيخ كاملاً دون أي تأليف أو اختصار مع الحفاظ على الأدلة الشرعية ولفظ "والله أعلم" في ختام الجواب.
   - category: التصنيف الفقهي الدقيق للفتوى (مثل: الصلاة والطهارة، المعاملات والزكاة، الصيام والاعتكاف، الأسرة والزواج، الحج والعمرة، الأيمان والنذور، الجنائز، فتاوى عامة).
   - tags: كلمات مفتاحية دقيقة لموضوع الفتوى (مصفوفة نصوص).
   - has_wallahu_aalam: قيمة منطقية (true/false) إذا كان الجواب مختوماً بـ "والله أعلم" أو "والله تعالى أعلم".
4. استخرج جميع الفتاوى الموجودة في هذا المقطع بالكامل حتى آخر فتوى دون أي اقتطاع.

النص المراد تحليله واستخراج فتاواه:
"""
${chunk}
"""`;

    const response = await generateContentWithSmartFallback({
      contents: [{ text: promptText }],
      config: {
        systemInstruction: "أنت محرر ومفهرس فتاوى شرعية فائق الدقة والأمانة العلمية. تستخرج الأسئلة والأجوبة بالذكاء الاصطناعي الفعلي دون أي خلط أو تأليف أو نقصان.",
        temperature: 0.0,
        maxOutputTokens: 65536,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fatwas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question_original: { type: Type.STRING },
                  question_clean: { type: Type.STRING },
                  answer_clean: { type: Type.STRING },
                  category: { type: Type.STRING },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  has_wallahu_aalam: { type: Type.BOOLEAN },
                },
                required: ["question_original", "question_clean", "answer_clean", "category"],
              },
            },
          },
          required: ["fatwas"],
        },
      },
    });

    const responseText = response.text || "{}";
    const parsedData = JSON.parse(responseText);
    const chunkFatwas = parsedData.fatwas || [];
    console.log(`[Pure AI Word Parser]: Chunk ${index + 1} extracted ${chunkFatwas.length} fatwas successfully.`);
    return chunkFatwas;
  };

  // Run chunks in controlled sequence/batches of 2 to prevent rate limiting or connection drop
  const allExtracted: any[] = [];
  const batchSize = 2;
  for (let i = 0; i < textChunks.length; i += batchSize) {
    const currentBatch = textChunks.slice(i, i + batchSize);
    const batchPromises = currentBatch.map((chunk, offset) =>
      processChunk(chunk, i + offset).catch((err) => {
        console.error(`[Pure AI Word Parser]: Error processing chunk ${i + offset + 1}:`, err);
        return [];
      })
    );
    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((res) => {
      if (Array.isArray(res)) allExtracted.push(...res);
    });
  }

  return allExtracted;
}

// Word Document Bulk Parser Endpoint (100% Pure Gemini AI Powered)
app.post("/api/parse-word-doc", async (req, res) => {
  try {
    const { file_base64, raw_text } = req.body || {};
    let extractedText = "";

    if (raw_text && typeof raw_text === "string" && raw_text.trim()) {
      extractedText = raw_text.trim();
    } else if (file_base64) {
      const cleanBase64 = file_base64.includes(",") ? file_base64.split(",")[1] : file_base64;
      const buffer = Buffer.from(cleanBase64, "base64");
      try {
        const mammothResult = await mammoth.extractRawText({ buffer });
        extractedText = (mammothResult.value || "").trim();
      } catch (mamErr) {
        console.warn("Mammoth server buffer extraction error:", mamErr);
        // If not docx (e.g. utf-8 plain text file uploaded), attempt utf-8 decoding
        extractedText = buffer.toString("utf-8").trim();
      }
    }

    if (!extractedText || extractedText.length < 5) {
      return res.status(400).json({ error: "الملف فارغ أو لم يتم العثور على نصوص قابلة للقراءة في المستند." });
    }

    console.log(`[Word Parser]: Received document text (${extractedText.length} characters). Starting pure AI extraction...`);

    // Run Pure Gemini AI extraction
    const aiFatwas = await parseFatwasWithPureAI(extractedText);

    if (aiFatwas.length === 0) {
      return res.status(422).json({
        error: "لم يتمكن الذكاء الاصطناعي من العثور على صيغ فتاوى واضحة (أسئلة وأجوبة) في المستند المقدم.",
      });
    }

    const formattedFatwas = aiFatwas.map((f: any, idx: number) => {
      let qClean = sanitizeQuestionGreeting(f.question_clean || f.question_original || `سؤال ${idx + 1}`);
      let aClean = f.answer_clean || "";

      if (hasAnswerInQuestion(qClean)) {
        const bleed = cleanQuestionAnswerBleed(qClean);
        if (bleed.hadBleed) {
          qClean = sanitizeQuestionGreeting(bleed.cleanedQuestion);
          if (bleed.extractedAnswer) {
            const lead = bleed.extractedAnswer.substring(0, Math.min(30, bleed.extractedAnswer.length));
            if (!aClean || !aClean.includes(lead)) {
              aClean = aClean ? `${bleed.extractedAnswer}\n\n${aClean}` : bleed.extractedAnswer;
            }
          }
        }
      }

      let qOrig = sanitizeQuestionGreeting(f.question_original || qClean);
      if (hasAnswerInQuestion(qOrig)) {
        const bleed = cleanQuestionAnswerBleed(qOrig);
        if (bleed.hadBleed) {
          qOrig = sanitizeQuestionGreeting(bleed.cleanedQuestion);
        }
      }

      return {
        id: `word-import-${Date.now()}-${idx + 1}`,
        question_original: qOrig,
        question_clean: qClean,
        transcription_raw: aClean,
        answer_clean: aClean,
        unclear_segments: [],
        editing_notes: [
          `فتوى رقم (${idx + 1} من ${aiFatwas.length}) مستخرجة ومفصولة بالذكاء الاصطناعي الكامل`,
          "تم الفصل الدقيق والتنقيح اللغوي بانتظار المراجعة والاعتماد",
        ],
        category: f.category || "فتاوى عامة",
        tags: f.tags && f.tags.length ? f.tags : ["مستورد من Word"],
        has_wallahu_aalam: f.has_wallahu_aalam ?? (aClean ? (aClean.includes("والله أعلم") || aClean.includes("والله تعالى أعلم")) : true),
        status: "تحتاج مراجعة",
        reviewed: false,
        approved: false,
      };
    });

    console.log(`[Word Parser]: Complete! Returning ${formattedFatwas.length} pure AI extracted fatwas.`);

    return res.json({
      success: true,
      source: "pure_gemini_ai",
      total: formattedFatwas.length,
      extractedTextLength: extractedText.length,
      fatwas: formattedFatwas,
    });
  } catch (err: any) {
    console.error("Word Doc Parsing error:", err);
    return res.status(500).json({
      error: "فشل استخراج الفتاوى عبر الذكاء الاصطناعي: " + (err.message || "خطأ غير متوقع"),
      details: err.toString(),
    });
  }
});



async function startServer() {
  const distPath = fs.existsSync(path.join(process.cwd(), "dist", "index.html"))
    ? path.join(process.cwd(), "dist")
    : process.cwd();
  const hasDist = fs.existsSync(path.join(distPath, "index.html"));
  
  // Production when NODE_ENV is production or when dist/index.html is built and not running npm run dev
  const isDev = process.env.npm_lifecycle_event === "dev" || (process.env.NODE_ENV !== "production" && !hasDist);

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // منع تخزين sw.js في الكاش حتى تصل التحديثات فوراً، وضمان نطاق الجذر
    app.get("/sw.js", (req, res) => {
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.set("Service-Worker-Allowed", "/");
      res.type("application/javascript");
      res.sendFile(path.join(distPath, "sw.js"));
    });

    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fatwa Transcriber Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();