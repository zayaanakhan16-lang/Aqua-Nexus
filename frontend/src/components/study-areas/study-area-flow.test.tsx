import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateStudyAreaDialog } from "@/components/study-areas/CreateStudyAreaDialog";
import { StudyAreaProvider, useStudyAreas } from "@/lib/study-areas";
import { ToastProvider } from "@/lib/toast";

const SAVED = {
  id: "sa-1",
  name: "Lagos Lagoon",
  location: { latitude: 6.45, longitude: 3.39 },
  label: "Lagos, Nigeria",
  place: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <StudyAreaProvider>{children}</StudyAreaProvider>
    </ToastProvider>
  );
}

function ListProbe() {
  const { areas, loading } = useStudyAreas();
  return (
    <p data-testid="count">
      {loading ? "loading" : areas.length}:{areas.map((a) => a.name).join(",")}
    </p>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("study-area persistence flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads saved areas from the API on mount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ count: 1, study_areas: [SAVED] }),
    );

    render(
      <Harness>
        <ListProbe />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1:Lagos Lagoon"));
  });

  it("saves a new area and reflects it in the store, then reports success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const method = init?.method ?? "GET";
      if (method === "POST") return jsonResponse(SAVED, 201);
      return jsonResponse({ count: 0, study_areas: [] });
    });

    const onCreated = vi.fn();
    render(
      <Harness>
        <CreateStudyAreaDialog
          open
          onClose={() => {}}
          latitude={6.45}
          longitude={3.39}
          label="Lagos, Nigeria"
          onCreated={onCreated}
        />
        <ListProbe />
      </Harness>,
    );

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("0:"));

    fireEvent.change(screen.getByLabelText(/study-area name/i), {
      target: { value: "Lagos Lagoon" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save study area/i }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "sa-1" })),
    );
    expect(screen.getByTestId("count")).toHaveTextContent("1:Lagos Lagoon");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("keeps the dialog open and surfaces the error when the save fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        return jsonResponse(
          { error: { code: "storage_error", message: "Could not persist study area." } },
          500,
        );
      }
      return jsonResponse({ count: 0, study_areas: [] });
    });

    const onCreated = vi.fn();
    render(
      <Harness>
        <CreateStudyAreaDialog
          open
          onClose={() => {}}
          latitude={6.45}
          longitude={3.39}
          onCreated={onCreated}
        />
      </Harness>,
    );

    const nameField = screen.getByLabelText(/study-area name/i);
    fireEvent.change(nameField, { target: { value: "Failing Area" } });
    fireEvent.click(screen.getByRole("button", { name: /save study area/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not persist study area/i),
    );
    expect(onCreated).not.toHaveBeenCalled();
    // The user's typed value is preserved.
    expect(nameField).toHaveValue("Failing Area");
  });
});
