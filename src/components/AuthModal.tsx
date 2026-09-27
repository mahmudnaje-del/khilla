import React, { useState } from "react";
import { Lock, Unlock, ShieldCheck, X, AlertCircle } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isAuthenticated: boolean;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isAuthenticated,
  onLogout,
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Default demo passcode for editor gate (1234 or any input)
    if (pin === "1234" || pin === "sheikh" || pin.trim().length >= 4) {
      onSuccess();
      setError(null);
      setPin("");
      onClose();
    } else {
      setError("رمز الدخول غير صحيح. يرجى إدخال 4 أرقام أو أكثر (الرمز الافتراضي: 1234).");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-xs">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-stone-200 relative animate-in fade-in zoom-in duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto mb-3">
            {isAuthenticated ? <Unlock className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
          </div>
          <h3 className="text-lg font-bold font-cairo text-stone-900">
            {isAuthenticated ? "لوحة التحرير موثقة" : "تسجيل دخول محرر الفتاوى"}
          </h3>
          <p className="text-xs text-stone-500 font-tajawal">
            حماية خصوصية التسجيلات الصوتية ومسودات الفتاوى غير المعتمدة
          </p>
        </div>

        {isAuthenticated ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="font-bold font-cairo">أنت مسجل حالياً بصلاحية محرر معتمد</div>
              <p className="text-stone-600">يمكنك اعتماد وتعديل كافة الفتاوى وحذفها بحرية.</p>
            </div>
            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl bg-red-50 text-red-700 font-bold text-xs hover:bg-red-100 transition-colors border border-red-200"
            >
              تسجيل الخروج
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-700 block">
                رمز مرور المحرر (PIN):
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="أدخل رمز المرور (افتراضي: 1234)"
                autoFocus
                className="w-full p-3 rounded-xl border border-stone-300 bg-stone-50 text-stone-900 text-center font-mono text-lg tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold font-cairo text-sm shadow-sm transition-all"
            >
              تأكيد الدخول
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
