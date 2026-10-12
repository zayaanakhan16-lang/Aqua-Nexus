"use client";

/**
 * Study-area list card.
 *
 * Shows a saved area's name and geographic information, links into its
 * intelligence workspace, and offers rename/delete. Rename and delete call the
 * backend; a failure surfaces as a toast rather than silently mutating the list.
 */
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, MapPin, Pencil, Trash2 } from "lucide-react";

import { useStudyAreas } from "@/lib/study-areas";
import { useToast } from "@/lib/toast";
import { formatCoord, formatDateTime } from "@/lib/format";
import type { StudyArea } from "@/lib/schemas";
import { Modal } from "@/components/ui/Modal";

export function StudyAreaCard({ area }: { area: StudyArea }) {
  const { rename, remove } = useStudyAreas();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftName, setDraftName] = useState(area.name);
  const [busy, setBusy] = useState(false);

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await rename(area.id, trimmed);
      toast.push("success", "Study area renamed.");
      setRenaming(false);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await remove(area.id);
      toast.push("success", `Deleted “${area.name}”.`);
      setConfirmDelete(false);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel flex flex-col gap-3 p-4 transition hover:border-water-400/30">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-water-300">
          <MapPin className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink-100">{area.name}</h3>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-400">
            {formatCoord(area.location.latitude, "lat")} ·{" "}
            {formatCoord(area.location.longitude, "lon")}
          </p>
          {area.place?.display_name ? (
            <p className="mt-0.5 truncate text-xs text-ink-500">{area.place.display_name}</p>
          ) : null}
          <p className="mt-1 text-[0.6875rem] text-ink-500">
            Created {formatDateTime(area.created_at)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <Link
          href={`/study-areas/${area.id}`}
          className="group inline-flex items-center gap-1.5 rounded-md bg-water-400/15 px-3 py-1.5 text-xs font-medium text-water-100 transition hover:bg-water-400/25"
        >
          Open workspace
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setDraftName(area.name);
              setRenaming(true);
            }}
            aria-label={`Rename ${area.name}`}
            className="rounded-md border border-white/[0.08] p-1.5 text-ink-400 transition hover:text-ink-100"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${area.name}`}
            className="rounded-md border border-white/[0.08] p-1.5 text-ink-400 transition hover:text-signal-alert"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <Modal open={renaming} onClose={() => setRenaming(false)} title="Rename study area">
        <form onSubmit={submitRename} className="space-y-4">
          <div>
            <label htmlFor={`rename-${area.id}`} className="label-caps">
              Study-area name
            </label>
            <input
              id={`rename-${area.id}`}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={120}
              autoFocus
              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-abyss-850/90 px-3 text-sm text-ink-100 focus:border-water-400/50"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-ink-200 transition hover:text-ink-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-water-400 px-4 py-2 text-sm font-semibold text-abyss-950 transition hover:bg-water-300 disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete study area"
        description={`This permanently removes “${area.name}”. The data itself is never stored — only the saved location.`}
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-ink-200 transition hover:text-ink-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={doDelete}
            disabled={busy}
            className="rounded-lg border border-signal-alert/40 bg-signal-alert/15 px-4 py-2 text-sm font-semibold text-signal-alert transition hover:bg-signal-alert/25 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </Modal>
    </article>
  );
}
