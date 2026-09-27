import React from "react";

/**
 * ThinkingLogo — مؤشر التحميل والتفكير الموحّد للمنصة.
 * مبني على شعار "مفرّغ فتاوى الشيخ د. عبد الباري خلة".
 *
 * ثلاثة أوضاع:
 *   variant="page"    شاشة تحميل تغطي الصفحة (دخول الموقع، تحميل الأرشيف)
 *   variant="block"   كتلة داخل بطاقة أو مكان الرد (أثناء التفريغ)
 *   variant="inline"  صغير داخل زر أو سطر نص
 *
 * أمثلة:
 *   <ThinkingLogo variant="page"  label="جارٍ تحميل المنصة..." />
 *   <ThinkingLogo variant="block" label="جارٍ تفريغ جواب الشيخ..." />
 *   <ThinkingLogo variant="inline" label="" />
 */

const NAVY = "#1B2A41";
const GOLD = "#C9A961";

export type ThinkingVariant = "page" | "block" | "inline";

export interface ThinkingLogoProps {
  variant?: ThinkingVariant;
  /** نص تحت الشعار — مرّر "" لإخفائه */
  label?: string;
  /** نص ثانوي أصغر، يظهر في وضعي page و block فقط */
  hint?: string;
  /** تجاوز الحجم بالبكسل */
  size?: number;
  /** مدة الدورة الكاملة بالثواني */
  speed?: number;
  className?: string;
}

const ANIM_CSS = `
@keyframes flBreathe { 0%,100%{opacity:.15} 18%{opacity:1} 72%{opacity:1} 92%{opacity:.15} }
@keyframes flHalo   { 0%,100%{opacity:0;transform:scale(.9)} 40%{opacity:.5;transform:scale(1.04)} 70%{opacity:0;transform:scale(1.1)} }
@keyframes flDraw   { 0%{stroke-dashoffset:340} 35%{stroke-dashoffset:0} 80%{stroke-dashoffset:0} 100%{stroke-dashoffset:-340} }
@keyframes flBar    { 0%,100%{opacity:.2;transform:scaleX(.6)} 50%{opacity:1;transform:scaleX(1)} }
@keyframes flWing   { 0%,100%{transform:scale(.94) translateY(4px)} 45%{transform:scale(1) translateY(0)} }
@keyframes flQuill  { 0%{stroke-dashoffset:120} 45%{stroke-dashoffset:0} 82%{stroke-dashoffset:0} 100%{stroke-dashoffset:-120} }
@keyframes flDot    { 0%,100%{opacity:0} 45%{opacity:1} 80%{opacity:1} }
@keyframes flText   { 0%,100%{opacity:.4} 50%{opacity:1} }

.fl-wrap  { animation: flBreathe var(--fl-cycle) ease-in-out infinite; }
.fl-halo  { animation: flHalo    var(--fl-cycle) ease-in-out infinite; transform-origin: 190px 150px; }
.fl-mic   { stroke-dasharray: 340; stroke-dashoffset: 340; animation: flDraw var(--fl-cycle) ease-in-out infinite; }
.fl-quill { stroke-dasharray: 120; stroke-dashoffset: 120; animation: flQuill var(--fl-cycle) ease-in-out infinite; }
.fl-dot   { animation: flDot var(--fl-cycle) ease-in-out infinite; }
.fl-wing  { transform-origin: 190px 210px; animation: flWing var(--fl-cycle) ease-in-out infinite; }
.fl-bar   { transform-origin: 190px 0; animation: flBar 1.5s ease-in-out infinite; }
.fl-bar2  { animation-delay: .18s; }
.fl-bar3  { animation-delay: .36s; }
.fl-label { animation: flText 2s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .fl-wrap, .fl-halo, .fl-mic, .fl-quill, .fl-dot, .fl-wing, .fl-bar, .fl-label {
    animation: none !important;
    opacity: 1 !important;
    stroke-dashoffset: 0 !important;
  }
}
`;

const LogoMark: React.FC<{ px: number; cycle: string }> = ({ px, cycle }) => (
  <svg
    width={px}
    height={px * (300 / 380)}
    viewBox="0 0 380 300"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    style={{ ["--fl-cycle" as any]: cycle, display: "block" }}
  >
    <g className="fl-halo">
      <circle cx="190" cy="150" r="104" fill="none" stroke={GOLD} strokeWidth="0.5" opacity="0.6" />
      <circle cx="190" cy="150" r="84" fill="none" stroke={NAVY} strokeWidth="0.5" opacity="0.35" />
    </g>

    <g className="fl-wrap">
      <rect
        className="fl-mic"
        x="164" y="52" width="52" height="128" rx="26"
        fill="none" stroke={NAVY} strokeWidth="4" strokeLinecap="round"
      />
      <line className="fl-bar" x1="172" y1="88" x2="208" y2="88" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" />
      <line className="fl-bar fl-bar2" x1="172" y1="102" x2="208" y2="102" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" />
      <line className="fl-bar fl-bar3" x1="172" y1="116" x2="208" y2="116" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" />

      <path
        className="fl-quill"
        d="M182 138 C 176 156, 180 178, 196 196"
        fill="none" stroke={GOLD} strokeWidth="4" strokeLinecap="round"
      />
      <circle className="fl-dot" cx="160" cy="140" r="4" fill={GOLD} />

      <g className="fl-wing">
        <path d="M190 232 C 162 206, 120 190, 74 184 C 104 198, 152 212, 190 232 Z" fill={NAVY} />
        <path d="M190 232 C 218 206, 260 190, 306 184 C 276 198, 228 212, 190 232 Z" fill={NAVY} />
        <path d="M190 226 C 166 202, 132 188, 96 180 C 122 196, 160 208, 190 226 Z" fill={GOLD} />
        <path d="M190 226 C 214 202, 248 188, 284 180 C 258 196, 220 208, 190 226 Z" fill={GOLD} />
      </g>
    </g>
  </svg>
);

export const ThinkingLogo: React.FC<ThinkingLogoProps> = ({
  variant = "block",
  label = "جارٍ التفكير...",
  hint,
  size,
  speed,
  className = "",
}) => {
  const px = size ?? (variant === "page" ? 200 : variant === "block" ? 150 : 40);
  const cycle = `${speed ?? (variant === "inline" ? 2.2 : 3.6)}s`;
  const styleTag = <style>{ANIM_CSS}</style>;

  if (variant === "inline") {
    return (
      <span
        className={`inline-flex items-center gap-2 ${className}`}
        role="status"
        aria-live="polite"
        aria-label={label || "جارٍ المعالجة"}
      >
        {styleTag}
        <LogoMark px={px} cycle={cycle} />
        {label ? <span className="fl-label">{label}</span> : null}
      </span>
    );
  }

  const body = (
    <div
      className="flex flex-col items-center justify-center gap-3 text-center"
      role="status"
      aria-live="polite"
      aria-label={label || "جارٍ المعالجة"}
    >
      {styleTag}
      <LogoMark px={px} cycle={cycle} />
      {label ? (
        <p className="fl-label text-sm sm:text-base font-bold font-cairo text-stone-800 m-0">{label}</p>
      ) : null}
      {hint ? <p className="text-xs text-stone-500 m-0 max-w-xs">{hint}</p> : null}
    </div>
  );

  if (variant === "page") {
    return (
      <div
        className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#faf7f2] ${className}`}
      >
        {body}
      </div>
    );
  }

  return <div className={`py-8 ${className}`}>{body}</div>;
};

export default ThinkingLogo;
