"use client";

/**
 * Global location search.
 *
 * Combines free-text gazetteer search with a direct coordinate parser, so a
 * user can pick a location even when a dataset does not cover it. Keyboard
 * navigable; results are debounced and abortable.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";

import { ApiError, api } from "@/lib/api";
import { parseCoordinates } from "@/lib/geo";
import type { PlaceResult } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

export function LocationSearch() {
  const { selectLocation } = useWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // After a place is chosen we write its display name into the input; this ref
  // prevents the debounced effect from immediately re-searching that name and
  // reopening the dropdown.
  const justSelectedRef = useRef<string | null>(null);

  const choose = useCallback(
    (place: PlaceResult) => {
      selectLocation({
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.display_name,
        place,
      });
      justSelectedRef.current = place.display_name;
      setQuery(place.display_name);
      setOpen(false);
      setResults([]);
    },
    [selectLocation],
  );

  const chooseCoordinate = useCallback(
    (lat: number, lon: number) => {
      selectLocation({
        latitude: lat,
        longitude: lon,
        label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        place: null,
      });
      setOpen(false);
      setResults([]);
    },
    [selectLocation],
  );

  // Debounced search; coordinates resolve immediately without a network call.
  useEffect(() => {
    const trimmed = query.trim();

    // Skip the search that would be triggered by writing a chosen place name
    // back into the input.
    if (justSelectedRef.current !== null) {
      if (trimmed === justSelectedRef.current) {
        justSelectedRef.current = null;
        return;
      }
      justSelectedRef.current = null;
    }

    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const coords = parseCoordinates(trimmed);
    if (coords) {
      setResults([]);
      setError(null);
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      api
        .geocode(trimmed, 8, controller.signal)
        .then((res) => {
          setResults(res.results);
          setOpen(true);
          setActiveIndex(-1);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResults([]);
          setError(
            err instanceof ApiError ? err.message : "Search is temporarily unavailable.",
          );
        })
        .finally(() => setLoading(false));
    }, 320);

    return () => clearTimeout(timer);
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const coordinates = parseCoordinates(query);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      const trimmed = query.trim();
      if (activeIndex >= 0 && results[activeIndex]) {
        event.preventDefault();
        choose(results[activeIndex]!);
        return;
      }
      const coords = parseCoordinates(trimmed);
      if (coords) {
        event.preventDefault();
        chooseCoordinate(coords.lat, coords.lon);
      }
    } else if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          aria-hidden
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label="Search for a place or enter coordinates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a city, river, lake — or type 52.52, 13.40"
          className="h-10 w-full rounded-lg border border-white/10 bg-abyss-850/90 pl-9 pr-9 text-sm text-ink-100 placeholder:text-ink-500 transition focus:border-water-400/50 focus:bg-abyss-850"
        />
        {loading ? (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-water-300"
            aria-hidden
          />
        ) : query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setResults([]);
              setError(null);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 transition hover:text-ink-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {open && (results.length > 0 || coordinates || error) ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-lg border border-white/10 bg-abyss-900/97 p-1 shadow-float backdrop-blur animate-fade-in"
        >
          {coordinates ? (
            <button
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => chooseCoordinate(coordinates.lat, coordinates.lon)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-water-400/10"
            >
              <MapPin className="h-4 w-4 shrink-0 text-teal-400" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-100">
                  Go to coordinates
                </span>
                <span className="block font-mono text-xs text-ink-400">
                  {coordinates.lat.toFixed(4)}, {coordinates.lon.toFixed(4)}
                </span>
              </span>
            </button>
          ) : null}

          {error ? (
            <p className="px-3 py-2 text-xs text-signal-alert">{error}</p>
          ) : null}

          {results.map((place, index) => (
            <button
              key={`${place.id}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(place)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition",
                index === activeIndex ? "bg-water-400/10" : "hover:bg-white/[0.04]",
              )}
            >
              <MapPin className="h-4 w-4 shrink-0 text-water-300" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-100">{place.name}</span>
                <span className="block truncate text-xs text-ink-400">
                  {place.display_name}
                </span>
              </span>
              <span className="ml-auto shrink-0 font-mono text-[0.6875rem] text-ink-500">
                {place.latitude.toFixed(2)}, {place.longitude.toFixed(2)}
              </span>
            </button>
          ))}

          {!results.length && !coordinates && !error && !loading ? (
            <p className="px-3 py-2 text-xs text-ink-400">No matching places found.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
