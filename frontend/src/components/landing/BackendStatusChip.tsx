"use client";

/**
 * Live backend status chip.
 *
 * Reads the real /api/v1/health endpoint once. Until it resolves it shows
 * "Checking"; if the backend is unreachable it says so plainly. It never
 * fabricates an "operational" state.
 */
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { StatusDot } from "@/components/ui/primitives";

export function BackendStatusChip() {
  const [state, setState] = useState<{ ok: boolean; version?: string } | null>(null);

  useEffect(() => {
    let active = true;
    api
      .health()
      .then((data) => {
        if (active) setState({ ok: data.status === "ok", version: data.version });
      })
      .catch(() => {
        if (active) setState({ ok: false });
      });
    return () => {
      active = false;
    };
  }, []);

  const tone = state === null ? "muted" : state.ok ? "good" : "alert";
  const label = state === null ? "Checking API" : state.ok ? "API available" : "API unreachable";

  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[0.6875rem] text-ink-300">
      <StatusDot tone={tone} pulse={state?.ok === true} label="Backend API status" />
      {label}
      {state?.ok && state.version ? (
        <span className="font-mono text-ink-500">v{state.version}</span>
      ) : null}
    </span>
  );
}
