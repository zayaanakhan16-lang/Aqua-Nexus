"use client";

/**
 * Create Study Area dialog.
 *
 * Implements the review-then-name step of the location-to-investigation flow:
 * it shows the selected name and coordinates, asks for a study-area name, and
 * saves through the backend. Duplicate submissions are blocked while a request
 * is in flight, and a failed save keeps the dialog open with the user's input
 * intact so nothing is lost.
 */
import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { useStudyAreas } from "@/lib/study-areas";
import { useToast } from "@/lib/toast";
import { formatCoord } from "@/lib/format";
import type { PlaceResult, StudyArea } from "@/lib/schemas";
import { Modal } from "@/components/ui/Modal";

export function CreateStudyAreaDialog({
  open,
  onClose,
  latitude,
  longitude,
  label,
  place,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  latitude: number;
  longitude: number;
  label?: string | null;
  place?: PlaceResult | null;
  onCreated?: (area: StudyArea) => void;
}) {
  const { create } = useStudyAreas();
  const toast = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggested = place?.name ?? label ?? "";

  useEffect(() => {
    if (open) {
      setName(suggested);
      setError(null);
      setSaving(false);
    }
  }, [open, suggested]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name for this study area.");
      return;
    }
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const area = await create({
        name: trimmed,
        latitude,
        longitude,
        label: label ?? null,
        place: place ?? null,
      });
      toast.push("success", `Saved study area “${area.name}”.`);
      onCreated?.(area);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the study area.";
      setError(message);
      toast.push("error", `Save failed: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create study area"
      description="Save this location so you can return to its investigation later."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-water-300" aria-hidden />
            <p className="truncate text-sm font-medium text-ink-100">
              {place?.name ?? label ?? "Selected location"}
            </p>
          </div>
          <p className="mt-1 font-mono text-xs text-ink-300">
            {formatCoord(latitude, "lat")} · {formatCoord(longitude, "lon")}
          </p>
          {place?.display_name && place.display_name !== place.name ? (
            <p className="mt-0.5 truncate text-xs text-ink-500">{place.display_name}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="study-area-name" className="label-caps">
            Study-area name
          </label>
          <input
            id="study-area-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoFocus
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "study-area-name-error" : undefined}
            placeholder="e.g. Lagos Lagoon"
            className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-abyss-850/90 px-3 text-sm text-ink-100 placeholder:text-ink-500 focus:border-water-400/50"
          />
        </div>

        {error ? (
          <p id="study-area-name-error" role="alert" className="text-xs text-signal-alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-sm font-medium text-ink-200 transition hover:text-ink-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-water-400 px-4 py-2 text-sm font-semibold text-abyss-950 transition hover:bg-water-300 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save study area"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
