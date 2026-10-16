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
