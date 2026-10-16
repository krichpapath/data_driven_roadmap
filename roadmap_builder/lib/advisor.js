// Shared by the actual browser and Vitest; thresholds come from the API result.
globalThis.AdvisorUtils = Object.freeze({
  severityBucket(value, thresholds) {
    if (!thresholds || !Number.isFinite(Number(value))) return "Unknown";
    if (Number(value) >= thresholds.revise) return "High";
    if (Number(value) >= thresholds.adjust) return "Med";
    return "Low";
  },
  validResult(result) {
    return !!result && ["Maintain", "Adjust", "Revise"].includes(result.verdict)
      && Number.isFinite(result.severity) && result.severity >= 0 && result.severity <= 1
      && Array.isArray(result.evidence) && result.evidence.length > 0
      && Number.isFinite(result.thresholds?.adjust) && Number.isFinite(result.thresholds?.revise);
  }
});
