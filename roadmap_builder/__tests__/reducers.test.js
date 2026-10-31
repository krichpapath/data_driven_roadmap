// Functional tests for App-level pure reducers exposed via lib/exports.js.
// These mirror the in-component setState callbacks in app.jsx — adding /
// editing / moving items, structure changes, advisor advice merge, selection
// toggling, and import-JSON validation.
//
// See docs/TESTING.md for the philosophy + how to add a new test.
import { describe, it, expect } from "vitest";
import {
  upsertItem,
  deleteItem,
  moveItem,
  saveStructure,
  applyAdvisorAdvice,
  toggleInSet,
  validateRoadmap,
} from "../lib/exports.js";

// ─── Sample state ───────────────────────────────────────────────────────────

const baseState = () => ({
  title: "Demo",
  templateId: "demo",
  categories: [
    { id: "c1", label: "Drivers", color: "var(--c-blue)" },
    { id: "c2", label: "Products", color: "var(--c-violet)" },
  ],
  bands: [
    { id: "b1", label: "Now" },
    { id: "b2", label: "Next" },
    { id: "b3", label: "Later" },
  ],
  items: [
    { id: "i1", name: "GenAI growth",  catId: "c1", bands: ["b1"], pestle: ["T"] },
    { id: "i2", name: "ASEAN platform", catId: "c2", bands: ["b2", "b3"], pestle: [] },
  ],
});

// ─── upsertItem ─────────────────────────────────────────────────────────────

describe("upsertItem", () => {
  it("appends a new item when id is unseen", () => {
    const next = upsertItem(baseState(), {
      id: "i3", name: "New item", catId: "c1", bands: ["b1"], pestle: [],
    });
    expect(next.items).toHaveLength(3);
    expect(next.items[2].id).toBe("i3");
  });

  it("replaces an existing item by id, preserving order", () => {
    const updated = { id: "i1", name: "Renamed", catId: "c1", bands: ["b1"], pestle: ["T", "E"] };
    const next = upsertItem(baseState(), updated);
    expect(next.items).toHaveLength(2);
    expect(next.items[0].name).toBe("Renamed");
    expect(next.items[0].pestle).toEqual(["T", "E"]);
    // Sibling item unchanged.
    expect(next.items[1].name).toBe("ASEAN platform");
  });

  it("returns a new object — does not mutate input", () => {
    const before = baseState();
    const after = upsertItem(before, {
      id: "i9", name: "X", catId: "c1", bands: ["b1"], pestle: [],
    });
    expect(after).not.toBe(before);
    expect(after.items).not.toBe(before.items);
    expect(before.items).toHaveLength(2);   // input still untouched
  });
});

// ─── deleteItem ─────────────────────────────────────────────────────────────

describe("deleteItem", () => {
  it("removes the matching item", () => {
    const next = deleteItem(baseState(), "i1");
    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).toBe("i2");
  });

  it("is a no-op for unknown ids", () => {
    const next = deleteItem(baseState(), "i999");
    expect(next.items).toHaveLength(2);
  });
});

// ─── moveItem ───────────────────────────────────────────────────────────────

describe("moveItem", () => {
  it("changes catId and collapses bands to single target", () => {
    // Move multi-band item i2 from Products/[Next, Later] to Drivers/Now.
    const next = moveItem(baseState(), "i2", "c1", "b1");
    const moved = next.items.find(i => i.id === "i2");
    expect(moved.catId).toBe("c1");
    expect(moved.bands).toEqual(["b1"]);   // collapsed to single band
  });

  it("leaves other items untouched", () => {
    const next = moveItem(baseState(), "i2", "c1", "b1");
    expect(next.items.find(i => i.id === "i1")).toEqual(baseState().items[0]);
  });
});

// ─── saveStructure (cleanup behaviour) ──────────────────────────────────────

describe("saveStructure", () => {
  it("drops items whose layer was removed", () => {
    // Remove c2 (Products) → i2 should be removed.
    const next = saveStructure(
      baseState(),
      [{ id: "c1", label: "Drivers", color: "x" }],
      baseState().bands,
    );
    expect(next.items.map(i => i.id)).toEqual(["i1"]);
  });

  it("trims item.bands to surviving band ids", () => {
    // Drop band b3. i2 had ["b2", "b3"] → should keep ["b2"].
    const next = saveStructure(
      baseState(),
      baseState().categories,
      [{ id: "b1", label: "Now" }, { id: "b2", label: "Next" }],
    );
    const i2 = next.items.find(i => i.id === "i2");
    expect(i2.bands).toEqual(["b2"]);
  });

  it("removes items whose bands all disappeared", () => {
    // Drop b1. i1 had ["b1"] → bands becomes [] → item dropped.
    const next = saveStructure(
      baseState(),
      baseState().categories,
      [{ id: "b2", label: "Next" }, { id: "b3", label: "Later" }],
    );
    expect(next.items.map(i => i.id)).toEqual(["i2"]);
  });

  it("replaces categories + bands wholesale on the result", () => {
    const newCats = [{ id: "cX", label: "Renamed", color: "z" }];
    const newBands = [{ id: "bX", label: "OnlyBand" }];
    const next = saveStructure(baseState(), newCats, newBands);
    expect(next.categories).toBe(newCats);
    expect(next.bands).toBe(newBands);
    // No surviving items because none reference the new ids.
    expect(next.items).toEqual([]);
  });
});

