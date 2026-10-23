import React, { useState } from "react";
import {
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  X,
  Sparkles,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { upgradeSupervisorWithPassword, SupervisorSession } from "../utils/supervisorAuth";
import confetti from "canvas-confetti";

interface SupervisorUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (session: SupervisorSession) => void;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
}

export const SupervisorUpgradeModal: React.FC<SupervisorUpgradeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = password.trim();
    if (!cleanPass) {
      setErrorMessage("يرجى إدخال كلمة سر المشرف للمتابعة");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await upgradeSupervisorWithPassword(cleanPass);
      if (result.success && result.session) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
        showToast?.(
          "تمت ترقية حسابك إلى مشرف ناشر معتمد بنجاح! فُتحت الآن صلاحيات النشر والإلغاء المباشر في فايرستور 🚀",
          "success"
        );
        setPassword("");
        onSuccess(result.session);
        onClose();
      } else {
        setErrorMessage(result.error || "كلمة السر غير صحيحة. يرجى التأكد والمحاولة مجدداً.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "حدث خطأ غير متوقع أثناء الاتصال بالخادم.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden text-right font-tajawal animate-in zoom-in-95 duration-200">
        {/* Header with Emerald Gradient */}
        <div className="bg-gradient-to-r from-[#0c392c] to-[#062018] text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute left-4 top-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-stone-200 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-300/40 text-amber-300 flex items-center justify-center shadow-inner">
              <KeyRound className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-stone-950">
                <Sparkles className="w-3 h-3" />
                صلاحيات المشرف الناشر
              </span>
              <h3 className="text-lg font-bold font-cairo text-white mt-1">
                ترقية حساب المشرف إلى «مشرف ناشر»
              </h3>
            </div>
          </div>
          <p className="text-xs text-stone-300 mt-2 leading-relaxed">
            المشرف العادي يمتلك صلاحيات (التفريغ، التعديل، والاعتماد). لترقية الحساب إلى «مشرف ناشر» وإتاحة نشر وسحب الفتاوى في فايرستور، أدخل كلمة السر السرية المخصصة.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold font-cairo block">{errorMessage}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700 font-cairo mb-1.5">
              كلمة السر السرية للمشرف الناشر:
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة السر السرية الخاصة بالنشر..."
                autoFocus
                className="w-full px-4 py-3 pl-11 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all text-stone-900 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-3.5 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                title={showPassword ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-stone-500 mt-1.5">
              * تنبيه: كلمة مرور الدخول العادية لا تمنح صلاحيات النشر، يلزم كلمة السر السرية المخصصة للناشر.
            </p>
          </div>

          {/* الفصل الصريح بين الرتبتين */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
              <div className="font-bold text-stone-700 flex items-center gap-1 font-cairo">
                <span className="w-2 h-2 rounded-full bg-stone-400"></span>
                <span>المشرف العادي:</span>
              </div>
              <ul className="text-stone-500 space-y-0.5 text-[10px] list-disc list-inside">
                <li>تفريغ التسجيلات</li>
                <li>تعديل وتنقيح النصوص</li>
                <li>اعتماد الفتوى بالأرشيف</li>
              </ul>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-300/60 space-y-1">
              <div className="font-bold text-amber-900 flex items-center gap-1 font-cairo">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>مشرف ناشر (مطلوب كلمة سر):</span>
              </div>
              <ul className="text-amber-900/80 space-y-0.5 text-[10px] list-disc list-inside">
                <li>نشر مباشر في فايرستور</li>
                <li>إتاحة الفتاوى للقراء</li>
                <li>سحب وإلغاء أي فتوى</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 font-cairo text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-amber-300 font-cairo text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جارٍ التحقق والترقية...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>تأكيد الترقية وفتح النشر</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
