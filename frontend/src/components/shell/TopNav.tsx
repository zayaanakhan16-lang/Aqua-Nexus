"use client";

/**
 * Primary workspace navigation.
 *
 * A compact horizontal bar of the eight primary destinations, in the AgriSense
 * pattern. Each entry is a real destination that deep-links into the single
 * `/explore` workspace with the relevant section already open
 * (`/explore?tab=…`), so navigation never duplicates the workspace or lands on
 * an empty page. The active entry is derived from the section currently open,
 * so the bar and the section control can never disagree.
 *
 * This is the only primary navigation surface. There is no second sidebar.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  WORKSPACE_GROUPS,
  firstSectionOf,
  groupForTab,
  isWorkspaceTabId,
  type WorkspaceTabId,
} from "@/lib/navigation";

export function TopNav({ className }: { className?: string }) {
  const searchParams = useSearchParams();

  // The section in the URL wins; on routes without one (saved investigations,
  // reports) no primary entry is highlighted rather than guessing.
  const requested = searchParams?.get("tab") ?? null;
  const activeTab: WorkspaceTabId | null = isWorkspaceTabId(requested) ? requested : null;
  const activeGroupId = activeTab ? groupForTab(activeTab).id : null;

  return (
    <nav aria-label="Primary" className={cn("min-w-0", className)}>
      <ul className="flex items-stretch gap-0.5 overflow-x-auto scrollbar-none">
        {WORKSPACE_GROUPS.map((group) => {
          const Icon = group.icon;
          const active = group.id === activeGroupId;
          const target = firstSectionOf(group);
          return (
            <li key={group.id} className="shrink-0">
              <Link
                href={`/explore?tab=${target.id}`}
                title={group.description}
                aria-label={group.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
                  active
                    ? "bg-water-300/[0.14] text-water-200"
                    : "text-ink-300 hover:bg-white/[0.06] hover:text-ink-50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="hidden md:inline">{group.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