// ─── applyAdvisorAdvice ─────────────────────────────────────────────────────

describe("applyAdvisorAdvice", () => {
  const advisorEntries = () => [{
    item_id: "i1",
    item_name: "GenAI growth",
    advices: [
      { role: "Technological", action: "Adjust", advice: "Add monitoring" },
    ],
  }];

  it("flags reviewNeeded + records the verdict on matched items", () => {
    const next = applyAdvisorAdvice(baseState(), advisorEntries(), "Adjust");
    const i1 = next.items.find(i => i.id === "i1");
    expect(i1.reviewNeeded).toBe(true);
    expect(i1.lastImpactVerdict).toBe("Adjust");
    expect(i1.advice).toContain("Impact review (Adjust)");
    expect(i1.advice).toContain("[Technological (Adjust)] Add monitoring");
    expect(i1.notes).toBe("");
  });

  it("does not duplicate advice that is already on the item", () => {
    const once = applyAdvisorAdvice(baseState(), advisorEntries(), "Adjust");
    const twice = applyAdvisorAdvice(once, advisorEntries(), "Adjust");
    expect(twice.items.find(i => i.id === "i1").advice).toBe(once.items.find(i => i.id === "i1").advice);
  });

  it("does not touch unmatched items", () => {
    const next = applyAdvisorAdvice(baseState(), advisorEntries(), "Adjust");
    const i2 = next.items.find(i => i.id === "i2");
    expect(i2.reviewNeeded).toBeUndefined();
    expect(i2.advice).toBeUndefined();
  });

  it("appends to existing advice with a blank-line separator and leaves user notes alone", () => {
    const seeded = baseState();
    seeded.items[0].notes = "My note";
    seeded.items[0].advice = "Old advice";
    const next = applyAdvisorAdvice(seeded, advisorEntries(), "Revise");
    const i1 = next.items.find(i => i.id === "i1");
    expect(i1.notes).toBe("My note");
    expect(i1.advice.startsWith("Old advice\n\n")).toBe(true);
    expect(i1.advice).toContain("Impact review (Revise)");
  });

  it("moves legacy advice out of the notes before appending", () => {
    const seeded = baseState();
    seeded.items[0].notes = "Mine\n\nImpact review (Adjust): Old";
    const i1 = applyAdvisorAdvice(seeded, advisorEntries(), "Revise").items.find(i => i.id === "i1");
    expect(i1.notes).toBe("Mine");
    expect(i1.advice.startsWith("Impact review (Adjust): Old\n\nImpact review (Revise)")).toBe(true);
  });

  it("returns the input unchanged when entries list is empty", () => {
    const before = baseState();
    expect(applyAdvisorAdvice(before, [], "Adjust")).toBe(before);
  });
});

// ─── toggleInSet ────────────────────────────────────────────────────────────

describe("toggleInSet", () => {
  it("adds when value absent", () => {
    const out = toggleInSet(new Set(["a"]), "b");
    expect([...out].sort()).toEqual(["a", "b"]);
  });

  it("removes when value present", () => {
    const out = toggleInSet(new Set(["a", "b"]), "a");
    expect([...out]).toEqual(["b"]);
  });

  it("returns a new Set instance", () => {
    const orig = new Set(["a"]);
    expect(toggleInSet(orig, "b")).not.toBe(orig);
    expect(orig.size).toBe(1);
  });
});

// ─── validateRoadmap ────────────────────────────────────────────────────────

