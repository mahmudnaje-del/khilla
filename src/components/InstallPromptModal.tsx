import React, { useEffect, useState } from "react";
import { Download, Sparkles, X, Smartphone, ArrowRight, Share2, PlusSquare, MoreVertical, CheckCircle2 } from "lucide-react";

interface InstallPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallPromptModal: React.FC<InstallPromptModalProps> = ({ isOpen, onClose }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  useEffect(() => {
    // Check if already installed in standalone mode
    const checkStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
    setIsStandalone(!!checkStandalone);

    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua);
    setIsIOS(iosDevice);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    window.addEventListener("appinstalled", () => {
      setInstallSuccess(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setInstallSuccess(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error("Install prompt error:", err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-tajawal animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200/80 overflow-hidden text-right my-auto">
        {/* Modal Header */}
        <div className="bg-[#0c392c] text-white p-4 sm:p-5 flex items-center justify-between relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-950 border border-amber-300/60 flex items-center justify-center overflow-hidden shadow-xs shrink-0">
              <img src="/icon-app.png" alt="أيقونة التطبيق" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/site-logo.png"; }} />
            </div>
            <div>
              <h3 className="text-base font-bold font-cairo">تثبيت التطبيق على الجوال</h3>
              <p className="text-xs text-emerald-200/80 font-tajawal">مفرّغ فتاوى د. عبد الباري خلة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-stone-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4">
          {isStandalone || installSuccess ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-stone-900 font-cairo text-base">التطبيق مثبت وجاهز للاستخدام!</h4>
              <p className="text-xs text-stone-600 leading-relaxed max-w-xs mx-auto">
                يمكنك الآن فتح التطبيق مباشرة من الشاشة الرئيسية، ومشاركة التسجيلات الصوتية من واتساب إليه مباشرة.
              </p>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[#0c392c] text-white font-bold text-xs shadow-md mt-2"
              >
                حسناً، متابعة
              </button>
            </div>
          ) : (
            <>
              {/* Direct Install Trigger if prompt is ready */}
              {deferredPrompt && (
                <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs font-cairo">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>تثبيت مباشر بنقرة واحدة</span>
                  </div>
                  <p className="text-[11px] text-emerald-800/80 leading-relaxed">
                    متصفحك يدعم التثبيت المباشر الفوري الآن على شاشة هاتفك.
                  </p>
                  <button
                    onClick={handleInstallClick}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all active:scale-98"
                  >
                    <Download className="w-4 h-4" />
                    <span>تثبيت التطبيق الآن</span>
                  </button>
                </div>
              )}

              {/* Instructions if user selects Create Shortcut / Manual Add */}
              <div className="space-y-3">
                <h4 className="font-bold text-xs text-stone-800 font-cairo flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#0c392c]" />
                  <span>طريقة إضافة التطبيق للشاشة الرئيسية:</span>
                </h4>

                {isIOS ? (
                  /* iOS Safari Instructions */
                  <div className="space-y-2.5 text-xs text-stone-700 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#0c392c] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <p className="leading-snug">
                        اضغط على زر المشاركة <Share2 className="w-3.5 h-3.5 inline mx-0.5 text-blue-600" /> أسفل متصفح Safari.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#0c392c] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <p className="leading-snug">
                        اختر <strong>"إضافة إلى الصفحة الرئيسية"</strong> (Add to Home Screen) <PlusSquare className="w-3.5 h-3.5 inline mx-0.5 text-stone-600" />.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#0c392c] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <p className="leading-snug">اضغط على <strong>"إضافة" (Add)</strong> في الزاوية العلوية.</p>
                    </div>
                  </div>
                ) : (
                  /* Android Chrome Instructions */
                  <div className="space-y-2.5 text-xs text-stone-700 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#0c392c] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <p className="leading-snug">
                        اضغط على قائمة الثلاث نقاط <MoreVertical className="w-3.5 h-3.5 inline mx-0.5 text-stone-700" /> في أعلى يسار متصفح Chrome.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#0c392c] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <p className="leading-snug">
                        اختر <strong>"إنشاء اختصار"</strong> (Create shortcut) أو <strong>"الإضافة إلى الشاشة الرئيسية"</strong>.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#0c392c] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <p className="leading-snug">
                        اضغط <strong>"إضافة"</strong> وسيظهر التطبيق بأيقونته الرسمية على هاتفك كأي تطبيق أصيل!
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Share from WhatsApp Benefit Banner */}
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900/90 leading-relaxed flex items-start gap-2">
                <span className="text-sm">💡</span>
                <span>
                  <strong>ميزة مهمة:</strong> بعد التثبيت أو إضافة الاختصار، يمكنك تحديد أي تسجيل صوتي في واتساب ثم الضغط على <strong>مشاركة ➔ مفرّغ الفتاوى</strong> ليبدأ تفريغه فوراً دون حفظ الملف يدوياً!
                </span>
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition-colors"
              >
                إغلاق
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
