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

it("applies each tab's change to the newest saved collection", () => {
  let value = JSON.stringify({ roadmaps: [{ id: "a", n: 1 }] });
  const storage = { getItem: () => value, setItem: (key, next) => { value = next; } };
  const tabA = [{ id: "a", n: 1 }]; // tab A loaded before tab B saved
  RoadmapStorage.update(storage, "key", [], list => [{ id: "b" }, ...list]); // tab B duplicates
  const { roadmaps } = RoadmapStorage.update(storage, "key", tabA, list => list.map(r => r.id === "a" ? { ...r, n: 2 } : r));
  expect(roadmaps).toEqual([{ id: "b" }, { id: "a", n: 2 }]);
  value = "not json";
  expect(RoadmapStorage.update(storage, "key", tabA, list => list).roadmaps).toEqual(tabA);
});
