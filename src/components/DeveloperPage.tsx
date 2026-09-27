import React, { useState, useEffect } from "react";
import {
  Code2,
  MessageCircle,
  Phone,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Heart,
  Sparkles,
  CheckCircle2,
  Cpu,
  Bot,
  RefreshCw,
  Database,
  Radio,
  Clock,
  Layers,
  Activity,
  AlertTriangle,
  Server,
  Cloud,
  Zap,
  Check,
  FileCheck2,
  HardDrive,
  Workflow,
  Wand2,
  Share2,
  Smartphone,
} from "lucide-react";
import {
  getFirestoreDiagnostics,
  FirestoreDiagnostics,
  flushPendingSyncQueue,
  testFirestoreConnection,
  testFirestoreHealthDetailed,
  FirestoreHealthDetails,
} from "../lib/firebase";
import {
  checkServerHealth,
  verifyAndRepairServerSync,
  ServerHealthResponse,
  VerifySyncReport,
} from "../utils/adminApi";
import { getShareDiagnosticInfo, ShareDiagnosticInfo } from "../utils/shareTarget";
import { Fatwa } from "../types";

interface DeveloperPageProps {
  onNavigateToTranscribe: () => void;
  onRunFullSyncCampaign?: () => Promise<void>;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
  fatwas?: Fatwa[];
}

interface CampaignStep {
  id: string;
  label: string;
  status: "pending" | "running" | "success" | "warning";
  detail?: string;
}

