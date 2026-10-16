import { it, expect } from "vitest";
import "../lib/storage.js";

it("reports failed persistence without destroying existing data", () => {
  let value = "previous roadmap";
  const storage = { setItem() { throw new Error("quota exceeded"); } };
  expect(RoadmapStorage.save(storage, "key", [])).toContain("not saved");
  expect(value).toBe("previous roadmap");
  storage.setItem = (key, next) => { value = next; };
  expect(RoadmapStorage.save(storage, "key", [{ id: "a" }])).toBe("");
  expect(JSON.parse(value)).toEqual({ roadmaps: [{ id: "a" }] });
});

it("never saves the previous roadmap into the newly navigated route", () => {
  const state = { categories: [], bands: [], items: [] };
  expect(RoadmapStorage.canPersist({ view: "builder", id: "b" }, "a", state)).toBe(false);
  expect(RoadmapStorage.canPersist({ view: "builder", id: "b" }, "b", state)).toBe(true);
  expect(RoadmapStorage.canPersist({ view: "roadmaps" }, "b", state)).toBe(false);
});
