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
  AIAnalysisReport,
  DischargeSeries,
  LocationSummary,
  PlaceResult,
  PrecipitationComparison,
  PrecipitationSeries,
  StacSearchResult,
  WeatherForecast,
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
  weather: SliceState<WeatherForecast>;
  discharge: SliceState<DischargeSeries>;
  scenes: SliceState<StacSearchResult>;
  ai: SliceState<AIAnalysisReport>;
  selectLocation: (loc: SelectedLocation) => void;
  clearLocation: () => void;
  toggleLayer: (id: LayerId) => void;
  setWindowDays: (days: number) => void;
  refresh: () => void;
  refreshAi: () => void;
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

export function WorkspaceProvider({
  children,
  initialLocation = null,
}: {
  children: ReactNode;
  initialLocation?: SelectedLocation | null;
}) {
  const [location, setLocation] = useState<SelectedLocation | null>(initialLocation);
  const [layers, setLayers] = useState<LayerState>(DEFAULT_Layers);
  const [windowDays, setWindowDaysState] = useState(30);

  const [summary, setSummary] = useState<SliceState<LocationSummary>>(emptySlice());
  const [comparison, setComparison] = useState<SliceState<PrecipitationComparison>>(
    emptySlice(),
  );
  const [forecast, setForecast] = useState<SliceState<PrecipitationSeries>>(emptySlice());
  const [weather, setWeather] = useState<SliceState<WeatherForecast>>(emptySlice());
  const [discharge, setDischarge] = useState<SliceState<DischargeSeries>>(emptySlice());
  const [scenes, setScenes] = useState<SliceState<StacSearchResult>>(emptySlice());
  // AI analysis is generated on demand (it is comparatively expensive), so it
  // is not part of the automatic location load.
  const [ai, setAi] = useState<SliceState<AIAnalysisReport>>(emptySlice());

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
      setWeather({ data: null, loading: true, error: null, errorCode: null });
      setDischarge({ data: null, loading: true, error: null, errorCode: null });
      setScenes({ data: null, loading: true, error: null, errorCode: null });
      // A new location invalidates any previous AI analysis.
      setAi(emptySlice());

      const [
        summaryRes,
        comparisonRes,
        forecastRes,
        weatherRes,
        dischargeRes,
        scenesRes,
      ] = await Promise.allSettled([
        api.summary(latitude, longitude, { label, windowDays: days }),
        api.comparison(latitude, longitude, days, 1),
        api.forecast(latitude, longitude, 7),
        api.weather(latitude, longitude, 7),
        api.discharge(latitude, longitude, 14),
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
      apply(weatherRes, setWeather);
      apply(dischargeRes, setDischarge);
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
    setWeather(emptySlice());
    setDischarge(emptySlice());
    setScenes(emptySlice());
    setAi(emptySlice());
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

  const refreshAi = useCallback(() => {
    if (!location) return;
    setAi({ data: null, loading: true, error: null, errorCode: null });
    api
      .aiAnalysis(location.latitude, location.longitude, {
        label: location.label,
        windowDays,
      })
      .then((report) =>
        setAi({ data: report, loading: false, error: null, errorCode: null }),
      )
      .catch((err: unknown) => {
        const { message, code } = describeError(err);
        setAi({ data: null, loading: false, error: message, errorCode: code });
      });
  }, [location, windowDays]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      location,
      layers,
      windowDays,
      summary,
      comparison,
      forecast,
      weather,
      discharge,
      scenes,
      ai,
      selectLocation,
      clearLocation,
      toggleLayer,
      setWindowDays,
      refresh,
      refreshAi,
    }),
    [
      location,
      layers,
      windowDays,
      summary,
      comparison,
      forecast,
      weather,
      discharge,
      scenes,
      ai,
      selectLocation,
      clearLocation,
      toggleLayer,
      setWindowDays,
      refresh,
      refreshAi,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
