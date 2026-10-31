import { describe, it, expect } from "vitest";
import "../lib/history.js";
import "../lib/advisor.js";

const H = RoadmapHistory;
const roadmap = items => ({
  categories: [{ id: "l1", label: "Business Drivers" }, { id: "l2", label: "Strategic Targets" }],
  bands: [{ id: "b1", label: "2024–2026" }, { id: "b2", label: "2027–2030" }, { id: "b3", label: "2031+" }],
  items
});
const item = (patch = {}) => ({ id: "i1", name: "GenAI", catId: "l1", bands: ["b1"], pestle: [], description: "", ...patch });
const one = (before, after, ctx) => H.diff(roadmap(before), roadmap(after), ctx);
const advice = (action, text, src = "s1") =>
  `Source: report.txt [${src}] revision 2\nEvidence references: ${src}@2:K1, ${src}@2:K3\nImpact review (${action}), 1 expert:\n  [Advisor (${action})] ${text}`;
const run = (id, src = "s1") => ({ run_id: id, ran_at: "2026-10-27T14:00:00.000Z", verdict: "Revise", source_ref: { id: src, name: "report.txt", revision: 2 } });

describe("recording", () => {
  it("records time band edits with ids and labels, and explains them", () => {
    const [e] = one([item()], [item({ bands: ["b2"] })]);
    expect(e.field_changes).toEqual([{ field: "bands", before: ["b1"], after: ["b2"], before_display: ["2024–2026"], after_display: ["2027–2030"] }]);
    expect(H.summary(e)).toBe("Time bands changed from 2024–2026 to 2027–2030");
    expect(H.importance(e)).toBe("medium"); // b1 was removed
  });

  it("records only real PESTLE changes and compares tags as a set", () => {
    const [e] = one([item({ pestle: ["S", "E"] })], [item({ pestle: ["E", "T"] })]);
    expect(H.summary(e)).toBe("Added Technological; removed Social");
    expect(H.importance(e)).toBeNull();
    expect(one([item({ pestle: ["S", "E"] })], [item({ pestle: ["E", "S"] })])).toEqual([]);
  });

  it("does not log unchanged saves or fields the user never sees", () => {
    expect(one([item({ description: undefined })], [item({ reviewNeeded: true })])).toEqual([]);
  });

  it("flags cleared notes and layer changes as important", () => {
    const [cleared] = one([item({ notes: "Keep an eye on vendors" })], [item({ notes: "" })]);
    expect(H.summary(cleared)).toBe("My Notes cleared");
    expect(H.importance(cleared)).toBe("medium");
    const [moved] = one([item()], [item({ catId: "l2" })]);
    expect(H.summary(moved)).toBe("Layer changed from Business Drivers to Strategic Targets");
    expect(H.importanceReason(moved)).toBe("Layer changed");
    const [described] = one([item()], [item({ description: "New text" })]);
    expect([H.summary(described), H.importance(described)]).toEqual(["Description added", null]);
  });

  it("keeps a deleted item's identity and marks it high importance", () => {
    const [e] = one([item({ name: "Data Lake" })], [], { origin: "user", actorId: "u1", actorName: "Browser 1234" });
    expect(e).toMatchObject({ event_type: "deleted", item_id: "i1", item_name_snapshot: "Data Lake", origin_type: "user", actor_id: "u1" });
    expect([H.summary(e), H.importance(e)]).toEqual(["Roadmap item deleted", "high"]);
    expect(e.field_changes.find(c => c.field === "catId")).toMatchObject({ before: "l1", before_display: "Business Drivers" });
  });

  it("tags Advisor Expert changes with their run, source and evidence", () => {
    const [e] = one([item()], [item({ advice: advice("Revise", "Escalate for revision; test timing.") })], { origin: "advisor", run: run("run_a") });
    expect(e).toMatchObject({ origin_type: "advisor", event_type: "notes", advisor_run_id: "run_a", source_id: "s1", source_revision: 2,
      evidence_refs: ["s1@2:K1", "s1@2:K3"], advisor_run: { ran_at: "2026-10-27T14:00:00.000Z", verdict: "Revise" } });
    expect(H.summary(e)).toBe("Advisor Expert added a Revise recommendation");
    // A second application adds to what is there; only the new recommendation counts.
    const [again] = one([item({ advice: e.field_changes[0].after })], [item({ advice: `${e.field_changes[0].after}\n\n${advice("Adjust", "Budget more.")}` })], { origin: "advisor", run: run("run_b") });
    expect(H.addedRecs(again.field_changes[0]).map(r => r.action)).toEqual(["Adjust"]);
    const [cleared] = one([item({ advice: e.field_changes[0].after })], [item({ advice: "" })]);
    expect([H.summary(cleared), cleared.origin_type, H.importance(cleared)]).toEqual(["Advisor Expert recommendations cleared", "user", "medium"]);
  });
});

