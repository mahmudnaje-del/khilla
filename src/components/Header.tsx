import React, { useState, useRef } from "react";
import {
  Mic,
  ShieldCheck,
  BookOpen,
  Layers,
  Image as ImageIcon,
  PlusCircle,
  CheckCircle2,
  Lock,
  Unlock,
  Menu,
  X,
  ChevronRight,
  Code2,
  Download,
  Smartphone,
  Eye,
  EyeOff,
  KeyRound,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { loginAdmin, setAdminSession } from "../utils/adminApi";
import { EDITOR_AUTH_KEY } from "../utils/editorAuth";

interface HeaderProps {
  activeTab: "transcribe" | "review" | "card" | "archive" | "stats" | "developer" | "admin";
  setActiveTab: (tab: "transcribe" | "review" | "card" | "archive" | "stats" | "developer" | "admin") => void;
  strictMode: boolean;
  setStrictMode: (val: boolean) => void;
  isAuthenticated: boolean;
  setIsAuthModalOpen: (val: boolean) => void;
  onNewFatwa: () => void;
  pendingReviewCount: number;
  onOpenInstallModal?: () => void;
  onFetchAllUserFatwas?: () => Promise<void>;
  isFetchingAllUsersFatwas?: boolean;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
  isFirestoreConnected?: boolean;
  syncStatus?: "initializing" | "connecting" | "synced" | "offline" | "error" | "permission-denied" | "quota-exceeded";
  pendingWritesCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  strictMode,
  setStrictMode,
  isAuthenticated,
  setIsAuthModalOpen,
  onNewFatwa,
  pendingReviewCount,
  onOpenInstallModal,
  onFetchAllUserFatwas,
  isFetchingAllUsersFatwas,
  showToast,
  isFirestoreConnected = true,
  syncStatus = "synced",
  pendingWritesCount = 0,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    {
      id: "stats" as const,
      label: "لوحة التحكم",
      subLabel: "Dashboard",
      icon: Layers,
    },
    {
      id: "transcribe" as const,
      label: "تفريغ الفتوى",
      subLabel: "New Transcribe",
      icon: Mic,
    },
    {
      id: "review" as const,
      label: "المراجعة والتنقيح",
      subLabel: "Review",
      icon: CheckCircle2,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    {
      id: "archive" as const,
      label: "أرشيف الفتاوى",
      subLabel: "Fatwa Archive",
      icon: BookOpen,
    },
    {
      id: "card" as const,
      label: "قوالب الصور",
      subLabel: "Image Templates",
      icon: ImageIcon,
    },
    {
      id: "admin" as const,
      label: "لوحة الإدارة والتصحيح",
      subLabel: "Fix & Resequence",
      icon: ShieldCheck,
    },
    {
      id: "developer" as const,
      label: "عن المطور",
      subLabel: "About Developer",
      icon: Code2,
    },
  ];

  // Handle double click or double tap to open Admin Password Modal
  const clickTimerRef = useRef<any>(null);
  const clickCountRef = useRef<number>(0);

  // Handle clicking on Sheikh's avatar to navigate to Admin Portal (لوحة الإدارة وتصحيح الأرقام والأخطاء)
  const handleSheikhImageClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setActiveTab("admin");
  };

  return (
    <>
      {/* Desktop Sidebar (Right-aligned in RTL) */}
      <aside className="hidden lg:flex flex-col justify-between w-64 xl:w-[280px] bg-gradient-to-b from-[#0c392c] to-[#062018] text-stone-100 border-l border-emerald-900/60 shrink-0 min-h-screen fixed right-0 top-0 bottom-0 z-40 shadow-2xl overflow-y-auto custom-scrollbar">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20 pointer-events-none mix-blend-overlay"></div>
        <div className="p-6 space-y-7 relative z-10">
          {/* Brand Header with Sheikh's Icon & Site Icon */}
          <div
            className="flex items-center gap-3.5 select-none group"
          >
            {/* 1. Sheikh's Icon (Avatar) */}
            <div
              className="w-13 h-13 rounded-full bg-[#f6f2e9] text-[#0c392c] flex items-center justify-center font-amiri font-bold shadow-[0_0_15px_rgba(212,175,55,0.25)] border-2 border-amber-300/80 group-hover:border-amber-300 group-hover:scale-105 transition-all duration-300 shrink-0 overflow-hidden relative cursor-pointer active:scale-95"
              title="أيقونة فضيلة الشيخ د. عبد الباري خلة (انقر لفتح لوحة الإدارة وتصحيح الفتاوى والأرقام)"
              onClick={handleSheikhImageClick}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsAuthModalOpen(true);
              }}
              onTouchEnd={handleSheikhImageClick}
            >
              <img
                src="/icon-alshekh.png"
                alt="أيقونة فضيلة الشيخ د. عبد الباري خلة"
                className="w-full h-full object-cover object-center pointer-events-none select-none"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/sheikh-avatar.png";
                }}
              />
            </div>

            {/* 2. Site Brand & Icon */}
            <div
              className="overflow-hidden cursor-pointer flex-1"
              onClick={() => setActiveTab("transcribe")}
            >
              <div className="flex items-center gap-2">
                <img
                  src="/icon-app.png"
                  alt="أيقونة الموقع"
                  className="w-6 h-6 rounded-lg object-cover shrink-0 shadow-xs border border-amber-300/40"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/site-logo.png";
                  }}
                />
                <h1 className="text-base xl:text-lg font-black font-cairo text-white leading-tight tracking-wide group-hover:text-emerald-100 transition-colors">
                  مفرّغ فتاوى الشيخ
                </h1>
              </div>
              <p className="text-[12px] font-medium text-amber-300/90 font-tajawal truncate mt-0.5">
                د. عبد الباري خلة
              </p>
            </div>
          </div>

          {/* Quick New Fatwa CTA */}
          <button
            onClick={onNewFatwa}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-98 text-white font-bold font-cairo text-[13px] shadow-[0_8px_20px_rgba(5,150,105,0.2)] hover:shadow-[0_8px_25px_rgba(5,150,105,0.3)] transition-all duration-300 flex items-center justify-center gap-2.5 border border-emerald-400/30 hover:-translate-y-0.5"
          >
            <PlusCircle className="w-4.5 h-4.5" />
            <span>تفريغ فتوى جديدة</span>
          </button>

          {/* Navigation Links */}
          <nav className="space-y-2 pt-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-[13px] font-bold font-cairo transition-all duration-300 group ${
                    isActive
                      ? "bg-emerald-800/90 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] border border-emerald-500/30 translate-x-1"
                      : "text-stone-300/90 hover:bg-emerald-900/40 hover:text-white border border-transparent hover:border-emerald-800/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? "text-amber-300" : "text-emerald-400/80 group-hover:text-emerald-300"}`} />
                    <span>{item.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-stone-950">
                        {item.badge}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-emerald-400/50 group-hover:text-emerald-300/80 font-normal">
                      {item.subLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Controls & Settings */}
        <div className="p-4 border-t border-emerald-900/60 bg-emerald-950/40 space-y-3">
          {/* Strict Mode Quick Toggle */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-900/30 border border-emerald-800/40 text-[11px]">
            <div className="flex items-center gap-1.5 text-stone-300">
              <ShieldCheck className={`w-3.5 h-3.5 ${strictMode ? "text-emerald-400" : "text-stone-500"}`} />
              <span>الأمانة الحرفية</span>
            </div>
            <button
              onClick={() => setStrictMode(!strictMode)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                strictMode ? "bg-emerald-600 text-white" : "bg-stone-700 text-stone-300"
              }`}
            >
              {strictMode ? "مفعّل" : "معطل"}
            </button>
          </div>

          {/* Install PWA Button */}
          {onOpenInstallModal && (
            <button
              onClick={onOpenInstallModal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs bg-emerald-700/60 hover:bg-emerald-600 text-white font-bold font-cairo border border-emerald-500/40 shadow-xs transition-all active:scale-98"
            >
              <span className="flex items-center gap-2">
                <Download className="w-3.5 h-3.5 text-amber-300" />
                <span>تثبيت التطبيق على الجوال</span>
              </span>
              <Smartphone className="w-3.5 h-3.5 text-emerald-200" />
            </button>
          )}
          {onFetchAllUserFatwas && (
            <button
              onClick={onFetchAllUserFatwas}
              disabled={isFetchingAllUsersFatwas}
              className="w-full flex items-center justify-between px-3 py-2 mt-2 rounded-xl text-xs bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 font-bold font-cairo border border-emerald-700/40 shadow-xs transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
              title="النظام متصل بمزامنة لحظية تلقائية لكافة المستخدمين"
            >
              <span className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span>تزامن لحظي مباشر</span>
              </span>
              <span className="text-[10px] text-emerald-300/80 bg-emerald-900/60 px-2 py-0.5 rounded font-tajawal flex items-center gap-1">
                <RefreshCw className={`w-2.5 h-2.5 ${isFetchingAllUsersFatwas ? "animate-spin" : ""}`} />
                {isFetchingAllUsersFatwas ? "تحديث..." : "نشط"}
              </span>
            </button>
          )}


          {/* Auth Gate Button */}
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs bg-emerald-900/20 hover:bg-emerald-900/40 text-stone-300 border border-emerald-800/30 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              {isAuthenticated ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">محرر معتمد</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-stone-400" />
                  <span>دخول المحرر</span>
                </>
              )}
            </span>
            <ChevronRight className="w-3 h-3 text-stone-500" />
          </button>

          {/* Cloud Database Status Badge */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-900/30 border border-emerald-800/40 text-[11px]">
            <div className="flex items-center gap-1.5 text-stone-300">
              <span className={`w-2 h-2 rounded-full ${
                syncStatus === "synced"
                  ? "bg-emerald-400"
                  : syncStatus === "connecting"
                  ? "bg-amber-400 animate-pulse"
                  : syncStatus === "offline"
                  ? "bg-stone-400"
                  : "bg-rose-400"
              }`} />
              <span className="text-stone-300 font-tajawal">حالة المزامنة:</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`text-[10px] font-bold font-cairo ${
                syncStatus === "synced"
                  ? "text-emerald-300"
                  : syncStatus === "connecting"
                  ? "text-amber-300"
                  : syncStatus === "offline"
                  ? "text-stone-300"
                  : "text-rose-300"
              }`}>
                {syncStatus === "synced"
                  ? "متصل ومزامن"
                  : syncStatus === "connecting"
                  ? "جارٍ المزامنة..."
                  : syncStatus === "offline"
                  ? "غير متصل"
                  : syncStatus === "permission-denied"
                  ? "في انتظار الصلاحية"
                  : syncStatus === "quota-exceeded"
                  ? "حفظ احتياطي"
                  : "تخزين محلي"}
              </span>
              {pendingWritesCount > 0 && (
                <span className="px-1 py-0.2 rounded-full bg-amber-400/30 text-amber-200 text-[9px] font-bold">
                  {pendingWritesCount} معلقة
                </span>
              )}
            </div>
          </div>

          {/* Direct Manual Sync Button for Desktop Sidebar */}
          {onFetchAllUserFatwas && (
            <button
              type="button"
              onClick={() => onFetchAllUserFatwas()}
              disabled={isFetchingAllUsersFatwas}
              className="w-full py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-stone-950 font-bold font-cairo text-xs flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              title="مزامنة ورفع فتاوى الأرشيف والمراجعة سحابياً ومحلياً"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-stone-950 ${isFetchingAllUsersFatwas ? "animate-spin" : ""}`} />
              <span>{isFetchingAllUsersFatwas ? "جارٍ المزامنة والرفع..." : "مزامنة ورفع الفتاوى"}</span>
            </button>
          )}

          {/* Version Info */}
          <div className="text-[10px] text-emerald-400/60 text-center font-tajawal pt-1">
            النسخة 1.2.0 • مدعوم بواسطة Gemini AI
          </div>
        </div>
      </aside>

      {/* Mobile Top Header (Sticky) */}
      <header className="lg:hidden sticky top-0 z-30 bg-[#0c392c] text-white border-b border-emerald-900/80 shadow-md">
        <div className="px-4 py-2.5 flex items-center justify-between">
          {/* Logo & Brand with Sheikh's Icon & Site's Icon */}
          <div
            className="flex items-center gap-2 select-none"
          >
            {/* 1. Site Icon */}
            <div
              className="w-9 h-9 rounded-xl bg-emerald-950/90 border border-amber-300/80 flex items-center justify-center shadow-xs shrink-0 overflow-hidden cursor-pointer active:scale-95 transition-transform"
              title="أيقونة الموقع - الانتقال للتفريغ"
              onClick={() => setActiveTab("transcribe")}
            >
              <img
                src="/icon-app.png"
                alt="أيقونة الموقع"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/site-logo.png";
                }}
              />
            </div>

            {/* 2. Sheikh's Icon */}
            <div
              className="w-9 h-9 rounded-full bg-[#f6f2e9] text-[#0c392c] flex items-center justify-center shadow-xs shrink-0 overflow-hidden relative border-2 border-amber-300/80 cursor-pointer active:scale-95 transition-transform"
              title="أيقونة فضيلة الشيخ د. عبد الباري خلة (انقر لفتح لوحة الإدارة وتصحيح الفتاوى والأرقام)"
              onClick={handleSheikhImageClick}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsAuthModalOpen(true);
              }}
              onTouchEnd={handleSheikhImageClick}
            >
              <img
                src="/icon-alshekh.png"
                alt="أيقونة فضيلة الشيخ د. عبد الباري خلة"
                className="w-full h-full object-cover object-center pointer-events-none select-none"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/sheikh-avatar.png";
                }}
              />
            </div>

            {/* Brand Title */}
            <div
              className="cursor-pointer"
              onClick={() => setActiveTab("transcribe")}
            >
              <h1 className="text-xs sm:text-sm font-bold font-cairo text-stone-100 leading-tight">
                مفرّغ فتاوى الشيخ
              </h1>
              <p className="text-[10px] text-amber-300/90 font-tajawal">
                د. عبد الباري خلة
              </p>
            </div>
          </div>

          {/* Right Mobile Status and Menu Toggle */}
          <div className="flex items-center gap-2">
            {onFetchAllUserFatwas && (
              <button
                onClick={onFetchAllUserFatwas}
                disabled={isFetchingAllUsersFatwas}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 text-xs font-bold font-cairo border border-emerald-700/50 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                title="تزامن لحظي مباشر تلقائي لجميع المستخدمين"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-tajawal">{isFetchingAllUsersFatwas ? "تحديث..." : "لحظي"}</span>
              </button>
            )}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1.5 rounded-lg bg-emerald-900/60 text-stone-200 border border-emerald-700/40 hover:bg-emerald-800"
              aria-label="القائمة"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer Menu */}
        {isMobileMenuOpen && (
          <div className="bg-[#092e23] border-t border-emerald-900 px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  onNewFatwa();
                  setIsMobileMenuOpen(false);
                }}
                className="col-span-2 py-2 px-3 rounded-xl bg-emerald-600 text-white font-bold font-cairo text-xs flex items-center justify-center gap-2 shadow-xs"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ تفريغ فتوى جديدة</span>
              </button>

              {/* Mobile Install App Button */}
              {onOpenInstallModal && (
                <button
                  onClick={() => {
                    onOpenInstallModal();
                    setIsMobileMenuOpen(false);
                  }}
                  className="col-span-2 py-2 px-3 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 text-white font-bold font-cairo text-xs flex items-center justify-center gap-2 border border-emerald-500/40 shadow-xs"
                >
                  <Download className="w-4 h-4 text-amber-300" />
                  <span>تثبيت التطبيق على الجوال / الشاشة الرئيسية</span>
                </button>
              )}
              {onFetchAllUserFatwas && (
                <button
                  onClick={() => {
                    onFetchAllUserFatwas();
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={isFetchingAllUsersFatwas}
                  className="col-span-2 mt-1 py-2 px-3 rounded-xl bg-emerald-800/90 hover:bg-emerald-700 text-white font-bold font-cairo text-xs flex items-center justify-center gap-2 border border-emerald-600/50 shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-300 ${isFetchingAllUsersFatwas ? "animate-spin" : ""}`} />
                  <span>{isFetchingAllUsersFatwas ? "جارٍ المزامنة والرفع..." : "مزامنة ورفع الفتاوى (الأرشيف والمراجعة)"}</span>
                </button>
              )}


              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold font-cairo ${
                      isActive ? "bg-emerald-800 text-amber-300 border border-emerald-600/40" : "bg-emerald-950/40 text-stone-300 border border-emerald-900/40"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick Settings within Drawer */}
            <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-stone-300 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>وضع الدقة القصوى</span>
              </div>
              <button
                onClick={() => setStrictMode(!strictMode)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                  strictMode ? "bg-emerald-600 text-white" : "bg-stone-700 text-stone-300"
                }`}
              >
                {strictMode ? "مفعّل" : "معطل"}
              </button>
            </div>

            {/* Mobile Editor Gate Button */}
            <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between text-xs">
              <span className="text-stone-300 text-xs flex items-center gap-1.5">
                {isAuthenticated ? <Unlock className="w-3.5 h-3.5 text-emerald-400" /> : <Lock className="w-3.5 h-3.5 text-stone-400" />}
                <span>{isAuthenticated ? "لوحة التحرير موثقة" : "تسجيل دخول المحرر"}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsAuthModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-900/70 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/50 transition-colors"
              >
                {isAuthenticated ? "إدارة الصلاحية" : "دخول"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Mobile Fixed Bottom Navigation Bar (5 Primary Tools) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c392c]/95 backdrop-blur-md border-t border-emerald-900/80 px-2 py-2 shadow-2xl safe-area-pb">
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {navItems
            .filter((item) => item.id !== "developer" && item.id !== "admin")
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all relative ${
                    isActive
                      ? "bg-emerald-800/90 text-amber-300 font-bold shadow-xs scale-102"
                      : "text-stone-300 hover:text-white active:scale-95"
                  }`}
                >
                  <div className="relative">
                    <Icon className={`w-4.5 h-4.5 ${isActive ? "text-amber-300" : "text-emerald-300/90"}`} />
                    {item.badge && (
                      <span className="absolute -top-1.5 -left-2 min-w-[15px] h-[15px] px-0.5 bg-amber-500 text-stone-950 rounded-full text-[9px] font-bold flex items-center justify-center shadow-xs">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-cairo mt-1 truncate max-w-full leading-none">
                    {item.id === "transcribe"
                      ? "تفريغ"
                      : item.id === "review"
                      ? "المراجعة"
                      : item.id === "card"
                      ? "القوالب"
                      : item.id === "archive"
                      ? "الأرشيف"
                      : "اللوحة"}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </>
  );
};