describe("validateRoadmap", () => {
  it("accepts a well-formed roadmap", () => {
    expect(validateRoadmap(baseState())).toBe(true);
  });

  it("rejects items spanning non-neighbouring bands or with unknown PESTLE tags", () => {
    const s = baseState();
    const gap = { ...s, bands: [...s.bands, { id: "bx", label: "X" }, { id: "by", label: "Y" }] };
    gap.items = [{ ...s.items[0], bands: [s.bands[0].id, "by"] }];
    expect(() => validateRoadmap(gap)).toThrow(/neighbouring/);
    expect(() => validateRoadmap({ ...s, items: [{ ...s.items[0], pestle: ["Q"] }] })).toThrow(/PESTLE/);
  });

  it("rejects null / array / non-object inputs", () => {
    expect(() => validateRoadmap(null)).toThrow(/must be an object/);
    expect(() => validateRoadmap([])).toThrow(/must be an object/);
    expect(() => validateRoadmap("string")).toThrow(/must be an object/);
  });

  it("rejects missing categories / bands / items arrays", () => {
    expect(() => validateRoadmap({ bands: [], items: [] }))
      .toThrow(/categories as an array/);
    expect(() => validateRoadmap({ categories: [], items: [] }))
      .toThrow(/bands as an array/);
    expect(() => validateRoadmap({ categories: [], bands: [] }))
      .toThrow(/items as an array/);
  });

  it("rejects empty categories / bands", () => {
    expect(() => validateRoadmap({ categories: [], bands: [{ id: "b1", label: "Now" }], items: [] }))
      .toThrow(/at least one layer/);
    expect(() => validateRoadmap({ categories: [{ id: "c1", label: "X" }], bands: [], items: [] }))
      .toThrow(/at least one time band/);
  });

  it("rejects items that reference unknown layers or bands", () => {
    const bad = baseState();
    bad.items.push({ id: "i9", name: "Orphan", catId: "ghost", bands: ["b1"], pestle: [] });
    expect(() => validateRoadmap(bad)).toThrow(/reference an existing layer/);

    const badBand = baseState();
    badBand.items.push({ id: "i9", name: "Orphan", catId: "c1", bands: ["ghost"], pestle: [] });
    expect(() => validateRoadmap(badBand)).toThrow(/reference existing time bands/);
  });

  it("rejects items missing a name", () => {
    const bad = baseState();
    bad.items.push({ id: "i9", catId: "c1", bands: ["b1"] });
    expect(() => validateRoadmap(bad)).toThrow(/must include a name/);
  });

  it("rejects items with empty bands array", () => {
    const bad = baseState();
    bad.items.push({ id: "i9", name: "X", catId: "c1", bands: [] });
    expect(() => validateRoadmap(bad)).toThrow(/at least one time band/);
  });
});

// ─── End-to-end shape: simulate a small user session ────────────────────────

describe("composed scenario — multi-step user session", () => {
  it("add → edit → move → restructure → advisor preserves invariants", () => {
    // 1. Start from a fresh roadmap.
    let s = baseState();

    // 2. User adds a new item.
    s = upsertItem(s, {
      id: "i3", name: "Edge AI", catId: "c1", bands: ["b2"], pestle: ["T"],
    });
    expect(s.items).toHaveLength(3);

    // 3. User edits its name.
    s = upsertItem(s, {
      id: "i3", name: "Edge AI (renamed)", catId: "c1", bands: ["b2"], pestle: ["T", "E"],
    });
    const renamed = s.items.find(i => i.id === "i3");
    expect(renamed.name).toBe("Edge AI (renamed)");
    expect(renamed.pestle).toEqual(["T", "E"]);

    // 4. User drags it to Products / Now.
    s = moveItem(s, "i3", "c2", "b1");
    expect(s.items.find(i => i.id === "i3").catId).toBe("c2");

    // 5. User restructures: removes "Later" band.
    s = saveStructure(s, s.categories, [{ id: "b1", label: "Now" }, { id: "b2", label: "Next" }]);
    // i2 had ["b2","b3"] → keeps ["b2"]. Nothing else affected.
    expect(s.items.find(i => i.id === "i2").bands).toEqual(["b2"]);

    // 6. Advisor flags i1 + i2 as needing review.
    s = applyAdvisorAdvice(s, [
      { item_id: "i1", item_name: "GenAI growth", advices: [
          { role: "Technological", action: "Revise", advice: "Re-scope timing" }] },
      { item_id: "i2", item_name: "ASEAN platform", advices: [
          { role: "Economic", action: "Revise", advice: "Watch costs" }] },
    ], "Revise");
    expect(s.items.find(i => i.id === "i1").reviewNeeded).toBe(true);
    expect(s.items.find(i => i.id === "i2").reviewNeeded).toBe(true);
    expect(s.items.find(i => i.id === "i3").reviewNeeded).toBeUndefined();

    // 7. Validate the resulting roadmap is still consistent.
    expect(validateRoadmap(s)).toBe(true);
  });
});