describe("legacy entries", () => {
  const legacy = { id: "h_1", at: "2026-10-01T10:00:00.000Z", action: "edited", itemId: "i1", itemName: "GenAI",
    summary: "Changed time bands", changes: [{ field: "Time bands", before: "Now, Next", after: "Now" }, { field: "PESTLE", before: "S", after: "T" }] };

  it("shows what was stored, with an Unknown origin and no grouping", () => {
    const e = H.normalize(legacy);
    expect(e).toMatchObject({ schema_version: 1, event_id: "h_1", origin_type: "unknown", actor_id: null });
    expect(H.summary(e)).toBe("Time bands changed from Now and Next to Now; Added Technological; removed Social");
    expect(H.importance(e)).toBe("medium");
    expect(H.groupKey(e)).toBe("h_1");
  });
});

describe("grouping", () => {
  const at = "2026-10-27T14:14:00.000Z";
  const items = Array.from({ length: 8 }, (_, n) => item({ id: `i${n}`, name: `Item ${n}` }));
  const advised = items.map(i => ({ ...i, advice: advice("Rescope", `Rescope ${i.name}; narrow it.`) }));

  it("puts one run's eight items in one group and keeps unrelated runs apart at the same time", () => {
    const runA = one(items, advised, { at, origin: "advisor", run: run("run_a") });
    const runB = one([item({ id: "x" })], [item({ id: "x", advice: advice("Adjust", "Watch costs.") })], { at, origin: "advisor", run: run("run_b") });
    const userSameTime = one([item({ id: "y" }), item({ id: "z" })], [item({ id: "y", name: "Y" }), item({ id: "z", name: "Z" })], { at });
    const groups = H.group([...runA, ...runB, ...userSameTime]);
    expect(groups.map(g => g.events.length).sort()).toEqual([1, 1, 1, 8]);
    expect(groups.find(g => g.key === "run_a").events.map(e => e.item_id).sort()).toEqual(items.map(i => i.id).sort());
  });
});

describe("filters", () => {
  const events = [
    ...one([item()], [item({ bands: ["b2"] })], { at: "2026-10-02T10:00:00.000Z", actorId: "me" }),
    ...one([item({ id: "i2", name: "Lake" })], [], { at: "2026-10-03T10:00:00.000Z", actorId: "other" }),
    ...one([item({ id: "i3" })], [item({ id: "i3", advice: advice("Revise", "Escalate now.") })], { at: "2026-10-04T10:00:00.000Z", origin: "advisor", run: run("r") })
  ];
  const ids = f => events.filter(e => H.matches(e, f)).map(e => e.item_id);

  it("work alone and combined", () => {
    expect(ids({ origin_type: "advisor" })).toEqual(["i3"]);
    expect(ids({ actor_id: "me" })).toEqual(["i1"]);
    expect(ids({ field: "bands" })).toEqual(["i1", "i2"]); // a deletion removes every field, bands included
    expect(ids({ important: true })).toEqual(["i1", "i2"]);
    expect(ids({ important: true, event_type: "deleted" })).toEqual(["i2"]);
    expect(ids({ since: "2026-10-03T00:00:00.000Z", until: "2026-10-04T00:00:00.000Z" })).toEqual(["i2"]);
    expect(ids({ q: "2027–2030" })).toEqual(["i1"]);
    expect(ids({ q: "lake", origin_type: "advisor" })).toEqual([]);
  });
});

