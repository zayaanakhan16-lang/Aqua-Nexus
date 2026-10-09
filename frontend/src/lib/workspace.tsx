"use client";

/**
 * Workspace state: the single source of truth for the operational session.
 *
 * One selected location drives map, panels and charts. Data is fetched here
 * (not inside every component) so requests are made once per location change,
 * and provider failures are captured per-slice rather than globally.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiError, api } from "@/lib/api";
import type {
  LocationSummary,
  PlaceResult,
  PrecipitationComparison,
  PrecipitationSeries,
  StacSearchResult,
} from "@/lib/schemas";

export type LayerId = "precipitation" | "discharge" | "satellite" | "places";

export interface LayerState {
  precipitation: boolean;
  discharge: boolean;
  satellite: boolean;
  places: boolean;
}

export interface SelectedLocation {
  latitude: number;
  longitude: number;
  label: string;
  place?: PlaceResult | null;
}

export interface SliceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
}

function emptySlice<T>(): SliceState<T> {
  return { data: null, loading: false, error: null, errorCode: null };
}

interface WorkspaceValue {
  location: SelectedLocation | null;
  layers: LayerState;
  windowDays: number;
  summary: SliceState<LocationSummary>;
  comparison: SliceState<PrecipitationComparison>;
  forecast: SliceState<PrecipitationSeries>;
  scenes: SliceState<StacSearchResult>;
  selectLocation: (loc: SelectedLocation) => void;
  clearLocation: () => void;
  toggleLayer: (id: LayerId) => void;
  setWindowDays: (days: number) => void;
  refresh: () => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const DEFAULT_Layers: LayerState = {
  precipitation: true,
  discharge: true,
  satellite: false,
  places: true,
};

function describeError(error: unknown): { message: string; code: string | null } {
  if (error instanceof ApiError) {
    return { message: error.message, code: error.code };
  }
  if (error instanceof Error) return { message: error.message, code: null };
  return { message: "An unknown error occurred.", code: null };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [layers, setLayers] = useState<LayerState>(DEFAULT_Layers);
  const [windowDays, setWindowDaysState] = useState(30);

  const [summary, setSummary] = useState<SliceState<LocationSummary>>(emptySlice());
  const [comparison, setComparison] = useState<SliceState<PrecipitationComparison>>(
    emptySlice(),
  );
  const [forecast, setForecast] = useState<SliceState<PrecipitationSeries>>(emptySlice());
  const [scenes, setScenes] = useState<SliceState<StacSearchResult>>(emptySlice());

  // Monotonic token so a slow response from an old location cannot overwrite a
  // newer one.
  const requestToken = useRef(0);

  const load = useCallback(
    async (loc: SelectedLocation, days: number) => {
      const token = ++requestToken.current;
      const { latitude, longitude, label } = loc;

      setSummary({ data: null, loading: true, error: null, errorCode: null });
      setComparison({ data: null, loading: true, error: null, errorCode: null });
      setForecast({ data: null, loading: true, error: null, errorCode: null });
      setScenes({ data: null, loading: true, error: null, errorCode: null });

      const [summaryRes, comparisonRes, forecastRes, scenesRes] = await Promise.allSettled([
        api.summary(latitude, longitude, { label, windowDays: days }),
        api.comparison(latitude, longitude, days, 1),
        api.forecast(latitude, longitude, 7),
        api.scenes(latitude, longitude, { days: 30, limit: 12 }),
      ]);

      if (token !== requestToken.current) return; // superseded

      const apply = <T,>(
        result: PromiseSettledResult<T>,
        setter: (s: SliceState<T>) => void,
      ) => {
        if (result.status === "fulfilled") {
          setter({ data: result.value, loading: false, error: null, errorCode: null });
        } else {
          const { message, code } = describeError(result.reason);
          setter({ data: null, loading: false, error: message, errorCode: code });
        }
      };

      apply(summaryRes, setSummary);
      apply(comparisonRes, setComparison);
      apply(forecastRes, setForecast);
      apply(scenesRes, setScenes);
    },
    [],
  );

  // Refetch when the location or the analysis window changes.
  useEffect(() => {
    if (location) void load(location, windowDays);
  }, [location, windowDays, load]);

  const selectLocation = useCallback((loc: SelectedLocation) => {
    setLocation(loc);
  }, []);

  const clearLocation = useCallback(() => {
    requestToken.current++;
    setLocation(null);
    setSummary(emptySlice());
    setComparison(emptySlice());
    setForecast(emptySlice());
    setScenes(emptySlice());
  }, []);

  const toggleLayer = useCallback((id: LayerId) => {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const setWindowDays = useCallback((days: number) => {
    setWindowDaysState(days);
  }, []);

  const refresh = useCallback(() => {
    if (location) void load(location, windowDays);
  }, [location, windowDays, load]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      location,
      layers,
      windowDays,
      summary,
      comparison,
      forecast,
      scenes,
      selectLocation,
      clearLocation,
      toggleLayer,
      setWindowDays,
      refresh,
    }),
    [
      location,
      layers,
      windowDays,
      summary,
      comparison,
      forecast,
      scenes,
      selectLocation,
      clearLocation,
      toggleLayer,
      setWindowDays,
      refresh,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
