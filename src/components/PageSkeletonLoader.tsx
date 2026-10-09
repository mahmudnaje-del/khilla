import React from "react";

interface PageSkeletonLoaderProps {
  activeTab?: string;
}

export const PageSkeletonLoader: React.FC<PageSkeletonLoaderProps> = ({ activeTab }) => {
  return (
    <div
      dir="rtl"
      className="w-full max-w-4xl mx-auto space-y-5 py-2 px-1 animate-in fade-in duration-200 select-none pointer-events-none"
      aria-label="جارٍ تحميل المحتوى..."
    >
      {/* Top Header Placeholder (Matches User Mockup) */}
      <div className="flex items-center justify-between px-1">
        {/* Right side: Avatar and text lines */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-stone-200/90 animate-pulse shrink-0" />
          <div className="space-y-2">
            <div className="w-32 h-3.5 rounded-md bg-stone-200/90 animate-pulse" />
            <div className="w-20 h-2.5 rounded-md bg-stone-200/70 animate-pulse" />
          </div>
        </div>

        {/* Left side: Status dots */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-stone-200/80 animate-pulse" />
          <div className="w-5 h-5 rounded-full bg-stone-200/80 animate-pulse" />
        </div>
      </div>

      {/* Main Large Hero Card (Matches User Mockup) */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-xs space-y-5 animate-skeleton-shimmer">
        {/* Title bar line */}
        <div className="w-48 h-4 rounded-md bg-stone-200/90 animate-pulse" />

        {/* Paragraph lines */}
        <div className="space-y-3 pt-2">
          <div className="w-full h-3 rounded-md bg-stone-200/80 animate-pulse" />
          <div className="w-5/6 h-3 rounded-md bg-stone-200/80 animate-pulse" />
          <div className="w-3/5 h-3 rounded-md bg-stone-200/70 animate-pulse" />
        </div>

        {/* Bottom tags & actions line */}
        <div className="flex items-center justify-between pt-4 border-t border-stone-100">
          <div className="flex items-center gap-2">
            <div className="w-16 h-6 rounded-lg bg-stone-200/70 animate-pulse" />
            <div className="w-20 h-6 rounded-lg bg-stone-200/70 animate-pulse" />
          </div>
          <div className="w-24 h-7 rounded-xl bg-stone-300/80 animate-pulse" />
        </div>
      </div>

      {/* 4-Item Rounded Grid (Matches User Mockup) */}
      <div className="grid grid-cols-4 gap-2.5 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200/70 flex flex-col items-center justify-center space-y-2.5 shadow-xs animate-skeleton-shimmer"
          >
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-stone-200/90 animate-pulse" />
            <div className="w-12 sm:w-16 h-2 rounded-md bg-stone-200/80 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Featured Banner / Big Container (Matches User Mockup) */}
      <div className="w-full h-32 sm:h-40 rounded-3xl bg-stone-200/80 animate-pulse border border-stone-200/60 shadow-xs animate-skeleton-shimmer" />

      {/* Two Bottom Content Cards (Matches User Mockup) */}
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-4 border border-stone-200/70 shadow-xs flex items-center justify-between gap-4 animate-skeleton-shimmer"
          >
            <div className="space-y-2 flex-1">
              <div className="w-36 h-3 rounded-md bg-stone-200/90 animate-pulse" />
              <div className="w-full h-2.5 rounded-md bg-stone-200/70 animate-pulse" />
              <div className="w-2/3 h-2.5 rounded-md bg-stone-200/60 animate-pulse" />
            </div>
            <div className="w-16 h-16 rounded-xl bg-stone-200/90 animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};
