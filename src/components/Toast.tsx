import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  text: string;
  type?: "success" | "error" | "info" | "warning";
}

interface ToastProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 left-3 right-3 sm:left-auto sm:right-6 sm:w-auto sm:max-w-md z-50 flex flex-col gap-2 pointer-events-none items-center sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto w-full sm:w-auto p-3 sm:p-3.5 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-xs sm:text-sm font-tajawal animate-in fade-in slide-in-from-top-3 duration-200 backdrop-blur-md ${
            t.type === "error"
              ? "bg-red-950/95 text-red-50 border-red-800/90 shadow-red-950/30"
              : t.type === "warning"
              ? "bg-amber-950/95 text-amber-50 border-amber-700/90 shadow-amber-950/30"
              : t.type === "info"
              ? "bg-stone-900/95 text-stone-100 border-stone-700/80 shadow-stone-950/30"
              : "bg-[#0c392c]/95 text-emerald-50 border-emerald-700/80 shadow-emerald-950/30"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {t.type === "error" ? (
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 shrink-0" />
            ) : t.type === "warning" ? (
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
            ) : t.type === "info" ? (
              <Info className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
            )}
            <span className="leading-snug text-xs sm:text-sm font-medium break-words">
              {t.text}
            </span>
          </div>

          <button
            onClick={() => onRemove(t.id)}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/70 hover:text-white transition-colors shrink-0"
            title="إغلاق"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