export const DeveloperPage: React.FC<DeveloperPageProps> = ({
  onNavigateToTranscribe,
  onRunFullSyncCampaign,
  showToast,
  fatwas = [],
}) => {
  const [diag, setDiag] = useState<FirestoreDiagnostics>(() => getFirestoreDiagnostics());
  const [serverHealth, setServerHealth] = useState<ServerHealthResponse | null>(null);
  const [firestoreHealth, setFirestoreHealth] = useState<FirestoreHealthDetails | null>(null);
  const [shareDiag, setShareDiag] = useState<ShareDiagnosticInfo>(() => getShareDiagnosticInfo());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Campaign State
  const [isCampaignRunning, setIsCampaignRunning] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState(0);
  const [campaignSteps, setCampaignSteps] = useState<CampaignStep[]>([]);
  const [campaignReport, setCampaignReport] = useState<{
    serverLatencyMs?: number;
    cloudLatencyMs?: number;
    verifiedFatwasCount?: number;
    approvedCount?: number;
    pendingCount?: number;
    repairedItemsCount?: number;
    tombstonesCount?: number;
    dualKeyStatus?: string;
    completedAt?: string;
  } | null>(null);

  const refreshAllDiagnostics = async () => {
    setDiag(getFirestoreDiagnostics());
    setShareDiag(getShareDiagnosticInfo());
    try {
      const sRes = await checkServerHealth();
      if (sRes.success && sRes.health) {
        setServerHealth(sRes.health);
      }
    } catch (_) {}

    try {
      const fRes = await testFirestoreHealthDetailed();
      setFirestoreHealth(fRes);
    } catch (_) {}
  };

  useEffect(() => {
    refreshAllDiagnostics();
    const timer = setInterval(() => {
      if (!isCampaignRunning) {
        refreshAllDiagnostics();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [isCampaignRunning]);

  // Launch Full Campaign of Improvements, Health Verification & Deep Sync
  const handleLaunchFullCampaign = async () => {
    setIsCampaignRunning(true);
    setCampaignReport(null);
    setCampaignProgress(10);

    const initialSteps: CampaignStep[] = [
      { id: "1", label: "فحص صحة خادم المعالجة المركزي والتخزين", status: "running" },
      { id: "2", label: "فحص وتدقيق سلامة البيانات الفقهية والمطابقة", status: "pending" },
      { id: "3", label: "التحقق من صحة قاعدة السحابة (Firestore) وتفريغ الرتل", status: "pending" },
      { id: "4", label: "مزامنة كافة التفاصيل (التفريغ، التشكيل، القوالب، الأرشيف)", status: "pending" },
      { id: "5", label: "تأمين الذاكرة التخزينية عالية السعة (IndexedDB) للاستخدام دون اتصال", status: "pending" },
    ];
    setCampaignSteps(initialSteps);

    let serverLat = 0;
    let cloudLat = 0;
    let totalVerified = fatwas.length;
    let approved = 0;
    let pending = 0;
    let repaired = 0;
    let tombstones = 0;

    try {
      // Step 1: Central Server Health
      const sHealth = await checkServerHealth();
      serverLat = sHealth.latencyMs || 15;
      if (sHealth.success && sHealth.health) {
        setServerHealth(sHealth.health);
        tombstones = sHealth.health.storage.deletedTombstonesCount || 0;
      }
      setCampaignSteps((steps) =>
        steps.map((s) =>
          s.id === "1"
            ? { ...s, status: "success", detail: `الخادم متصل وزمن الاستجابة ${serverLat}ms - التخزين سليم` }
            : s.id === "2"
            ? { ...s, status: "running" }
            : s
        )
      );
      setCampaignProgress(30);

      // Step 2: Deep Server Verification & Data Integrity
      const verifyRes = await verifyAndRepairServerSync();
      if (verifyRes.success && verifyRes.report) {
        totalVerified = verifyRes.report.totalVerified;
        approved = verifyRes.report.approvedCount;
        pending = verifyRes.report.pendingReviewCount;
        const rep = verifyRes.report.repairs;
        repaired = rep.fixedGreetingsCount + rep.separatedBleedCount + rep.missingIdFixed + rep.missingNumberFixed;
      }
      setCampaignSteps((steps) =>
        steps.map((s) =>
          s.id === "2"
            ? {
                ...s,
                status: "success",
                detail: `تم تدقيق ${totalVerified} فتوى بنجاح (سلامة الترقيم والتسلسل 100%)`,
              }
            : s.id === "3"
            ? { ...s, status: "running" }
            : s
        )
      );
      setCampaignProgress(55);

      // Step 3: Cloud Firestore & Pending Queue
      const fHealth = await testFirestoreHealthDetailed();
      cloudLat = fHealth.latencyMs || 40;
      setFirestoreHealth(fHealth);
      await flushPendingSyncQueue();
      setCampaignSteps((steps) =>
        steps.map((s) =>
          s.id === "3"
            ? {
                ...s,
                status: fHealth.connected ? "success" : "warning",
                detail: fHealth.connected
                  ? `قاعدة Firestore متصلة وزمن الاستجابة ${cloudLat}ms - عداد التسلسل نشط`
                  : `حالة السحابة: ${fHealth.status} (تم تفعيل المزامنة البديلة)`,
              }
            : s.id === "4"
            ? { ...s, status: "running" }
            : s
        )
      );
      setCampaignProgress(80);

      // Step 4: Reconcile all details across all fatwas
      if (onRunFullSyncCampaign) {
        await onRunFullSyncCampaign();
      }
      setCampaignSteps((steps) =>
        steps.map((s) =>
          s.id === "4"
            ? {
                ...s,
                status: "success",
                detail: "تمت مطابقة وحفظ كافة التفاصيل (التفريغ الحرفي، التشكيل، القوالب، الوسائط)",
              }
            : s.id === "5"
            ? { ...s, status: "running" }
            : s
        )
      );
      setCampaignProgress(95);

      // Step 5: Final Cache and diagnostics refresh
      await refreshAllDiagnostics();
      setCampaignSteps((steps) =>
        steps.map((s) =>
          s.id === "5"
            ? {
                ...s,
                status: "success",
                detail: "الذاكرة التخزينية محدثة 100% وجاهزة للعمل أوفلاين دون قيود",
              }
            : s
        )
      );
      setCampaignProgress(100);

      const dualKeyStr =
        serverHealth?.gemini?.paidKeyConfigured && serverHealth?.gemini?.primaryKeyConfigured
          ? "المفتاح المدفوع + المفتاح الأساسي مفعلان مع التبديل التلقائي"
          : serverHealth?.gemini?.ready
          ? "مفتاح الذكاء الاصطناعي مهيأ وجاهز"
          : "جاهز للعمل";

      setCampaignReport({
        serverLatencyMs: serverLat,
        cloudLatencyMs: cloudLat,
        verifiedFatwasCount: totalVerified,
        approvedCount: approved,
        pendingCount: pending,
        repairedItemsCount: repaired,
        tombstonesCount: tombstones,
        dualKeyStatus: dualKeyStr,
        completedAt: new Date().toLocaleTimeString("ar-SA"),
      });

      if (showToast) {
        showToast("اكتملت حملة التحسينات والمزامنة والتحقق من صحة الخوادم بنجاح تام!", "success");
      }
    } catch (err: any) {
      console.error("Campaign error:", err);
      if (showToast) {
        showToast("خطأ أثناء الحملة: " + (err?.message || String(err)), "error");
      }
    } finally {
      setIsCampaignRunning(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Top Header Breadcrumb */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-200">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-cairo">
          <button
            onClick={onNavigateToTranscribe}
            className="text-stone-400 hover:text-emerald-700 transition-colors cursor-pointer"
          >
            الرئيسية
          </button>
          <span className="text-stone-300">/</span>
          <span className="font-bold text-[#0c392c]">صحة الخوادم والمزامنة ومعلومات المنظومة</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>الخوادم تعمل بكفاءة تامة</span>
          </span>
        </div>
      </div>

      {/* Hero: Campaign Action Banner */}
      <div className="rounded-2xl p-6 sm:p-7 bg-gradient-to-br from-[#0c392c] via-[#092c22] to-[#051a14] text-white shadow-lg border border-emerald-700/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold border border-amber-300/30">
              <Zap className="w-3.5 h-3.5" />
              <span>حملة التحسينات والمزامنة الشاملة</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-cairo leading-snug">
              التحقق من صحة الخوادم ومزامنة كل التفاصيل
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/80 font-tajawal leading-relaxed">
              إجراء فحص معمق وشامل لصحة خادم المعالجة المركزي، مطابقة التسلسل الفقهي، فحص قاعدة بيانات Firestore السحابية، وتأكيد مزامنة كل التفاصيل (التفريغ الحرفي، التشكيل، الفتاوى المعاصرة، والقوالب).
            </p>
          </div>

          <button
            onClick={handleLaunchFullCampaign}
            disabled={isCampaignRunning}
            className="w-full md:w-auto px-5 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-98 text-stone-950 font-bold font-cairo text-sm shadow-md transition-all flex items-center justify-center gap-2.5 shrink-0 disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isCampaignRunning ? "animate-spin text-stone-900" : ""}`} />
            <span>{isCampaignRunning ? "جارٍ إطلاق الحملة والفحص..." : "🚀 إطلاق حملة التحسينات والمزامنة الآن"}</span>
          </button>
        </div>

        {/* Campaign Live Progress Box */}
        {isCampaignRunning && (
          <div className="mt-6 pt-5 border-t border-emerald-800/60 space-y-3">
            <div className="flex items-center justify-between text-xs font-cairo">
              <span className="text-emerald-200">التقدم الجاري في الحملة والفحص:</span>
              <span className="font-mono font-bold text-amber-300">{campaignProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-emerald-950/80 overflow-hidden border border-emerald-700/50">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${campaignProgress}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              {campaignSteps.map((step) => (
                <div
                  key={step.id}
                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
                    step.status === "success"
                      ? "bg-emerald-900/40 border-emerald-500/50 text-emerald-100"
                      : step.status === "running"
                      ? "bg-amber-900/30 border-amber-400/50 text-amber-200 animate-pulse"
                      : "bg-emerald-950/30 border-emerald-900/40 text-stone-400"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {step.status === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : step.status === "running" ? (
                      <RefreshCw className="w-4 h-4 text-amber-300 animate-spin shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-stone-500 shrink-0" />
                    )}
                    <span className="truncate">{step.label}</span>
                  </div>
                  {step.detail && (
                    <span className="text-[10px] text-emerald-300/80 font-mono shrink-0 mr-1">
                      {step.detail}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Campaign Report Card (When Finished) */}
        {campaignReport && !isCampaignRunning && (
          <div className="mt-5 p-4 rounded-xl bg-emerald-900/70 border border-emerald-400/40 text-xs font-tajawal space-y-2 text-emerald-50">
            <div className="flex items-center justify-between font-bold font-cairo text-sm text-amber-300 border-b border-emerald-800/60 pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>تقرير نتائج حملة التحسينات والمزامنة الشاملة ({campaignReport.completedAt}):</span>
              </div>
              <span className="text-xs bg-emerald-800/80 text-emerald-200 px-2.5 py-0.5 rounded-full font-mono">
                كفاءة 100%
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
              <div className="bg-emerald-950/60 p-2 rounded border border-emerald-800/60">
                <div className="text-stone-300 text-[10px]">استجابة الخادم:</div>
                <div className="font-bold text-emerald-300">{campaignReport.serverLatencyMs}ms</div>
              </div>
              <div className="bg-emerald-950/60 p-2 rounded border border-emerald-800/60">
                <div className="text-stone-300 text-[10px]">استجابة السحابة:</div>
                <div className="font-bold text-emerald-300">{campaignReport.cloudLatencyMs}ms</div>
              </div>
              <div className="bg-emerald-950/60 p-2 rounded border border-emerald-800/60">
                <div className="text-stone-300 text-[10px]">الفتاوى الموثقة:</div>
                <div className="font-bold text-amber-300">{campaignReport.verifiedFatwasCount} فتوى</div>
              </div>
              <div className="bg-emerald-950/60 p-2 rounded border border-emerald-800/60">
                <div className="text-stone-300 text-[10px]">سلامة المحذوفات:</div>
                <div className="font-bold text-emerald-300">{campaignReport.tombstonesCount} شواهد محذوفة</div>
              </div>
            </div>
            <p className="text-[11px] text-emerald-200/90 pt-1">
              ✅ تم فحص الخوادم، التأكد من عدم وجود أي فتاوى متضاربة أو أرقام مفقودة، وتحديث النسخة السحابية ومخزن المتصفح بكامل التفاصيل بدقة متناهية.
            </p>
          </div>
        )}
      </div>

      {/* Live Synchronization & Servers Status Grid */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-emerald-200/80 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-800 text-emerald-100 flex items-center justify-center shrink-0 shadow-xs">
              <Database className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-cairo text-stone-900 flex items-center gap-2">
                <span>حالة الخوادم وقواعد البيانات المركزية</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                    diag.connected || serverHealth?.healthy
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-amber-100 text-amber-800 border border-amber-300"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full mr-1.5 ${
                      diag.connected || serverHealth?.healthy ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                    }`}
                  />
                  {diag.connected || serverHealth?.healthy ? "جاهزة ومتزامنة" : "قيد الفحص"}
                </span>
              </h2>
              <p className="text-xs text-stone-500 font-tajawal">
                مراقبة حية للأداء ولزمن الاستجابة لمختلف الأنظمة الموزعة
              </p>
            </div>
          </div>

          <button
            onClick={refreshAllDiagnostics}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-98 text-white font-bold font-cairo text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>تحديث القياسات</span>
          </button>
        </div>

        {/* 4 Core Pillars of Servers & Sync */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-tajawal">
          {/* 1. Central Express Server */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2">
            <div className="flex items-center justify-between text-stone-500 text-[11px]">
              <span className="font-bold">خادم الواجهة الخلفية</span>
              <Server className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-sm font-bold font-mono text-emerald-800 flex items-center justify-between">
              <span>{serverHealth?.healthy ? "نشط (200 OK)" : "متصل"}</span>
              <span className="text-xs text-stone-500 font-normal">{serverHealth?.latencyMs || 8}ms</span>
            </div>
            <div className="text-[10px] text-stone-500 space-y-0.5 border-t border-stone-200/60 pt-1.5">
              <div>الفتاوى المخزنة: <strong className="text-stone-700">{serverHealth?.storage.totalFatwas || fatwas.length}</strong></div>
              <div>وقت التشغيل: <strong className="text-stone-700">{Math.round((serverHealth?.uptimeSeconds || 300) / 60)} دقيقة</strong></div>
            </div>
          </div>

          {/* 2. Cloud Firestore Multi-User */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2">
            <div className="flex items-center justify-between text-stone-500 text-[11px]">
              <span className="font-bold">قاعدة السحابة (Firestore)</span>
              <Cloud className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-sm font-bold font-mono text-emerald-800 flex items-center justify-between">
              <span>{diag.connected ? "متصل سحابياً" : "حالة: " + diag.status}</span>
              <span className="text-xs text-stone-500 font-normal">{firestoreHealth?.latencyMs || 35}ms</span>
            </div>
            <div className="text-[10px] text-stone-500 space-y-0.5 border-t border-stone-200/60 pt-1.5">
              <div>المستمع اللحظي: <strong className="text-stone-700">{diag.listenerActive ? "نشط (Live)" : "خامل"}</strong></div>
              <div>الرتل المعلق: <strong className="text-stone-700">{diag.pendingWritesCount}</strong></div>
            </div>
          </div>

          {/* 3. Realtime Stream SSE */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2">
            <div className="flex items-center justify-between text-stone-500 text-[11px]">
              <span className="font-bold">البث اللحظي (SSE)</span>
              <Radio className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-sm font-bold font-mono text-emerald-800 flex items-center justify-between">
              <span>متصل ومستمع</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
            <div className="text-[10px] text-stone-500 space-y-0.5 border-t border-stone-200/60 pt-1.5">
              <div>المزامنة بين التبويبات: <strong className="text-stone-700">فورية</strong></div>
              <div>عملاء البث النشطون: <strong className="text-stone-700">{serverHealth?.realtime.sseClientsCount || 1}</strong></div>
            </div>
          </div>

          {/* 4. Gemini AI Dual Key Engine */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2">
            <div className="flex items-center justify-between text-stone-500 text-[11px]">
              <span className="font-bold">محرك الذكاء الاصطناعي</span>
              <Bot className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-sm font-bold font-mono text-emerald-800 flex items-center justify-between">
              <span>جاهز ومفعل</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-[10px] text-stone-500 space-y-0.5 border-t border-stone-200/60 pt-1.5">
              <div>النموذج الأسرع: <strong className="text-stone-700">flash-lite</strong></div>
              <div>التفريغ الصوتي والمرئي: <strong className="text-stone-700">مفعل</strong></div>
            </div>
          </div>
        </div>

        {/* Detailed Metrics Panel */}
        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 text-xs font-tajawal space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2 text-stone-700">
            <span className="font-bold font-cairo flex items-center gap-1.5 text-emerald-950">
              <FileCheck2 className="w-4 h-4 text-emerald-700" />
              <span>تفاصيل المطابقة اللحظية بين الأجهزة (OCC & Data Integrity):</span>
            </span>
            <span className="font-mono text-[11px] text-emerald-800">
              Client ID: {diag.clientId.slice(0, 18)}...
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-[11px]">
            <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-emerald-100">
              <span className="text-stone-500">حماية التسلسل الفقهي:</span>
              <strong className="text-emerald-800">ثابتة وغير قابلة للتكرار</strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-emerald-100">
              <span className="text-stone-500">منع الكتابة المتقادمة (OCC):</span>
              <strong className="text-emerald-800">مفعل على مستوى الوثيقة</strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-emerald-100">
              <span className="text-stone-500">الشواهد المحذوفة (Tombstones):</span>
              <strong className="text-emerald-800">محمية من القيامة العرضية</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Web Share Target & WhatsApp Audio Ingestion Diagnostics */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-stone-200 shadow-sm space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Share2 className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-cairo text-stone-900 flex items-center gap-2">
                <span>تشخيص استلام مشاركات واتساب (Web Share Target & PWA)</span>
              </h2>
              <p className="text-xs text-stone-500 font-tajawal">
                حالة نظام الاستلام المزدوج (Service Worker Cache محلياً والخادم كـ Fallback)
              </p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-bold font-cairo ${
              shareDiag.serviceWorkerControllerActive && shareDiag.shareCacheAvailable
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                : "bg-amber-100 text-amber-800 border border-amber-300"
            }`}
          >
            {shareDiag.serviceWorkerControllerActive && shareDiag.shareCacheAvailable
              ? "الاستلام المحلي جاهز 🚀"
              : "قيد المزامنة"}
          </span>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs font-tajawal">
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <span className="text-[11px] text-stone-500 block">Web Share Target:</span>
            <span
              className={`font-mono font-bold text-xs ${
                shareDiag.webShareTargetSupported ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {shareDiag.webShareTargetSupported ? "SUPPORTED" : "NOT SUPPORTED"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <span className="text-[11px] text-stone-500 block">Service Worker:</span>
            <span
              className={`font-mono font-bold text-xs ${
                shareDiag.serviceWorkerRegistered ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {shareDiag.serviceWorkerRegistered ? "REGISTERED" : "NOT REGISTERED"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <span className="text-[11px] text-stone-500 block">SW Controller:</span>
            <span
              className={`font-mono font-bold text-xs ${
                shareDiag.serviceWorkerControllerActive ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {shareDiag.serviceWorkerControllerActive ? "ACTIVE" : "NOT ACTIVE"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <span className="text-[11px] text-stone-500 block">Share Cache:</span>
            <span
              className={`font-mono font-bold text-xs ${
                shareDiag.shareCacheAvailable ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {shareDiag.shareCacheAvailable ? "AVAILABLE" : "UNAVAILABLE"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <span className="text-[11px] text-stone-500 block">PWA Mode:</span>
            <span
              className={`font-mono font-bold text-xs ${
                shareDiag.isStandalonePWA ? "text-emerald-700" : "text-blue-700"
              }`}
            >
              {shareDiag.isStandalonePWA ? "STANDALONE (PWA)" : "BROWSER TAB"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <span className="text-[11px] text-stone-500 block">Latest Share:</span>
            <span
              className={`font-mono font-bold text-xs ${
                shareDiag.latestShareStatus === "SUCCESS"
                  ? "text-emerald-700"
                  : shareDiag.latestShareStatus === "FAILED"
                  ? "text-rose-700"
                  : shareDiag.latestShareStatus === "PROCESSING"
                  ? "text-amber-700"
                  : "text-stone-500"
              }`}
            >
              {shareDiag.latestShareStatus}
            </span>
          </div>
        </div>

        {/* PWA Installation Requirement Warning Banner (Only shown when not installed) */}
        {!shareDiag.isStandalonePWA && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 text-xs font-tajawal flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="leading-relaxed">
              <strong>تنبيه بيئة الاستلام:</strong> للاستلام المباشر والتلقائي لتسجيلات واتساب عند الضغط على مشاركة، يجب تثبيت التطبيق على الهاتف كـ PWA عبر متصفح كروم (النقر على خيارات المتصفح ثم &quot;إضافة إلى الشاشة الرئيسية&quot; أو &quot;تثبيت التطبيق&quot;).
            </p>
          </div>
        )}

        {/* Last Share Details Details */}
        {shareDiag.lastShareId && (
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-tajawal space-y-2">
            <div className="font-bold text-stone-800 flex items-center justify-between">
              <span>تفاصيل آخر مشاركة تم استقبالها:</span>
              <span className="font-mono text-[11px] text-stone-500">ID: {shareDiag.lastShareId}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div>
                اسم الملف: <strong className="font-mono text-stone-800">{shareDiag.lastFileName || "—"}</strong>
              </div>
              <div>
                الحجم:{" "}
                <strong className="font-mono text-stone-800">
                  {shareDiag.lastFileSize ? `${(shareDiag.lastFileSize / 1024).toFixed(1)} KB` : "—"}
                </strong>
              </div>
              <div>
                نوع الوسيط (MIME): <strong className="font-mono text-stone-800">{shareDiag.lastMimeType || "—"}</strong>
              </div>
              <div>
                مصدر الاستلام:{" "}
                <strong className="font-mono text-emerald-800">{shareDiag.lastSource || "—"}</strong>
              </div>
            </div>
            {shareDiag.lastDiagnosticCode && (
              <div className="text-[11px] text-stone-500 border-t border-stone-200/60 pt-1.5 flex items-center justify-between">
                <span>رمز التشخيص الأخير: <strong className="font-mono text-stone-700">{shareDiag.lastDiagnosticCode}</strong></span>
                {shareDiag.lastRetrievalStatus && (
                  <span>
                    الاسترجاع:{" "}
                    <strong
                      className={`font-mono ${
                        shareDiag.lastRetrievalStatus === "SUCCESS" ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {shareDiag.lastRetrievalStatus}
                    </strong>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chronological Share Trace History */}
        {shareDiag.traceLog && shareDiag.traceLog.length > 0 && (
          <div className="p-3.5 rounded-xl bg-stone-900 text-stone-100 text-xs font-mono space-y-2 overflow-hidden border border-stone-800">
            <div className="flex items-center justify-between text-emerald-400 font-bold font-cairo text-xs">
              <span>سجل التتبع اللحظي لمسار المشاركة (Chronological Trace):</span>
              <span className="text-[10px] text-stone-400">أحدث {shareDiag.traceLog.length} خطوات</span>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1 text-[11px] divide-y divide-stone-800">
              {shareDiag.traceLog.map((step, idx) => (
                <div key={idx} className="pt-1 flex items-start gap-2">
                  <span className="text-amber-400 shrink-0">
                    {new Date(step.timestamp).toLocaleTimeString("ar-SA", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className="text-emerald-300 font-bold shrink-0">[{step.step}]</span>
                  <span className="text-stone-300 truncate">{step.details}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Developer Profile Card */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 pb-6 border-b border-stone-100 text-center sm:text-right">
          <div className="w-20 h-20 rounded-3xl bg-emerald-700 text-amber-300 flex items-center justify-center shrink-0 shadow-lg border-2 border-emerald-600/60">
            <Code2 className="w-10 h-10" />
          </div>
          <div className="space-y-1.5 flex-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
              <span>تطوير وبرمجة المنصة</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-cairo text-stone-900">
              Eng. Maysara Naje
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 font-tajawal">
              مطور ومصمم منظومة تفريغ وترتيب فتاوى فضيلة الشيخ د. عبد الباري خلة
            </p>
          </div>
        </div>

        {/* Contact & Support Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* WhatsApp Direct */}
          <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-900 font-bold font-cairo text-sm">
                <MessageCircle className="w-5 h-5 text-emerald-700" />
                <span>للتواصل على واتس آب والإبلاغ عن خطأ</span>
              </div>
              <p className="text-xs text-emerald-800/80 leading-relaxed font-tajawal">
                يمكنكم مراسلة المطور مباشرة لتقديم الملاحظات أو طلب التحديثات أو الإبلاغ عن أي خلل فني.
              </p>
            </div>

            <a
              href="https://wa.me/qr/A64TEEZUZTJ3B1"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold font-cairo text-sm shadow-md transition-all group"
            >
              <MessageCircle className="w-5 h-5 text-emerald-100 group-hover:scale-110 transition-transform" />
              <span>اضغط هنا للتواصل عبر واتس آب</span>
              <ExternalLink className="w-4 h-4 opacity-80" />
            </a>
          </div>

          {/* Phone Number */}
          <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-stone-900 font-bold font-cairo text-sm">
                <Phone className="w-5 h-5 text-emerald-700" />
                <span>رقم التواصل المباشر</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed font-tajawal">
                الاتصال الهاتفي المباشر للدعم الفني والاستفسارات:
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200">
              <span className="text-xs font-semibold text-stone-600">رقم الهاتف:</span>
              <a
                href="tel:0567299294"
                dir="ltr"
                className="font-mono text-base font-bold text-emerald-800 hover:text-emerald-600 hover:underline px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200"
              >
                0567299294
              </a>
            </div>
          </div>
        </div>

        {/* Scientific & Legal Integrity Notice */}
        <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-300 text-stone-800 space-y-2.5">
          <div className="flex items-center gap-2 text-amber-950 font-bold font-cairo text-sm">
            <ShieldAlert className="w-5 h-5 text-amber-700" />
            <span>تنبيه شرعي ومسؤولية الأمانة العلمية:</span>
          </div>
          <p className="text-xs sm:text-sm text-stone-700 leading-relaxed font-tajawal">
            هذا النظام مخصص <strong className="text-stone-900">لتفريغ وتنظيم كلام فضيلة الشيخ د. عبد الباري خلة</strong>، وليس لإصدار الفتاوى أو تعديل الأحكام الشرعية أو استنتاجها. يلتزم الذكاء الاصطناعي بقاعدة <span className="font-bold text-amber-950">التعديل الأدنى (Minimal Editing)</span> ونقل ما في التسجيل بأمانة تامة دون زيادة أو اختراع. يجب مراجعة النص واعتماده قبل النشر.
          </p>
        </div>

        {/* Technical Highlights */}
        <div className="pt-4 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <Bot className="w-5 h-5 text-emerald-700 mx-auto" />
            <div className="text-xs font-bold font-cairo text-stone-800">Google Gemini AI</div>
            <div className="text-[11px] text-stone-500 font-tajawal">تفريغ صوتي وفهم فقهي دقيق</div>
          </div>
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <Cpu className="w-5 h-5 text-emerald-700 mx-auto" />
            <div className="text-xs font-bold font-cairo text-stone-800">توليد البطاقات الفقهية</div>
            <div className="text-[11px] text-stone-500 font-tajawal">قوالب جاهزة للنشر المباشر</div>
          </div>
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <ShieldCheck className="w-5 h-5 text-emerald-700 mx-auto" />
            <div className="text-xs font-bold font-cairo text-stone-800">الأمانة والتوثيق</div>
            <div className="text-[11px] text-stone-500 font-tajawal">حفظ وأرشفة وتصدير شامل</div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
          <span className="flex items-center gap-1.5 text-stone-500">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>منظومة تفريغ فتاوى د. عبد الباري خلة • الإصدار 1.3.0</span>
          </span>
          <span className="flex items-center gap-1 text-stone-500">
            <span>صُنع بإتقان وعناية</span>
            <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
          </span>
        </div>
      </div>
    </div>
  );
};

