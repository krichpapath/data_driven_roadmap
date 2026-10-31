import { describe, it, expect } from "vitest";
import "../lib/advisor.js";

describe("actual advisor helpers", () => {
  it("uses configured boundaries including equality", () => {
    const thresholds = { adjust: .35, revise: .65 };
    for (const [severity, label] of [[0, "Low"], [.3499, "Low"], [.35, "Med"], [.6499, "Med"], [.65, "High"], [1, "High"]]) {
      expect(AdvisorUtils.severityBucket(severity, thresholds)).toBe(label);
    }
    expect(AdvisorUtils.severityBucket(.4, { adjust: .5, revise: .8 })).toBe("Low");
  });
  it("rejects incomplete and invalid API results", () => {
    const valid = { verdict: "Maintain", severity: 0, evidence: [{}], thresholds: { adjust: .35, revise: .65 } };
    expect(AdvisorUtils.validResult(valid)).toBe(true);
    for (const result of [null, {}, { ...valid, severity: NaN }, { ...valid, evidence: [] }, { ...valid, verdict: "Failed" }]) {
      expect(AdvisorUtils.validResult(result)).toBe(false);
    }
  });
});

describe("advice rendering helpers", () => {
  const stored = [
    "Source: revise_02_sweeping_digital_mandate.txt [src-1] revision 2",
    "Evidence references: src-1@2:K1, src-1@2:K3",
    "Impact review (Revise), 2 experts:",
    "  [Advisor (revise)] Escalate 'Robust Data Management' for roadmap revision; test whether timing and assumptions still hold.",
    "    Evidence: New mandate shortens deadlines.",
    "  [Economic (Adjust)] Budget for higher cloud costs.",
    "",
    "Impact review (Adjust) — 1 expert:",
    "  [Technological (Adjust)] Review 'X' in 2024–2026; update scope.",
    "",
    "A paragraph that is not advisor output"
  ].join("\n");

  it("splits stored advice into one record per expert, keeping attribution", () => {
    const [a, b, c, d] = AdvisorUtils.parseAdvice(stored);
    expect(a).toEqual({
      role: "Advisor", action: "Revise", evidence: "New mandate shortens deadlines.",
      text: "Escalate 'Robust Data Management' for roadmap revision; test whether timing and assumptions still hold.",
      source: { name: "revise_02_sweeping_digital_mandate.txt", id: "src-1", revision: "2" },
      references: ["src-1@2:K1", "src-1@2:K3"]
    });
    expect(b).toMatchObject({ role: "Economic", action: "Adjust", source: a.source });
    expect(c).toMatchObject({ role: "Technological", action: "Adjust", source: null, references: [] });
    expect(d).toEqual({ raw: "A paragraph that is not advisor output" });
    expect(AdvisorUtils.parseAdvice("Impact review (Maintain): Keep it.\nEvidence: Stable demand.")).toEqual([
      { role: "", action: "Maintain", text: "Keep it.", evidence: "Stable demand.", source: null, references: [] }]);
    expect(AdvisorUtils.parseAdvice("")).toEqual([]);
  });

  it("turns a recommendation into a heading and body without adding words", () => {
    expect(AdvisorUtils.splitAdvice("Escalate 'Robust Data Management' for roadmap revision; test whether timing and assumptions still hold."))
      .toEqual({ title: "Escalate 'Robust Data Management' for roadmap revision", body: "Test whether timing and assumptions still hold." });
    expect(AdvisorUtils.splitAdvice("Budget for higher cloud costs.")).toEqual({ title: "Budget for higher cloud costs", body: "" });
    const long = AdvisorUtils.splitAdvice("Given sharply rising compute costs across the region the team should reduce the pilot scope now");
    expect(long.title).toBe("Given sharply rising compute costs across the region…");
    expect(long.body).toBe("Given sharply rising compute costs across the region the team should reduce the pilot scope now.");
  });
});