describe("browser copy", () => {
  it("never drops unsynced events and caps synced ones", () => {
    const synced = Array.from({ length: H.LOCAL_LIMIT }, (_, n) => ({ event_id: `s${n}`, synced: true }));
    const unsynced = Array.from({ length: 3 }, (_, n) => ({ event_id: `u${n}` }));
    const next = H.append([...unsynced, ...synced], [{ event_id: "new" }]);
    expect(next[0].event_id).toBe("new");
    expect(next.filter(e => !e.synced)).toHaveLength(4);
    expect(next.filter(e => e.synced)).toHaveLength(H.LOCAL_LIMIT);
    expect(H.append(undefined, [])).toEqual([]);
  });

  it("marks synced events and trims only their browser copy", () => {
    const [e] = one([item()], [item({ notes: "x".repeat(3000) })]);
    const [kept] = H.markSynced([e], new Set([e.event_id]));
    expect(kept.synced).toBe(true);
    expect(kept.field_changes[0].after).toHaveLength(2001);
    expect(e.field_changes[0].after).toHaveLength(3000); // the original object is untouched
    expect(H.indexed(kept)).not.toHaveProperty("synced");
  });
});

describe("word diff", () => {
  it("marks only the changed words", () => {
    expect(H.wordDiff("Ship the data lake in Q2", "Ship the lakehouse in Q2")).toEqual([
      { op: "same", text: "Ship the " }, { op: "del", text: "data lake" }, { op: "add", text: "lakehouse" }, { op: "same", text: " in Q2" }
    ]);
    expect(H.wordDiff("", "")).toEqual([]);
  });
});

describe("exports", () => {
  const events = [
    ...one([item({ name: '=HYPERLINK("x")', description: "a, \"quoted\"\nline" })], [item({ name: '=HYPERLINK("x")', description: "b", catId: "l2" })], { at: "2026-10-02T10:00:00.000Z", actorId: "me", actorName: "Browser me" }),
    ...one([item({ id: "i3" })], [item({ id: "i3", advice: advice("Revise", "Escalate now.") })], { at: "2026-10-04T10:00:00.000Z", origin: "advisor", run: run("run_x") })
  ];

  it("CSV has one row per field change, escaped and formula-safe", () => {
    const lines = H.toCsv(events, "me").split("\r\n");
    expect(lines[0]).toBe('"Timestamp","Roadmap Item","Action","Change Origin","Editor","Changed Field","Before","After","Summary","Source","Revision","Advisor Run ID"');
    expect(lines.length).toBe(1 + 2 + 1); // header, two field changes, the advisor event; in-cell breaks are LF, rows end in CRLF
    expect(H.toCsv(events, "me")).toContain('"2026-10-02T10:00:00.000Z","\'=HYPERLINK(""x"")","Edited","Manual edit","You","Layer"');
    expect(H.toCsv(events, "me")).toContain('"a, ""quoted""\nline"');
    expect(H.toCsv(events, "me")).toContain('"report.txt","2","run_x"');
  });

  it("JSON keeps full records with evidence and the schema version", () => {
    const json = JSON.parse(H.toJson([{ ...events[1], synced: true }], "rm1"));
    expect(json).toMatchObject({ schema_version: 2, roadmap_id: "rm1", events: [{ advisor_run_id: "run_x", source_id: "s1", evidence_refs: ["s1@2:K1", "s1@2:K3"] }] });
    expect(json.events[0]).not.toHaveProperty("synced");
  });
});

describe("AdvisorUtils.splitLegacyNotes", () => {
  it("moves generated advice blocks out of the user's notes", () => {
    const notes = "My own thought\n\nSource: Report [s1] revision 2\nEvidence references: s1@2:k1\nImpact review (Adjust) — 1 expert:\n  [Tech] Watch\n\nImpact review (Revise): Cut scope";
    expect(AdvisorUtils.splitLegacyNotes(notes)).toEqual({
      notes: "My own thought",
      advice: "Source: Report [s1] revision 2\nEvidence references: s1@2:k1\nImpact review (Adjust) — 1 expert:\n  [Tech] Watch\n\nImpact review (Revise): Cut scope"
    });
    expect(AdvisorUtils.splitLegacyNotes(undefined)).toEqual({ notes: "", advice: "" });
  });
});
