import { describe, expect, it } from "vitest";

import {
  WORKSPACE_GROUPS,
  WORKSPACE_SECTIONS,
  firstSectionOf,
  groupForTab,
  isWorkspaceTabId,
} from "@/lib/navigation";

/**
 * Sections are chosen from one flat chip row inside the workspace, so the app
 * shell carries no tabs and the two levels can no longer disagree. The groups
 * survive only as presentation: they order the chip row and supply the quiet
 * group label above the heading. These invariants keep a section from being
 * dropped or listed twice when that ordering is derived.
 */
describe("workspace navigation", () => {
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

  it("lists the flat chip row in group order, with no gaps", () => {
    const flat = WORKSPACE_GROUPS.flatMap((group) => group.sections.map((s) => s.id));
    expect(WORKSPACE_SECTIONS.map((s) => s.id)).toEqual(flat);
  });

  it("accepts only real section ids as URL parameters", () => {
    expect(isWorkspaceTabId("flood")).toBe(true);
    expect(isWorkspaceTabId("not-a-section")).toBe(false);
    expect(isWorkspaceTabId(null)).toBe(false);
  });
});
