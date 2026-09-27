import React, { useEffect, useState } from "react";

/**
 * PWADiagnostics — صفحة تشخيص قابلية التثبيت، بديل عن chrome://inspect
 * لمن ليس لديه كمبيوتر. تُقرأ من الهاتف مباشرة وتُنسخ كنص للمطوّر.
 *
 * الوصول: أضف ?diag=1 لأي رابط بالموقع، مثال:
 *   https://khilla.ai.studio/?diag=1
 */

interface CheckResult {
  label: string;
  status: "ok" | "warn" | "fail" | "info";
  detail: string;
}

async function checkUrl(url: string): Promise<{ ok: boolean; status: number; contentType: string }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") || "(بدون Content-Type)",
    };
  } catch (err) {
    return { ok: false, status: 0, contentType: `فشل الجلب: ${String(err)}` };
  }
}

export const PWADiagnostics: React.FC = () => {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [promptFired, setPromptFired] = useState<boolean | null>(null);
  const [reportText, setReportText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onPrompt = () => setPromptFired(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    const timer = setTimeout(() => setPromptFired((v) => v ?? false), 4000);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const results: CheckResult[] = [];

      results.push({
        label: "البروتوكول",
        status: location.protocol === "https:" ? "ok" : "fail",
        detail: location.protocol,
      });

      results.push({
        label: "وضع العرض الحالي",
        status: window.matchMedia("(display-mode: standalone)").matches ? "info" : "info",
        detail: window.matchMedia("(display-mode: standalone)").matches
          ? "standalone (مثبّت بالفعل ويعمل كتطبيق)"
          : "browser (يعمل داخل المتصفح، غير مثبّت)",
      });

      const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      results.push({
        label: "وسم <link rel=manifest>",
        status: manifestLink ? "ok" : "fail",
        detail: manifestLink ? manifestLink.href : "غير موجود بالصفحة",
      });

      if (manifestLink) {
        const m = await checkUrl(manifestLink.href);
        results.push({
          label: "جلب ملف المانيفست",
          status: m.ok ? "ok" : "fail",
          detail: `HTTP ${m.status} — Content-Type: ${m.contentType}`,
        });

        if (m.ok) {
          try {
            const res = await fetch(manifestLink.href, { cache: "no-store" });
            const json = await res.json();
            results.push({
              label: "صحة JSON بالمانيفست",
              status: "ok",
              detail: `name: ${json.name || "-"} | icons: ${(json.icons || []).length} | share_target: ${json.share_target ? "موجود" : "غير موجود"}`,
            });
            for (const icon of json.icons || []) {
              const iconUrl = new URL(icon.src, location.origin).href;
              const ic = await checkUrl(iconUrl);
              results.push({
                label: `أيقونة ${icon.sizes || ""}`,
                status: ic.ok && ic.contentType.includes("image") ? "ok" : "fail",
                detail: `${iconUrl} — HTTP ${ic.status} — ${ic.contentType}`,
              });
            }
          } catch (err) {
            results.push({ label: "صحة JSON بالمانيفست", status: "fail", detail: `تعذر تحليل JSON: ${String(err)}` });
          }
        }
      }

      const sw = await checkUrl("/sw.js");
      results.push({
        label: "جلب sw.js",
        status: sw.ok ? "ok" : "fail",
        detail: `HTTP ${sw.status} — Content-Type: ${sw.contentType}`,
      });

      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (regs.length === 0) {
          results.push({ label: "تسجيل Service Worker", status: "fail", detail: "لا يوجد أي تسجيل نشط" });
        } else {
          regs.forEach((r, i) => {
            const active = r.active ? "active" : r.installing ? "installing" : r.waiting ? "waiting" : "غير معروف";
            results.push({
              label: `Service Worker #${i + 1}`,
              status: r.active ? "ok" : "warn",
              detail: `scope: ${r.scope} — الحالة: ${active} — script: ${r.active?.scriptURL || "-"}`,
            });
          });
        }
      } else {
        results.push({ label: "دعم Service Worker", status: "fail", detail: "المتصفح لا يدعمه إطلاقاً" });
      }

      if ("caches" in window) {
        const keys = await caches.keys();
        results.push({
          label: "Cache Storage",
          status: "info",
          detail: keys.length ? keys.join(", ") : "فارغ حالياً",
        });
      }

      results.push({
        label: "User agent",
        status: "info",
        detail: navigator.userAgent,
      });

      setChecks(results);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    const lines = [
      `تقرير تشخيص PWA — ${new Date().toLocaleString("ar")}`,
      `الرابط: ${location.href}`,
      `حدث beforeinstallprompt: ${promptFired === null ? "قيد الانتظار" : promptFired ? "أُطلق ✓" : "لم يُطلق خلال 4 ثوانٍ ✗"}`,
      "",
      ...checks.map((c) => `[${c.status.toUpperCase()}] ${c.label}: ${c.detail}`),
    ];
    setReportText(lines.join("\n"));
  }, [checks, loading, promptFired]);

  const statusColor: Record<CheckResult["status"], string> = {
    ok: "text-emerald-700 bg-emerald-50 border-emerald-200",
    warn: "text-amber-700 bg-amber-50 border-amber-200",
    fail: "text-red-700 bg-red-50 border-red-200",
    info: "text-stone-600 bg-stone-50 border-stone-200",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 p-4 font-tajawal" dir="rtl">
      <h1 className="text-lg font-bold font-cairo text-stone-900">تشخيص قابلية التثبيت (PWA)</h1>

      <div
        className={`rounded-xl border p-3 text-sm ${
          promptFired === null
            ? "bg-stone-50 border-stone-200 text-stone-600"
            : promptFired
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}
      >
        <strong>حدث beforeinstallprompt: </strong>
        {promptFired === null ? "قيد الانتظار..." : promptFired ? "أُطلق ✓ — كروم اعتبر الموقع قابلاً للتثبيت" : "لم يُطلق ✗ — كروم لم يعتبر الموقع قابلاً للتثبيت حتى الآن"}
      </div>

      {loading ? (
        <p className="text-sm text-stone-500">جارٍ الفحص...</p>
      ) : (
        <div className="space-y-2">
          {checks.map((c, i) => (
            <div key={i} className={`rounded-lg border p-2.5 text-xs ${statusColor[c.status]}`}>
              <div className="font-bold">{c.label}</div>
              <div className="mt-0.5 break-all">{c.detail}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(reportText).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="w-full py-3 rounded-xl bg-[#0c392c] text-white font-bold text-sm"
        >
          {copied ? "تم النسخ ✓" : "نسخ التقرير الكامل لإرساله"}
        </button>
      )}
    </div>
  );
};

export default PWADiagnostics;
