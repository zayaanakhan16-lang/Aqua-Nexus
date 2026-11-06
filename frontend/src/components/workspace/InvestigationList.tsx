"use client";

/**
 * Investigation list — the fixed-width rail beside the map.
 *
 * The map is the primary surface, so this stays a compact panel: heading,
 * search, filters, a sort control, a dense list of saved investigations and a
 * count at the foot. It lists the study areas the backend actually persisted,
 * and annotation labels (category, group, colour) are user-authored metadata
 * held in this browser only — never presented as measurements.
 *
 * Selection here drives the shared workspace store, so picking an item on this
 * list and clicking the same point on the map produce the same result.
 */
import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Filter,
  Loader2,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  ZoomIn,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCoord, formatDateTime } from "@/lib/format";
import { useStudyAreas } from "@/lib/study-areas";
import { useWorkspace } from "@/lib/workspace";
import {
  INVESTIGATION_CATEGORIES,
  INVESTIGATION_GROUPS,
  annotationColorHex,
  useMapUi,
} from "@/lib/map-ui";
import type { StudyArea } from "@/lib/schemas";

type SortKey = "recent" | "name" | "size";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recent",
  name: "Name",
  size: "Size",
};

/**
 * Latitude magnitude plus longitude magnitude — a stable local proxy for "how
 * far from the equator and meridian" a saved point is, used only to give the
 * size sort a deterministic order. It is derived from the stored coordinates,
 * never invented, and the card shows the coordinates it came from.
 */
function spanDegrees(area: StudyArea): number {
  return Math.abs(area.location.latitude) + Math.abs(area.location.longitude);
}

/** Small polygon glyph used on every investigation card. */
function PolygonGlyph({ color, className }: { color?: string; className?: string }) {
  const hex = annotationColorHex(color);
  return (
    <svg viewBox="0 0 16 16" className={cn("h-4 w-4 shrink-0", className)} aria-hidden>
      <polygon
        points="2,11 6,3 14,7 11,14"
        fill={hex}
        fillOpacity={0.28}
        stroke={hex}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2 py-0.5 text-2xs font-medium transition-colors",
        active
          ? "border-water-300/45 bg-water-300/15 text-water-200"
          : "border-white/10 bg-white/[0.03] text-ink-300 hover:text-ink-100",
      )}
    >
      {children}
    </button>
  );
}

