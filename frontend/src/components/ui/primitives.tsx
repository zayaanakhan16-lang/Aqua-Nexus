import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { DataClassification } from "@/lib/schemas";
import { classificationStyle } from "@/lib/format";

export function ClassificationBadge({
  classification,
  compact = false,
}: {
  classification: DataClassification;
  compact?: boolean;
}) {
  const style = classificationStyle(classification);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide",
        style.className,
      )}
      title={style.description}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden />
      {compact ? style.short : style.label}
    </span>
  );
}

export function Chip({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn("chip", className)} title={title}>
      {children}
    </span>
  );
}

export function StatusDot({
  tone = "muted",
  pulse = false,
  label,
}: {
  tone?: "good" | "caution" | "alert" | "info" | "muted";
  pulse?: boolean;
  label?: string;
}) {
  const toneClass = {
    good: "bg-signal-good",
    caution: "bg-signal-caution",
    alert: "bg-signal-alert",
    info: "bg-signal-info",
    muted: "bg-signal-muted",
  }[tone];
  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center" title={label}>
      <span className={cn("h-2 w-2 rounded-full", toneClass)} />
      {pulse ? (
        <span
          className={cn("absolute h-2 w-2 rounded-full animate-pulse-ring", toneClass)}
          aria-hidden
        />
      ) : null}
    </span>
  );
}

export function Panel({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "aside" | "div";
}) {
  return <Tag className={cn("panel", className)}>{children}</Tag>;
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? <span className="text-water-300">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink-100">{title}</h2>
          {subtitle ? (
            <p className="truncate text-xs text-ink-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md bg-gradient-to-r from-white/[0.04] via-white/[0.09] to-white/[0.04] bg-[length:200%_100%]",
        className,
      )}
      aria-hidden
    />
  );
}
