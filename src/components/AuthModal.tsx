import React, { useState } from "react";
import {
  Lock,
  Unlock,
  ShieldCheck,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck,
  KeyRound,
  ArrowRight,
} from "lucide-react";
import { verifyAndSaveEditorSecrets, revokeEditorAuthorization } from "../utils/editorAuth";
import { getAdminSession } from "../utils/adminApi";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isAuthenticated: boolean;
  onLogout: () => void;
  title?: string;
  subtitle?: string;
  showCancelReturnToPublic?: boolean;
  onReturnToPublic?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isAuthenticated,
  onLogout,
  title,
  subtitle,
  showCancelReturnToPublic = false,
  onReturnToPublic,
}) => {
  const [secret1, setSecret1] = useState("");
  const [secret2, setSecret2] = useState("");
  const [showSecret2, setShowSecret2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentSession = getAdminSession();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const s1 = secret1.trim();
    const s2 = secret2.trim();

    if (!s1 || !s2) {
      setError("يرجى إدخال حساب المحررين وكلمة السر للدخول");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await verifyAndSaveEditorSecrets(s1, s2);
      if (res.success) {
        setError(null);
        setSecret1("");
        setSecret2("");
        onSuccess();
        onClose();
      } else {
        setError(res.error || "حساب المحررين أو كلمة السر غير صحيحة. يرجى التأكد من البيانات والمحاولة مجدداً.");
      }
    } catch (err: any) {
      setError(err?.message || "حدث خطأ أثناء التحقق من بيانات الدخول");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoutAction = () => {
    revokeEditorAuthorization();
    onLogout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl border border-stone-200 relative animate-in zoom-in-95 duration-150 text-right font-tajawal max-h-[92vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          type="button"
          aria-label="إغلاق النافذة"
          className="absolute top-4 left-4 p-2 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2 mb-6 pt-1">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-[#0c392c] text-amber-300 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-900/20 border-2 border-amber-300/40">
            {isAuthenticated ? (
              <ShieldCheck className="w-7 h-7" />
            ) : (
              <KeyRound className="w-7 h-7" />
            )}
          </div>
          <h3 className="text-lg sm:text-xl font-bold font-cairo text-stone-900 leading-tight">
            {title || (isAuthenticated ? "لوحة المحررين موثقة" : "الدخول إلى لوحة المحررين")}
          </h3>
          <p className="text-xs text-stone-500 font-tajawal max-w-xs mx-auto leading-relaxed">
            {subtitle ||
              "يُرجى إدخال حساب المحررين وكلمة السر للوصول إلى غرفة التحرير."}
          </p>
        </div>

        {isAuthenticated ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 space-y-2">
              <div className="flex items-center gap-2 font-bold font-cairo text-sm text-emerald-950">
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                <span>أنت مسجل حالياً بصلاحية محرر معتمد</span>
              </div>
              <p className="text-stone-600 leading-relaxed">
                تم التحقق من القيم السرية وتوثيق هذا المتصفح. يمكنك تفريغ الفتاوى واعتمادها وتعديلها بحرية كاملة دون الحاجة لإعادة إدخالها.
              </p>
              {currentSession?.user && (
                <div className="mt-2 pt-2 border-t border-emerald-200/80 text-[11px] text-emerald-800 font-mono flex items-center justify-between">
                  <span>المحرر: {currentSession.user.name}</span>
                  <span className="font-sans font-bold bg-emerald-100 px-2 py-0.5 rounded">موثق</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold font-cairo text-sm shadow-sm transition-all cursor-pointer"
              >
                متابعة العمل في اللوحة
              </button>
              <button
                type="button"
                onClick={handleLogoutAction}
                className="w-full py-2.5 rounded-xl bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-700 font-bold text-xs transition-colors border border-stone-200 hover:border-red-200 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>تسجيل الخروج وقفل اللوحة مجدداً</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Secret Value 1 - حساب المحررين */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">
                حساب المحررين
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={secret1}
                  onChange={(e) => setSecret1(e.target.value)}
                  placeholder="حساب المحررين"
                  autoFocus
                  autoComplete="off"
                  className="w-full py-2.5 px-3.5 pl-10 rounded-xl border border-stone-300 bg-stone-50 text-stone-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
                <UserCheck className="w-4 h-4 text-stone-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* Secret Value 2 - كلمة السر */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">
                كلمة السر
              </label>
              <div className="relative">
                <input
                  type={showSecret2 ? "text" : "password"}
                  value={secret2}
                  onChange={(e) => setSecret2(e.target.value)}
                  placeholder="كلمة السر"
                  autoComplete="off"
                  className="w-full py-2.5 px-3.5 pl-10 rounded-xl border border-stone-300 bg-stone-50 text-stone-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret2(!showSecret2)}
                  className="absolute left-3 top-2.5 text-stone-400 hover:text-stone-700 p-0.5 cursor-pointer"
                  title={showSecret2 ? "إخفاء الرمز" : "إظهار الرمز"}
                >
                  {showSecret2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#0c392c] to-emerald-700 hover:from-emerald-800 hover:to-emerald-600 text-white font-bold font-cairo text-sm shadow-md shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Unlock className="w-4 h-4 text-amber-300" />
              <span>{isSubmitting ? "جاري التحقق..." : "تأكيد الدخول"}</span>
            </button>

            {/* Optional return to public platform button */}
            {showCancelReturnToPublic && onReturnToPublic && (
              <button
                type="button"
                onClick={onReturnToPublic}
                className="w-full py-2 text-center text-xs text-stone-500 hover:text-stone-800 transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>العودة إلى التصفح العام للفتاوى</span>
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
