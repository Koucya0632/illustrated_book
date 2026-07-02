"use client";

import type { ReactNode } from "react";

type LoadingToastProps = {
  open: boolean;
  title?: ReactNode;
  description?: ReactNode;
  placement?: "top" | "bottom";
};

export default function LoadingToast({
  open,
  title = "載入中",
  description = "正在準備內容...",
  placement = "top",
}: LoadingToastProps) {
  if (!open) return null;

  const placementClass =
    placement === "bottom"
      ? "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
      : "top-[calc(1rem+env(safe-area-inset-top))]";

  return (
    <div
      className={`pointer-events-none fixed left-1/2 z-[80] w-[calc(100%-2rem)] max-w-[360px] -translate-x-1/2 ${placementClass}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="tuji-toast-enter flex min-h-[72px] items-center gap-3 rounded-2xl border border-white/75 bg-white/95 px-4 py-3 text-tuji-ink shadow-[0_16px_40px_rgba(15,26,26,0.18)] backdrop-blur">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tuji-tealS">
          <span className="tuji-loading-ring absolute h-7 w-7 rounded-full border-[3px] border-tuji-teal/20 border-t-tuji-teal" />
          <span className="h-2.5 w-2.5 rounded-full bg-tuji-yellow shadow-[0_0_0_5px_rgba(255,210,74,0.22)]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-tuji-ink">{title}</div>
          {description && (
            <div className="mt-0.5 truncate text-xs font-bold text-tuji-ink3">
              {description}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-tuji-bg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-tuji-teal">
          <span className="h-1.5 w-1.5 rounded-full bg-tuji-coral" />
          <span>處理中</span>
        </div>
      </div>
    </div>
  );
}
