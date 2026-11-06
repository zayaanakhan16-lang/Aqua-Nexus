import { describe, expect, it } from "vitest";

import {
  WORKSPACE_GROUPS,
  WORKSPACE_SECTIONS,
  firstSectionOf,
  groupForTab,
  isWorkspaceTabId,
} from "@/lib/navigation";

/**
 * The two-level navigation (top bar of eight destinations, section control
 * inside the workspace) is derived, so it only works while every section
 * belongs to exactly one group. These are the invariants that keep the two
 * levels from disagreeing or from silently dropping a section.
 */
describe("workspace navigation", () => {
  it("has exactly eight primary destinations", () => {
    expect(WORKSPACE_GROUPS).toHaveLength(8);
  });

  it("assigns every section to exactly one group", () => {
    const seen = WORKSPACE_SECTIONS.map((section) => section.id);
    expect(new Set(seen).size).toBe(seen.length);
    for (const section of WORKSPACE_SECTIONS) {
      expect(groupForTab(section.id).sections.map((s) => s.id)).toContain(section.id);
    }
  });

  it("gives every group at least one section and a unique id", () => {
    const ids = WORKSPACE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of WORKSPACE_GROUPS) {
      expect(group.sections.length).toBeGreaterThan(0);
      expect(firstSectionOf(group)).toBe(group.sections[0]);
    }
  });

  it("round-trips every section through its group", () => {
    for (const section of WORKSPACE_SECTIONS) {
      const group = groupForTab(section.id);
      expect(firstSectionOf(group).id).toBe(group.sections[0]!.id);
    }
  });

  it("accepts only real section ids as URL parameters", () => {
    expect(isWorkspaceTabId("flood")).toBe(true);
    expect(isWorkspaceTabId("not-a-section")).toBe(false);
    expect(isWorkspaceTabId(null)).toBe(false);
  });
});
