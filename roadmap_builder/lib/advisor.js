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
  },
  // Older items kept News Impact advice inside their notes; move those generated blocks into `advice`.
  splitLegacyNotes(notes) {
    const blocks = String(notes || "").split(/\n{2,}/);
    const generated = b => /^(Source: .*\[|Impact review \()/.test(b);
    return {
      notes: blocks.filter(b => !generated(b)).join("\n\n").trim(),
      advice: blocks.filter(generated).join("\n\n").trim()
    };
  },
  // Stored advice text (written by formatGuidanceNote + SourceLogic.attribution) back into one record per
  // expert recommendation. Blocks that do not match that format come back as { raw } so nothing is lost.
  parseAdvice(text) {
    const plain = s => String(s || "").replace(/\s*—\s*/g, ", ").trim(); // older saved text used em dashes
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const out = [];
    for (const block of String(text || "").split(/\n{2,}/).map(b => b.trim()).filter(Boolean)) {
      const lines = block.split("\n");
      let source = null, references = [], verdict = "", cards = [];
      const src = /^Source: (.*) \[([^\]]+)\] revision (\S+)$/.exec(lines[0]);
      if (src) { source = { name: src[1], id: src[2], revision: src[3] }; lines.shift(); }
      const refs = /^Evidence references: (.*)$/.exec(lines[0] || "");
      if (refs) { references = refs[1].split(", ").filter(Boolean); lines.shift(); }
      const head = /^Impact review \(([^)]+)\)(.*)$/.exec(lines.shift() || "");
      if (head) {
        verdict = head[1];
        // Legacy single-advice form: "Impact review (Adjust): text" then "Evidence: ...".
        const single = /^:\s+(.+)$/.exec(head[2]);
        if (single && !/^\d+ experts?:$/.test(single[1])) cards.push({ role: "", action: verdict, text: single[1], evidence: "" });
        for (const line of lines) {
          const expert = /^\s*\[(.+?)(?: \(([^)]+)\))?\] (.+)$/.exec(line);
          const basis = /^\s*Evidence: (.+)$/.exec(line);
          if (expert) cards.push({ role: expert[1], action: expert[2] || verdict, text: expert[3], evidence: "" });
          else if (basis && cards.length) cards[cards.length - 1].evidence = basis[1];
        }
      }
      if (!cards.length) { out.push({ raw: plain(block) }); continue; }
      cards.forEach(c => out.push({ ...c, action: cap(c.action), role: plain(c.role), text: plain(c.text), evidence: plain(c.evidence), source, references }));
    }
    return out;
  },
  // Card heading and body from one recommendation, using only its own words: the first clause is the
  // heading, the rest the explanation. A long first clause is shortened instead.
  splitAdvice(text) {
    const m = /^(.{8,90}?)[;.:](?:\s+|$)(.*)$/s.exec(text);
    const sentence = s => { s = s.trim(); return s && s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : "."); };
    if (m && m[2].trim()) return { title: m[1].trim(), body: sentence(m[2]) };
    const words = text.split(/\s+/);
    return { title: words.length > 9 ? words.slice(0, 8).join(" ") + "…" : text.replace(/[.;:]$/, ""), body: words.length > 9 ? sentence(text) : "" };
  }
});