export function InvestigationList({
  onAdd,
  onEdit,
  className,
}: {
  /** Opens the create dialog, which can arm the draw tool. */
  onAdd?: () => void;
  onEdit?: (area: StudyArea) => void;
  className?: string;
}) {
  const { areas, loading, error, remove } = useStudyAreas();
  const { location, selectLocation, clearLocation } = useWorkspace();
  const { annotationFor, removeAnnotation } = useMapUi();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const categories = useMemo(() => {
    const present = new Set<string>();
    areas.forEach((area) => present.add(annotationFor(area.id).category));
    return INVESTIGATION_CATEGORIES.filter((category) => present.has(category));
  }, [areas, annotationFor]);

  const activeFilters = (categoryFilter ? 1 : 0) + (groupFilter ? 1 : 0);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matched = areas.filter((area) => {
      const annotation = annotationFor(area.id);
      if (categoryFilter && annotation.category !== categoryFilter) return false;
      if (groupFilter && annotation.group !== groupFilter) return false;
      if (!term) return true;
      return (
        area.name.toLowerCase().includes(term) ||
        (area.label ?? "").toLowerCase().includes(term) ||
        (area.place?.display_name ?? "").toLowerCase().includes(term) ||
        annotation.category.toLowerCase().includes(term)
      );
    });
    const sorted = [...matched];
    sorted.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return spanDegrees(b) - spanDegrees(a);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return sorted;
  }, [areas, query, sort, categoryFilter, groupFilter, annotationFor]);

  const isSelected = (area: StudyArea) =>
    Boolean(location) &&
    Math.abs((location?.latitude ?? 0) - area.location.latitude) < 1e-6 &&
    Math.abs((location?.longitude ?? 0) - area.location.longitude) < 1e-6;

  const focus = (area: StudyArea) => {
    selectLocation({
      latitude: area.location.latitude,
      longitude: area.location.longitude,
      label: area.label ?? area.name,
      place: area.place ?? null,
    });
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-section flex items-center gap-1.5 text-ink-100">
          <MapPin className="h-3.5 w-3.5 text-water-300" aria-hidden />
          Investigation List
        </h2>
        <span className="flex items-center gap-1.5">
          <span className="rounded-md border border-water-300/35 bg-water-300/15 px-2 py-0.5 font-mono text-2xs tabular-nums text-water-200">
            {areas.length}
          </span>
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 text-ink-300 transition hover:text-ink-50"
              aria-label="New investigation"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </span>
      </div>

      {/* ------------------------------------------------- search + filter */}
      <div className="mt-2.5 flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search investigations"
            aria-label="Search investigations"
            className="h-8 w-full rounded-md border border-white/10 bg-white/[0.05] pl-7 pr-2 text-xs text-ink-100 placeholder:text-ink-500 transition focus:border-water-300/50"
          />
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen((value) => !value)}
          aria-expanded={filterOpen}
          aria-label="Filter investigations"
          className={cn(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
            filterOpen || activeFilters
              ? "border-water-300/45 bg-water-300/15 text-water-200"
              : "border-white/10 bg-white/[0.05] text-ink-300 hover:text-ink-100",
          )}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
          {activeFilters ? (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-water-300 font-mono text-[0.5rem] font-bold text-abyss-950">
              {activeFilters}
            </span>
          ) : null}
        </button>
      </div>

      {/* ------------------------------------------------------- sort row */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-3xs uppercase tracking-[0.12em] text-ink-500">
          <ArrowUpDown className="h-3 w-3" aria-hidden />
          Sort
        </span>
        <div role="group" aria-label="Sort investigations" className="flex items-center gap-1">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <FilterChip key={key} active={sort === key} onClick={() => setSort(key)}>
              {SORT_LABELS[key]}
            </FilterChip>
          ))}
        </div>
      </div>

      {filterOpen ? (
        <div className="mt-2 space-y-2.5 rounded-lg border border-white/10 bg-black/25 p-2.5">
          <div>
            <span className="label-caps">Category</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <FilterChip active={categoryFilter === null} onClick={() => setCategoryFilter(null)}>
                All
              </FilterChip>
              {categories.map((category) => (
                <FilterChip
                  key={category}
                  active={categoryFilter === category}
                  onClick={() =>
                    setCategoryFilter(categoryFilter === category ? null : category)
                  }
                >
                  {category}
                </FilterChip>
              ))}
            </div>
          </div>
          <div>
            <span className="label-caps">Group</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <FilterChip active={groupFilter === null} onClick={() => setGroupFilter(null)}>
                All groups
              </FilterChip>
              {INVESTIGATION_GROUPS.map((group) => (
                <FilterChip
                  key={group}
                  active={groupFilter === group}
                  onClick={() => setGroupFilter(groupFilter === group ? null : group)}
                >
                  {group}
                </FilterChip>
              ))}
            </div>
          </div>
          {activeFilters ? (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter(null);
                setGroupFilter(null);
              }}
              className="text-2xs font-medium text-water-300 transition hover:text-water-200"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ----------------------------------------------------------- list */}
      <div className="mt-2.5 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {loading && !areas.length ? (
          <p className="flex items-center gap-2 px-1 py-3 text-2xs text-ink-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-water-300" aria-hidden />
            Loading saved investigations…
          </p>
        ) : null}

        {!loading && error ? (
          <p className="rounded-lg border border-signal-alert/30 bg-signal-alert/[0.07] px-2.5 py-2 text-2xs leading-relaxed text-signal-alert">
            {error}
          </p>
        ) : null}

        {!loading && !error && !areas.length ? <EmptyInvestigations onAdd={onAdd} /> : null}

        {!loading && !error && areas.length > 0 && !visible.length ? (
          <p className="px-1 py-3 text-2xs leading-relaxed text-ink-400">
            No investigation matches the current search and filters.
          </p>
        ) : null}

        {visible.map((area) => {
          const annotation = annotationFor(area.id);
          const selected = isSelected(area);
          return (
            <article
              key={area.id}
              className={cn(
                "rounded-lg border px-2.5 py-2.5 transition-colors",
                selected
                  ? "border-water-300/45 bg-water-300/[0.09]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20",
              )}
            >
              <button
                type="button"
                onClick={() => focus(area)}
                aria-current={selected ? "true" : undefined}
                className="flex w-full items-start gap-2.5 text-left"
              >
                <PolygonGlyph color={annotation.color} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink-100">
                    {area.name}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-2xs tabular-nums text-ink-300">
                    {formatCoord(area.location.latitude, "lat")} ·{" "}
                    {formatCoord(area.location.longitude, "lon")}
                  </span>
                  {area.place?.display_name ? (
                    <span className="mt-0.5 block truncate text-2xs text-ink-500">
                      {area.place.display_name}
                    </span>
                  ) : null}
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-px text-3xs uppercase tracking-[0.08em] text-ink-400">
                      {annotation.type}
                    </span>
                    <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-px text-3xs text-ink-300">
                      {annotation.category}
                    </span>
                    <span className="truncate text-3xs text-ink-500">{annotation.group}</span>
                  </span>
                </span>
              </button>

              <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-2">
                <span className="truncate text-3xs text-ink-500">
                  {formatDateTime(area.created_at)}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => focus(area)}
                    aria-label={`Zoom to ${area.name}`}
                    className="rounded-md border border-white/[0.08] p-1 text-ink-400 transition hover:text-ink-100"
                  >
                    <ZoomIn className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  {onEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(area)}
                      aria-label={`Edit ${area.name}`}
                      className="rounded-md border border-white/[0.08] p-1 text-ink-400 transition hover:text-ink-100"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                  <span className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuFor(menuFor === area.id ? null : area.id)}
                      aria-expanded={menuFor === area.id}
                      aria-label={`More actions for ${area.name}`}
                      className="rounded-md border border-white/[0.08] p-1 text-ink-400 transition hover:text-ink-100"
                    >
                      <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    {menuFor === area.id ? (
                      <>
                        <button
                          type="button"
                          className="fixed inset-0 z-30 cursor-default"
                          aria-label="Close actions"
                          onClick={() => setMenuFor(null)}
                        />
                        <ul className="absolute right-0 top-8 z-40 w-40 rounded-lg border border-white/10 bg-abyss-850 p-1 shadow-float">
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                removeAnnotation(area.id);
                                setMenuFor(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs text-ink-200 transition hover:bg-white/10"
                            >
                              Clear annotation
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(`Delete “${area.name}”? This cannot be undone.`)
                                ) {
                                  void remove(area.id);
                                  if (selected) clearLocation();
                                }
                                setMenuFor(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs text-signal-alert transition hover:bg-signal-alert/15"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              Delete
                            </button>
                          </li>
                        </ul>
                      </>
                    ) : null}
                  </span>
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {/* --------------------------------------------------------- count */}
      <div className="mt-2.5 shrink-0 border-t border-white/[0.07] pt-2.5">
        <p className="text-2xs text-ink-400">
          <span className="font-mono tabular-nums text-ink-100">{visible.length}</span> of{" "}
          <span className="font-mono tabular-nums text-ink-100">{areas.length}</span>
          {areas.length === 1 ? " investigation" : " investigations"} shown
        </p>
      </div>
    </div>
  );
}

/**
 * Empty state: a centred pin, a "nothing yet" headline, one line of
 * instruction and a three-step how-to.
 */
function EmptyInvestigations({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex flex-col items-center px-1 py-5 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-white/20">
        <MapPin className="h-4 w-4 text-ink-400" aria-hidden />
      </span>
      <p className="mt-3 text-xs font-semibold text-ink-100">No investigations yet</p>
      <p className="mt-1 text-3xs leading-relaxed text-ink-400">
        Save a place to keep its water evidence together.
      </p>
      <ol className="mt-3.5 w-full space-y-2 text-left">
        {[
          "Search a place, or arm the draw tool on the left toolbar.",
          "Click the map to place an analysis point or area.",
          "Save it, then open its evidence in the Analytics view.",
        ].map((step, index) => (
          <li key={step} className="flex items-start gap-2">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-water-300/15 font-mono text-3xs font-semibold text-water-200">
              {index + 1}
            </span>
            <span className="text-3xs leading-relaxed text-ink-300">{step}</span>
          </li>
        ))}
      </ol>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-water-300/35 bg-water-300/10 px-2 py-1.5 text-2xs font-medium text-water-200 transition hover:bg-water-300/20"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New investigation
        </button>
      ) : null}
    </div>
  );
}
