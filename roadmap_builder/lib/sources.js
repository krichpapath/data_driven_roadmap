// Shared browser/test logic. Scores are impact severity, never source credibility.
globalThis.SourceLogic = Object.freeze({
  MAX_SOURCES: 10,
  MAX_TEXT: 200000,
  text(source) {
    const text = source.language === 'en' ? source.correctedText : source.englishText;
    if (source.status !== 'ready') throw new Error(`${source.name}: finish processing and review first.`);
    if (source.language !== 'en' && !source.translationApproved) throw new Error(`${source.name}: approve a reviewed English translation first.`);
    if (!text?.trim()) throw new Error(`${source.name}: analysis text is empty.`);
    if (text.length > this.MAX_TEXT) throw new Error(`${source.name}: analysis text exceeds 200,000 characters.`);
    return text.trim();
  },
  // Badge label/tone; mirrors the gates in text() so the list predicts what analysis accepts.
  status(source) {
    if (source.status === 'error') return ['Failed', 'bad'];
    if (source.status === 'cancelled') return ['Cancelled', 'bad'];
    if (source.status !== 'ready') return ['Needs review', 'warn'];
    if (source.language !== 'en' && !source.translationApproved) return ['Needs translation', 'warn'];
    return ['Ready', 'ok'];
  },
  revision(draft, previous) {
    if (!draft.roadmapId) throw new Error('Source needs a roadmap.');
    if (!draft.name?.trim() || draft.name.trim().length > 300) throw new Error('Name must contain 1–300 characters.');
    if (!['en', 'th', 'ja', 'mixed', 'unknown'].includes(draft.language)) throw new Error('Choose a supported source language.');
    for (const key of ['correctedText', 'englishText', 'extractedText']) {
      if ((draft[key] || '').length > this.MAX_TEXT) throw new Error('Text exceeds 200,000 characters.');
    }
    // Approval given in the editor after the last text change is kept; a stale approval is cleared.
    const approvedNow = !!draft.translationApproved && draft.approvedFor === `${draft.language}\n${draft.correctedText}`;
    const changed = previous && !approvedNow && (previous.correctedText !== draft.correctedText || previous.language !== draft.language || previous.original !== draft.original);
    return { ...draft, name: draft.name.trim(), revision: (previous?.revision || 0) + 1,
      createdAt: previous?.createdAt || new Date().toISOString(), modifiedAt: new Date().toISOString(),
      translationApproved: changed ? false : !!draft.translationApproved,
      // "AI" and "ai" are one tag: the first spelling is kept.
      tags: (draft.tags || []).map(t => t.trim()).filter((t, i, all) => t && all.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i) };
  },
  snapshot(sources) {
    if (!sources.length || sources.length > this.MAX_SOURCES) throw new Error('Select 1–10 sources.');
    if (new Set(sources.map(s => s.id)).size !== sources.length) throw new Error('Duplicate source identifiers.');
    return sources.map(s => ({ source_ref: { id: s.id, revision: s.revision, name: s.name }, input_text: this.text(s) }));
  },
  duplicates(snapshot) {
    const seen = new Map(), duplicates = [];
    for (const s of snapshot) {
      const key = s.input_text.normalize('NFC').replace(/\s+/g, ' ').trim();
      if (seen.has(key)) duplicates.push(`${seen.get(key)} / ${s.source_ref.name}`);
      else seen.set(key, s.source_ref.name);
    }
    return duplicates;
  },
  attribution(result, entry) {
    if (!result?.source_ref) return '';
    const source = result.source_ref;
    const matched = (result.roadmap_matches || []).find(m => m.item_id === entry.item_id)?.matched_evidence || [];
    const ids = [...new Set([...matched.map(e => e.id), ...(entry.advices || []).map(a => a.evidence_keypoint?.id), entry.evidence_keypoint?.id].filter(Boolean))];
    return `Source: ${source.name} [${source.id}] revision ${source.revision}\nEvidence references: ${ids.map(id => `${source.id}@${source.revision}:${id}`).join(', ')}\n`;
  },
  aggregate(results, expected, method = 'mean') {
    if (method !== 'mean') throw new Error('Unsupported aggregation method.');
    if (!expected.length || new Set(expected.map(s => s.source_ref.id)).size !== expected.length) return null;
    if (results.length !== expected.length) return null;
    const scores = expected.map(s => {
      const matches = results.filter(r => r.source_ref?.id === s.source_ref.id && r.source_ref?.revision === s.source_ref.revision);
      return matches.length === 1 && !matches[0].error && AdvisorUtils.validResult(matches[0]) ? matches[0] : null;
    });
    if (scores.some(s => !s)) return null;
    const thresholds = scores[0].thresholds;
    if (scores.some(s => s.thresholds.adjust !== thresholds.adjust || s.thresholds.revise !== thresholds.revise)) throw new Error('Inconsistent scoring thresholds; rerun all sources.');
    const severity = scores.reduce((sum, s) => sum + s.severity, 0) / scores.length;
    return { method, severity, count: scores.length, thresholds,
      verdict: severity >= thresholds.revise ? 'Revise' : severity >= thresholds.adjust ? 'Adjust' : 'Maintain' };
  },
  async run(snapshot, request, onResult, cancelled) {
    // ponytail: sequential requests reuse the existing serialized local model pipeline.
    const results = [];
    for (const source of snapshot) {
      if (cancelled()) break;
      let result;
      try {
        result = await request(source);
          if (!AdvisorUtils.validResult(result) || ['id', 'revision', 'name'].some(key => result.source_ref?.[key] !== source.source_ref[key])) throw new Error('API returned invalid or mismatched source results.');
      } catch (e) { result = { source_ref: source.source_ref, error: e.message }; }
      // A request already in flight when the user stops is kept: the server did the work.
      results.push(result);
      onResult([...results]);
    }
    return results;
  }
});
