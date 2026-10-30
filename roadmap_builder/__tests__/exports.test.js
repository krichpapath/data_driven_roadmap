// Tests for pure helpers exposed via roadmap_builder/lib/exports.js.
// See exports.js header comment for why this mirror exists.
import { describe, it, expect } from "vitest";
import {
  titleOf,
  isValidRoadmapState,
  parseRoute,
  csvEscape,
  buildSelectionJson,
  buildSelectionCsv,
  buildSelectionText,
  formatGuidanceNote,
} from "../lib/exports.js";

// ─── titleOf ────────────────────────────────────────────────────────────────

describe("titleOf", () => {
  it("returns trimmed title", () => {
    expect(titleOf({ title: "  My Roadmap  " })).toBe("My Roadmap");
  });
  it("falls back to 'Untitled Roadmap' for empty / null / missing", () => {
    expect(titleOf({})).toBe("Untitled Roadmap");
    expect(titleOf({ title: "" })).toBe("Untitled Roadmap");
    expect(titleOf({ title: "   " })).toBe("Untitled Roadmap");
    expect(titleOf(null)).toBe("Untitled Roadmap");
  });
});

// ─── isValidRoadmapState ────────────────────────────────────────────────────

describe("isValidRoadmapState", () => {
  it("accepts a roadmap with all three arrays", () => {
    expect(isValidRoadmapState({
      categories: [], bands: [], items: [],
    })).toBe(true);
  });
  it("rejects null / arrays / missing fields", () => {
    expect(isValidRoadmapState(null)).toBe(false);
    expect(isValidRoadmapState([])).toBe(false);
    expect(isValidRoadmapState({ categories: [], bands: [] })).toBe(false);
    expect(isValidRoadmapState({
      categories: "x", bands: [], items: [],
    })).toBe(false);
  });
});

// ─── parseRoute ─────────────────────────────────────────────────────────────

describe("parseRoute", () => {
  it("empty hash → empty view", () => {
    expect(parseRoute("")).toEqual({ view: "empty" });
    expect(parseRoute("#")).toEqual({ view: "empty" });
    expect(parseRoute("#/")).toEqual({ view: "empty" });
  });
  it("/roadmaps → list view", () => {
    expect(parseRoute("#/roadmaps")).toEqual({ view: "roadmaps" });
  });
  it("/roadmaps/new → new view", () => {
    expect(parseRoute("#/roadmaps/new")).toEqual({ view: "new" });
    expect(parseRoute("#/roadmaps/new/templates")).toEqual({ view: "new", picker: true });
  });
  it("/roadmaps/:id → builder view with id", () => {
    expect(parseRoute("#/roadmaps/abc123")).toEqual({
      view: "builder", id: "abc123",
    });
  });
  it("/roadmaps/:id/import → builder view with action", () => {
    expect(parseRoute("#/roadmaps/abc/import")).toEqual({
      view: "builder", id: "abc", action: "import",
    });
  });
  it("/roadmaps/:id/sources and /impact → builder tabs", () => {
    expect(parseRoute("#/roadmaps/abc/sources")).toEqual({ view: "builder", id: "abc", tab: "sources" });
    expect(parseRoute("#/roadmaps/abc/impact")).toEqual({ view: "builder", id: "abc", tab: "impact" });
  });
  it("unknown path → not-found", () => {
    expect(parseRoute("#/foo")).toEqual({ view: "not-found" });
    expect(parseRoute("#/sources")).toEqual({ view: "not-found" });
    expect(parseRoute("#/roadmaps/abc/whatever")).toEqual({ view: "not-found" });
  });
});

// ─── csvEscape ──────────────────────────────────────────────────────────────

describe("csvEscape", () => {
  it("wraps every value in double quotes", () => {
    expect(csvEscape("simple")).toBe('"simple"');
  });
  it("doubles internal quotes per RFC 4180", () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
  });
  it("preserves commas and newlines verbatim inside quotes", () => {
    expect(csvEscape("a,b\nc")).toBe('"a,b\nc"');
  });
  it("treats null / undefined as empty string", () => {
    expect(csvEscape(null)).toBe('""');
    expect(csvEscape(undefined)).toBe('""');
  });
});

