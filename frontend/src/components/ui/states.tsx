import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center animate-fade-in",
        className,
      )}
    >
      {icon ? (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-water-300">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink-100">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-ink-400">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-8 text-center animate-fade-in",
        className,
      )}
      role="alert"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-signal-alert/30 bg-signal-alert/10 text-signal-alert">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
          />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink-100">{title}</p>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-ink-400">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-ink-100 transition hover:border-water-400/40 hover:bg-water-400/10"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function UnavailableNotice({
  title,
  message,
  className,
}: {
  title: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-white/10 bg-white/[0.015] px-4 py-3",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-xs font-semibold text-ink-200">
        <span className="h-1.5 w-1.5 rounded-full bg-signal-alert" aria-hidden />
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-400">{message}</p>
    </div>
  );
}
