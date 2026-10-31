import { describe, it, expect } from "vitest";
import "../lib/library.js";

const L = RoadmapLibrary;
const now = new Date(2026, 9, 30, 12, 30);
const ago = ms => new Date(now - ms).toISOString();

describe("relTime", () => {
  it("counts minutes and hours today, then days, then a date", () => {
    expect(L.relTime(ago(20_000), now)).toBe("Just now");
    expect(L.relTime(ago(12 * 60_000), now)).toBe("12 min ago");
    expect(L.relTime(ago(3 * 3600_000), now)).toBe("3 hours ago");
    expect(L.relTime(new Date(2026, 9, 29, 23, 0).toISOString(), now)).toBe("Yesterday");
    expect(L.relTime(new Date(2026, 9, 27, 9, 0).toISOString(), now)).toBe("3 days ago");
    expect(L.relTime(new Date(2026, 9, 14).toISOString(), now)).toMatch(/14/);
    expect(L.relTime("not a date", now)).toBe("Unknown");
  });
});

describe("impact", () => {
  const rec = (items = [], history = []) => ({ state: { items }, history });
  it("prefers items to review, then the last advisor run, then source state", () => {
    expect(L.impact(rec([{ reviewNeeded: true }, { reviewNeeded: true }, {}]), 3, now)).toEqual({ label: "2 items to review", tone: "amber" });
    expect(L.impact(rec([], [{ origin_type: "user", timestamp: ago(1000) }, { origin_type: "advisor", timestamp: ago(60_000) }]), 3, now))
      .toEqual({ label: "Assessed today", tone: "green" });
    expect(L.impact(rec(), 0, now)).toEqual({ label: "No sources yet", tone: "" });
    expect(L.impact(rec(), 4, now).label).toBe("Not assessed");
    expect(L.impact(rec(), null, now).label).toBe("Not assessed");
  });
});

describe("filter and sort", () => {
  const list = [
    { id: "a", title: "Beta plan", folderId: "f1", updatedAt: "2026-10-02", createdAt: "2026-01-01", state: { items: [1] } },
    { id: "b", title: "alpha plan", folderId: null, pinned: true, updatedAt: "2026-10-01", createdAt: "2026-05-01", state: { items: [1, 2, 3] } },
    { id: "c", title: "Gamma", folderId: "f1", updatedAt: "2026-10-03", state: { items: [] } }
  ];
  it("filters by folder, pinned and name", () => {
    expect(L.filter(list, "all", "").map(r => r.id)).toEqual(["a", "b", "c"]);
    expect(L.filter(list, "f1", "").map(r => r.id)).toEqual(["a", "c"]);
    expect(L.filter(list, "pinned", "").map(r => r.id)).toEqual(["b"]);
    expect(L.filter(list, "all", " PLAN ").map(r => r.id)).toEqual(["a", "b"]);
  });
  it("keeps pinned first and sorts the rest", () => {
    expect(L.sort(list, "edited").map(r => r.id)).toEqual(["b", "c", "a"]);
    expect(L.sort(list, "name").map(r => r.id)).toEqual(["b", "a", "c"]);
    expect(L.sort(list, "created").map(r => r.id)).toEqual(["b", "c", "a"]); // c falls back to updatedAt
    expect(L.sort(list, "items").map(r => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("thumb and timeline", () => {
  const state = {
    categories: [{ id: "l1", color: "red" }, { id: "l2" }],
    bands: [{ id: "b1", label: "2024" }, { id: "b2", label: "2027" }, { id: "b3", label: "2031" }, { id: "b4", label: "Later" }],
    items: [{ catId: "l1", bands: ["b1", "b2"] }, { catId: "l2", bands: ["b3"] }]
  };
  it("marks the cells items cover, for at most 3 x 3", () => {
    expect(L.thumb(state)).toEqual([{ color: "red", cells: [1, 1, 0] }, { color: "var(--c-slate)", cells: [0, 0, 1] }]);
  });
  it("spans first to last band", () => {
    expect(L.timeline(state)).toBe("2024 – Later");
    expect(L.timeline({ bands: [] })).toBe("No time bands");
  });
});