// ─── Selection export builders ──────────────────────────────────────────────

const SAMPLE_STATE = {
  title: "Demo",
  templateId: "demo",
  categories: [
    { id: "c1", label: "Drivers", color: "var(--c-blue)" },
    { id: "c2", label: "Products", color: "var(--c-violet)" },
  ],
  bands: [
    { id: "b1", label: "Now" },
    { id: "b2", label: "Later" },
  ],
  items: [],
};

const SAMPLE_PICK = [
  { id: "i1", name: "GenAI growth", catId: "c1", bands: ["b1"], pestle: ["T", "E"], description: "matters" },
  { id: "i2", name: "Has, comma", catId: "c2", bands: ["b1", "b2"], pestle: [],   description: "" },
];

describe("buildSelectionJson", () => {
  it("includes only categories/bands referenced by picked items", () => {
    const json = JSON.parse(buildSelectionJson(SAMPLE_STATE, SAMPLE_PICK));
    expect(json.title).toBe("Demo (selection)");
    expect(json.categories.map(c => c.id).sort()).toEqual(["c1", "c2"]);
    expect(json.bands.map(b => b.id).sort()).toEqual(["b1", "b2"]);
    expect(json.items).toHaveLength(2);
  });
  it("empty pick produces empty arrays but valid JSON", () => {
    const json = JSON.parse(buildSelectionJson(SAMPLE_STATE, []));
    expect(json.categories).toEqual([]);
    expect(json.bands).toEqual([]);
    expect(json.items).toEqual([]);
  });
});

describe("buildSelectionCsv", () => {
  it("emits a header + one row per pick", () => {
    const csv = buildSelectionCsv(SAMPLE_STATE, SAMPLE_PICK);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Name,Layer,Time bands,PESTLE,Description");
  });
  it("escapes commas inside item names", () => {
    const csv = buildSelectionCsv(SAMPLE_STATE, [SAMPLE_PICK[1]]);
    expect(csv).toContain('"Has, comma"');
  });
  it("multi-band cells join with ' / '", () => {
    const csv = buildSelectionCsv(SAMPLE_STATE, [SAMPLE_PICK[1]]);
    expect(csv).toContain('"Now / Later"');
  });
});

describe("buildSelectionText", () => {
  it("groups items under their layer label", () => {
    const out = buildSelectionText(SAMPLE_STATE, SAMPLE_PICK);
    expect(out).toContain("## Drivers");
    expect(out).toContain("## Products");
    expect(out).toMatch(/- GenAI growth/);
  });
  it("includes pestle tags inline when present", () => {
    const out = buildSelectionText(SAMPLE_STATE, [SAMPLE_PICK[0]]);
    expect(out).toContain("[T, E]");
  });
});

// ─── formatGuidanceNote ─────────────────────────────────────────────────────

describe("formatGuidanceNote", () => {
  it("formats new multi-expert shape", () => {
    const entry = {
      advices: [
        { role: "Political", action: "Adjust", advice: "watch policy" },
        { role: "Economic",  action: "Adjust", advice: "track markets", evidence_basis: "K2 line" },
      ],
    };
    const note = formatGuidanceNote(entry, "Adjust");
    expect(note).toContain("Impact review (Adjust), 2 experts:");
    expect(note).toContain("[Political (Adjust)] watch policy");
    expect(note).toContain("[Economic (Adjust)] track markets");
    expect(note).toContain("Evidence: K2 line");
  });
  it("uses singular 'expert' when only one advice", () => {
    const note = formatGuidanceNote({ advices: [{ role: "Political", advice: "x" }] }, "Adjust");
    expect(note).toContain("1 expert:");
  });
  it("falls back to legacy single-advice shape", () => {
    const entry = { suggested_change: "rescope item", evidence_basis: "K1 line" };
    const note = formatGuidanceNote(entry, "Revise");
    expect(note).toContain("Impact review (Revise): rescope item");
    expect(note).toContain("Evidence: K1 line");
  });
});
