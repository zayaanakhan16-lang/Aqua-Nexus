"use client";

/**
 * Study-area store.
 *
 * Owns the list of saved study areas and the CRUD operations that mutate it.
 * Persistence lives in the backend (`/api/v1/study-areas`); this store never
 * pretends a location is saved when the request failed — callers receive the
 * thrown error and can render an honest failure state.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, api } from "@/lib/api";
import type { PlaceResult, StudyArea } from "@/lib/schemas";

interface StudyAreaValue {
  areas: StudyArea[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: {
    name: string;
    latitude: number;
    longitude: number;
    label?: string | null;
    place?: PlaceResult | null;
  }) => Promise<StudyArea>;
  rename: (id: string, name: string) => Promise<StudyArea>;
  remove: (id: string) => Promise<void>;
  getById: (id: string) => StudyArea | undefined;
}

const StudyAreaContext = createContext<StudyAreaValue | null>(null);

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}

export function StudyAreaProvider({ children }: { children: ReactNode }) {
  const [areas, setAreas] = useState<StudyArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listStudyAreas();
      setAreas(data.study_areas);
    } catch (err) {
      setError(describe(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback<StudyAreaValue["create"]>(async (input) => {
    const area = await api.createStudyArea(input);
    setAreas((prev) => [area, ...prev]);
    return area;
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    const updated = await api.renameStudyArea(id, name);
    setAreas((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteStudyArea(id);
    setAreas((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const getById = useCallback(
    (id: string) => areas.find((a) => a.id === id),
    [areas],
  );

  const value = useMemo<StudyAreaValue>(
    () => ({ areas, loading, error, reload, create, rename, remove, getById }),
    [areas, loading, error, reload, create, rename, remove, getById],
  );

  return <StudyAreaContext.Provider value={value}>{children}</StudyAreaContext.Provider>;
}

export function useStudyAreas(): StudyAreaValue {
  const ctx = useContext(StudyAreaContext);
  if (!ctx) throw new Error("useStudyAreas must be used within a StudyAreaProvider");
  return ctx;
}
