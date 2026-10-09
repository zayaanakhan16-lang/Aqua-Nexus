"use client";

/** First-time experience: a dismissible brief on how the workspace works. */
import { useCallback, useEffect, useState } from "react";
import { Compass, MousePointerClick, Search, ShieldCheck, X } from "lucide-react";

const STORAGE_KEY = "aquanexus.onboarding.dismissed.v1";

const STEPS = [
  {
    icon: Search,
    title: "Find a place",
    body: "Search any city, river or lake worldwide, or type coordinates such as 52.52, 13.40.",
  },
  {
    icon: MousePointerClick,
    title: "Or click the map",
    body: "Click anywhere to set the analysis point. Pan and zoom freely anywhere on Earth.",
  },
  {
    icon: Compass,
    title: "Read the evidence",
    body: "Each indicator shows its method, inputs and limitations. Missing data stays visibly missing.",
  },
  {
    icon: ShieldCheck,
    title: "Trust the provenance",
    body: "Observations, reanalysis, forecasts and derived values are always labelled separately.",
  },
];

export function OnboardingCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage may be unavailable; dismissal still applies for this session */
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="panel animate-fade-in overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink-100">Welcome to AquaNexus</p>
          <p className="text-xs text-ink-400">
            A global workspace for investigating water with data you can trace.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss introduction"
          className="rounded p-1 text-ink-400 transition hover:text-ink-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ul className="grid gap-px bg-white/[0.04] sm:grid-cols-2">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="bg-abyss-900/80 p-3.5">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-water-300" aria-hidden />
                <p className="text-xs font-semibold text-ink-100">{step.title}</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-400">{step.body}</p>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end border-t border-white/[0.06] px-4 py-2.5">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md border border-water-400/30 bg-water-400/10 px-3 py-1.5 text-xs font-medium text-water-200 transition hover:bg-water-400/20"
        >
          Start exploring
        </button>
      </div>
    </div>
  );
}
