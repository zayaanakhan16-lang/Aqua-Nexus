"use client";

/**
 * Client-side providers for the application shell.
 *
 * Wraps the authenticated app sections (not the public landing page) so the
 * study-area store and toast queue are available to every workspace route.
 */
import type { ReactNode } from "react";

import { StudyAreaProvider } from "@/lib/study-areas";
import { ToastProvider } from "@/lib/toast";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <StudyAreaProvider>{children}</StudyAreaProvider>
    </ToastProvider>
  );
}
