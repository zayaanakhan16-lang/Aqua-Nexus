"use client";

/**
 * Create Investigation dialog.
 *
 * Implements the review-then-name step of the location-to-investigation flow:
 * it shows the selected name and coordinates, asks for a name and the
 * classification the user wants, and saves through the backend.
 *
 * Only the name, coordinates, label and resolved place are persisted — those
 * are the fields the backend contract accepts. The type, category, size, group
 * and colour are the user's own annotation labels, kept in this browser by
 * `lib/map-ui` and shown as annotation metadata, never as measured values.
 * Duplicate submissions are blocked while a request is in flight, and a failed
 * save keeps the dialog open with the user's input intact.
 */
import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { useStudyAreas } from "@/lib/study-areas";
import { useToast } from "@/lib/toast";
import { formatCoord } from "@/lib/format";
import {
  DEFAULT_ANNOTATION,
  INVESTIGATION_CATEGORIES,
  INVESTIGATION_COLORS,
  INVESTIGATION_GROUPS,
  useMapUi,
  type InvestigationAnnotation,
} from "@/lib/map-ui";
import type { PlaceResult, StudyArea } from "@/lib/schemas";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

const TYPES = ["Point", "Area"] as const;
const SIZES = ["Point scale", "Local (≤ 25 km²)", "District (≤ 250 km²)", "Regional (> 250 km²)"];

export function CreateStudyAreaDialog({
  open,
  onClose,
  latitude,
  longitude,
  label,
  place,
  onCreated,
  initial,
  areaKm2,
}: {
  open: boolean;
  onClose: () => void;
  latitude: number;
  longitude: number;
  label?: string | null;
  place?: PlaceResult | null;
  onCreated?: (area: StudyArea) => void;
  /** When present the dialog edits an existing investigation's annotation. */
  initial?: StudyArea | null;
  areaKm2?: number | null;
}) {
  const { create } = useStudyAreas();
  const { setAnnotation, annotationFor } = useMapUi();
  const toast = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annotation, setLocalAnnotation] = useState<InvestigationAnnotation>(DEFAULT_ANNOTATION);

  const suggested = place?.name ?? label ?? "";

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? suggested);
    setLocalAnnotation(initial ? annotationFor(initial.id) : DEFAULT_ANNOTATION);
    setError(null);
    setSaving(false);
  }, [open, suggested, initial, annotationFor]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name for this investigation.");
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
      setAnnotation(area.id, annotation);
      toast.push("success", `Saved investigation “${area.name}”.`);
      onCreated?.(area);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the investigation.";
      setError(message);
      toast.push("error", `Save failed: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  const selectClass =
    "mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-abyss-850/90 px-2.5 text-xs text-ink-100 focus:border-water-300/50";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Edit investigation" : "New investigation"}
      description="Save this location so you can return to its water evidence later."
    >
      <form onSubmit={submit} className="space-y-3.5">
        {/* ------------------------------------------------------- location */}
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="label-caps">Location</p>
          <div className="mt-1.5 flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-water-300" aria-hidden />
            <p className="truncate text-sm font-medium text-ink-100">
              {place?.name ?? label ?? "Selected location"}
            </p>
          </div>
          <p className="mt-1 font-mono text-xs text-ink-300">
            {formatCoord(latitude, "lat")} · {formatCoord(longitude, "lon")}
          </p>
          {place?.display_name && place.display_name !== place.name ? (
            <p className="mt-0.5 truncate text-2xs text-ink-500">{place.display_name}</p>
          ) : null}
        </div>

        {/* ----------------------------------------------------------- name */}
        <div>
          <label htmlFor="study-area-name" className="label-caps">
            Investigation name
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
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-abyss-850/90 px-2.5 text-xs text-ink-100 placeholder:text-ink-500 focus:border-water-300/50"
          />
        </div>

        {/* ------------------------------------------------- classification */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="investigation-type" className="label-caps">
              Type
            </label>
            <select
              id="investigation-type"
              value={annotation.type}
              onChange={(e) => setLocalAnnotation({ ...annotation, type: e.target.value })}
              className={selectClass}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="investigation-group" className="label-caps">
              Group
            </label>
            <select
              id="investigation-group"
              value={annotation.group}
              onChange={(e) => setLocalAnnotation({ ...annotation, group: e.target.value })}
              className={selectClass}
            >
              {INVESTIGATION_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="investigation-category" className="label-caps">
              Category
            </label>
            <select
              id="investigation-category"
              value={annotation.category}
              onChange={(e) => setLocalAnnotation({ ...annotation, category: e.target.value })}
              className={selectClass}
            >
              {INVESTIGATION_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="investigation-size" className="label-caps">
              Size
            </label>
            <select id="investigation-size" defaultValue={SIZES[0]} className={selectClass}>
              {SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        {typeof areaKm2 === "number" ? (
          <p className="text-2xs text-ink-400">
            Measured boundary area:{" "}
            <span className="font-mono tabular-nums text-ink-200">
              {areaKm2.toLocaleString(undefined, { maximumFractionDigits: 2 })} km²
            </span>{" "}
            (validated by the backend)
          </p>
        ) : null}

        {/* --------------------------------------------------------- colour */}
        <div>
          <p className="label-caps">Boundary colour</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {INVESTIGATION_COLORS.map((color) => {
              const active = annotation.color === color.hex;
              return (
                <button
                  key={color.id}
                  type="button"
                  title={color.label}
                  aria-label={color.label}
                  aria-pressed={active}
                  onClick={() => setLocalAnnotation({ ...annotation, color: color.hex })}
                  className={cn(
                    "h-6 w-6 rounded-md border transition",
                    active ? "border-ink-100 ring-1 ring-ink-100/60" : "border-white/15",
                  )}
                  style={{ backgroundColor: color.hex }}
                />
              );
            })}
          </div>
        </div>

        <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-3xs leading-relaxed text-ink-500">
          Type, category, size, group and colour are your own annotation labels, stored in this
          browser. They are not measurements and are never presented as evidence.
        </p>

        {error ? (
          <p id="study-area-name-error" role="alert" className="text-xs text-signal-alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-white/[0.07] pt-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2 text-xs font-medium text-ink-200 transition hover:text-ink-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3.5 py-2 text-xs font-semibold text-abyss-950 transition hover:bg-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save study area"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
