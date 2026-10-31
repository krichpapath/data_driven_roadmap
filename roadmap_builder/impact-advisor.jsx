/* global React, Icon, Select, Check, PESTLE, AdvisorUtils, SourceStore, SourceLogic, SourceBadge, SOURCE_LANGUAGES */

const ADVISOR_API_KEY = "ddrm_advisor_api_url";
const ADVISOR_MODEL_KEY = "ddrm_advisor_llm_model";
const DEFAULT_ADVISOR_API = "http://127.0.0.1:7875/api/recommend";
const DEFAULT_ADVISOR_MODEL = "openai/gpt-6-luna";
const EVIDENCE_SNIPPET_MAX = 220;
// Mirrors KEYPOINTS_MIN / KEYPOINTS_MAX in src/config.py. The impact bands are
// calibrated at KEYPOINTS_MAX, so asking for fewer points shifts verdicts.
// The backend clamps to this range anyway; keep the two in sync if config.py changes.
const KEYPOINTS_MIN = 3;
const KEYPOINTS_MAX = 7;


// localStorage-backed state. Reads once on mount; writes on every change.
// Falls back to `defaultValue` when storage is empty or unavailable.
// Identifies one Advisor Expert run so History can group what it added and trace it back. Metadata only:
// the result itself is not changed.
const stampRun = result => result && { ...result, run_id: `run_${crypto.randomUUID()}`, ran_at: new Date().toISOString() };

function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = React.useState(() => {
    try { return localStorage.getItem(key) || defaultValue; }
    catch { return defaultValue; }
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, value); } catch { /* quota / private mode */ }
  }, [key, value]);
  return [value, setValue];
}

function verdictTone(verdict) {
  if (verdict === "Revise") return "revise";
  if (verdict === "Adjust") return "adjust";
  return "maintain";
}

function actionTone(action) {
  const a = (action || "").toLowerCase().trim();
  // First word match — handles "Adjust focus on..." or "Revise scope and ..."
  const head = a.split(/[\s,.;:]+/)[0];
  if (head === "revise") return "revise";
  if (head === "rescope" || head === "adjust") return "adjust";
  if (head === "maintain") return "maintain";
  // Fallback: substring scan, revise > adjust > maintain
  if (a.includes("revise")) return "revise";
  if (a.includes("rescope") || a.includes("adjust")) return "adjust";
  return "maintain";
}

function actionLabel(tone) {
  if (tone === "revise") return "Revise";
  if (tone === "adjust") return "Adjust";
  return "Maintain";
}

function actionIcon(tone) {
  if (tone === "revise") return "alert-triangle";
  if (tone === "adjust") return "pencil";
  return "check";
}


function pestleColor(label) {
  const p = PESTLE.find(x => x.label === label);
  return p ? p.color : "var(--c-slate)";
}

function evidenceSnippet(text) {
  if (!text) return "";
  return text.length > EVIDENCE_SNIPPET_MAX
    ? text.slice(0, EVIDENCE_SNIPPET_MAX).trim() + "..."
    : text;
}

async function readAdvisorError(res) {
  const fallback = `Advisor API returned HTTP ${res.status}.`;
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    return text.trim() || fallback;
  }
  const data = await res.json().catch(() => null);
  const detail = data?.detail;
  if (Array.isArray(detail)) {
    return detail.map(item => item.msg || String(item)).join(" ");
  }
  if (detail) return String(detail);
  return fallback;
}

function friendlyAdvisorError(error, status, apiUrl) {
  const raw = error?.message || String(error || "");
  if (raw === "Failed to fetch" || raw.includes("NetworkError")) {
    let where = "the analysis service";
    try { where = `the analysis service at ${new URL(apiUrl).host}`; } catch {}
    return `Cannot reach ${where}. Check that it is running (see Settings), then retry.`;
  }
  if (status === 400) {
    return `Assessment could not start. ${raw}`;
  }
  if (status === 503) {
    return `Impact model is not ready. ${raw}`;
  }
  return raw || "Advisor request failed.";
}

function ImpactAdvisor({ open, state, onApplyGuidance, roadmapId, onManageSources, sourceIds, onSourceIds }) {
  const textareaRef = React.useRef(null);
  const [apiUrl, setApiUrl] = useLocalStorageState(ADVISOR_API_KEY, DEFAULT_ADVISOR_API);
  const [llmModel, setLlmModel] = useLocalStorageState(ADVISOR_MODEL_KEY, DEFAULT_ADVISOR_MODEL);
  const [allowExternalAI, setAllowExternalAI] = React.useState(false);
  const [modelOptions, setModelOptions] = React.useState([]);
  const [configError, setConfigError] = React.useState("");
  const [inputMode, setInputMode] = React.useState("Sources");
  const [newsText, setNewsText] = React.useState("");
  const [maxPoints, setMaxPoints] = React.useState(KEYPOINTS_MAX);
  const [busy, setBusy] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState(null);
  const [selected, setSelected] = React.useState(new Set());
  const [actionFilter, setActionFilter] = React.useState("all"); // all | revise | adjust | maintain
  const [expertFilter, setExpertFilter] = React.useState("all"); // all | <PESTLE role>
  const [library, setLibrary] = React.useState([]);
  const [folders, setFolders] = React.useState([]);
  const [tab, setTab] = React.useState("evidence");
  const [openI, setOpenI] = React.useState([]), [openE, setOpenE] = React.useState([]), [hl, setHl] = React.useState(null), [evSort, setEvSort] = React.useState("rel");
  const [calcOpen, setCalcOpen] = React.useState(false);
  // Source picker: search, folder, status, sort and page; hovering a source previews it.
  const [q, setQ] = React.useState(""), [fold, setFold] = React.useState("all"), [stat, setStat] = React.useState("ready"), [srt, setSrt] = React.useState("recent");
  const [fpop, setFpop] = React.useState(false), [pg, setPg] = React.useState(1), [peek, setPeek] = React.useState(null);
  const peekTimer = React.useRef(null);
  const [railW, setRailW] = React.useState(() => { try { const v = +localStorage.getItem("ddrm_impact_rail_w"); return v >= 260 && v <= 560 ? v : 340; } catch { return 340; } });
  React.useEffect(() => { try { localStorage.setItem("ddrm_impact_rail_w", railW); } catch { /* private mode */ } }, [railW]);
  React.useEffect(() => setPg(1), [q, fold, stat, srt]);
  React.useEffect(() => () => clearTimeout(peekTimer.current), []);
  // New objects after any library change, so the invalidation effect below drops stale results.
  const sources = React.useMemo(() => library.filter(s => sourceIds.includes(s.id)), [library, sourceIds]);
  // Last batch survives tab switches, adding advice and reloads (this browser tab only).
  const storeKey = `ddrm_last_assessment_${roadmapId}`;
  const saved = React.useMemo(() => { try { return JSON.parse(sessionStorage.getItem(storeKey)) || null; } catch { return null; } }, [storeKey]);
  const [batchResults, setBatchResults] = React.useState(saved?.results || []);
  const [batchSnapshot, setBatchSnapshot] = React.useState(saved?.snapshot || []);
  const [batchRoadmapKey, setBatchRoadmapKey] = React.useState(saved?.roadmapKey || '');
  const settingsKey = JSON.stringify([maxPoints, apiUrl, allowExternalAI ? llmModel : null]);
  const [batchSettingsKey, setBatchSettingsKey] = React.useState(saved?.settingsKey || settingsKey);
  const [batchNotice, setBatchNotice] = React.useState('');
  const [stopping, setStopping] = React.useState(false);
  const [sourceStart, setSourceStart] = React.useState(0);
  const [durations, setDurations] = React.useState([]);
  const [apiDraft, setApiDraft] = React.useState(apiUrl);
  const batchToken = React.useRef(0), cancelRef = React.useRef(false), abortRef = React.useRef(null);
  // Advice notes do not change what is scored, so adding advice must not discard the assessment.
  const roadmapKey = React.useMemo(() => JSON.stringify({ ...state, items: state.items.map(i => ({ ...i, notes: undefined, advice: undefined, reviewNeeded: undefined, lastImpactVerdict: undefined })) }), [state]);
  const firstRun = React.useRef(true);
  // Changing a setting or peeking at "Paste text" must not throw away a finished assessment: it is marked stale instead.
  React.useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSelected(new Set());
    setResult(inputMode === 'Sources' ? batchResults.find(r => !r.error) || null : null);
  }, [inputMode]);
  React.useEffect(() => { if (saved?.snapshot?.length && !sourceIds.length) onSourceIds(saved.snapshot.map(r => r.source_ref.id)); }, [saved]);
  React.useEffect(() => { if (saved?.results) setResult(saved.results.find(r => r.source_ref?.id === saved.viewing) || null); }, [saved]);
  React.useEffect(() => {
    const changed = () => SourceStore.list(roadmapId).then(d => { setLibrary(d.sources); setFolders(d.folders); }, e => setError(`Cannot open source storage: ${e.message}`));
    changed();
    window.addEventListener('ddrm-sources-changed', changed);
    const channel = new BroadcastChannel('ddrm_sources_v1'); channel.onmessage = changed;
    return () => { batchToken.current++; window.removeEventListener('ddrm-sources-changed', changed); channel.close(); };
  }, [roadmapId]);

  React.useEffect(() => {
    const controller = new AbortController();
    setAllowExternalAI(false);
    setModelOptions([]);
    setConfigError("");
    const configUrl = apiUrl.replace(/\/recommend\/?$/, "/config");
    fetch(configUrl, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error("Unable to load advisor settings."); return r.json(); })
      .then(c => {
        if (!Array.isArray(c.guidance_models) || !c.guidance_models.length) throw new Error("API returned no guidance models.");
        setModelOptions(c.guidance_models);
        setLlmModel(current => c.guidance_models.includes(current) ? current : c.guidance_models[0]);
      })
      .catch(e => { if (e.name !== "AbortError") setConfigError(friendlyAdvisorError(e)); });
    return () => controller.abort();
  }, [apiUrl]);

  React.useEffect(() => {
    if (!open) return;
    setError("");
  }, [open]);

  // Timer: tick while busy
  React.useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  // Keyboard shortcuts: Cmd/Ctrl+Enter run, "/" focus textarea
  const runRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runRef.current?.();
        return;
      }
      if (e.key === "/") {
        const tag = document.activeElement?.tagName;
        if (tag !== "TEXTAREA" && tag !== "INPUT") {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const guidance = result?.guidance || {};
  const expertAdvicesMap = guidance.expert_advices || {};
  const expertsActive = guidance.experts_active || [];
  const evidence = result?.evidence || [];
  const selectedCount = selected.size;

  // Build per-item entries with stacked advices.
  // Prefer new expert_advices shape; fall back to legacy item_guidance for older backends.
  // (Plain compute, not useMemo — must run after the early `if (!open)` return above,
  //  so calling a hook here would violate the hooks rule.)
  const expertEntries = Object.values(expertAdvicesMap);
  const itemEntries = expertEntries.length > 0
    ? expertEntries
    : (guidance.item_guidance || []).map(g => ({
        item_id: g.item_id,
        item_name: g.item_name,
        layer: g.layer,
        time_bands: g.time_bands || [],
        matched_drivers: g.matched_drivers || [],
        advices: [{
          role: "Advisor",
          action: g.action,
          advice: g.suggested_change || "",
          evidence_keypoint: g.evidence_keypoint || null,
        }],
      }));

  // Action filter counts: an item counts toward an action if ANY of its advices uses that action.
  const actionCounts = itemEntries.reduce((acc, item) => {
    acc.all += 1;
    const tones = new Set((item.advices || []).map(a => actionTone(a.action)));
    tones.forEach(t => { acc[t] = (acc[t] || 0) + 1; });
    return acc;
  }, { all: 0, revise: 0, adjust: 0, maintain: 0 });

  // Per-expert filter counts.
  const expertCounts = itemEntries.reduce((acc, item) => {
    (item.advices || []).forEach(a => {
      if (a.role) acc[a.role] = (acc[a.role] || 0) + 1;
    });
    return acc;
  }, {});

  // Apply both filters. expertFilter narrows the visible advice inside an item too.
  const filteredEntries = itemEntries
    .map(item => ({ ...item, advices: (item.advices || []).filter(a => expertFilter === "all" || a.role === expertFilter) }))
    .filter(item => item.advices.length > 0 && (actionFilter === "all" || item.advices.some(a => actionTone(a.action) === actionFilter)));

  const filterPillSelect = (filterKey, e) => {
    setActionFilter(filterKey);
    if (e.shiftKey) {
      // Shift+click bulk-select items where any advice matches
      const ids = filterKey === "all"
        ? itemEntries.map(i => i.item_id)
        : itemEntries.filter(i => (i.advices || []).some(a => actionTone(a.action) === filterKey)).map(i => i.item_id);
      setSelected(new Set(ids));
    }
  };

  const viewResult = (r) => {
    setResult(r);
    setSelected(new Set()); // the user picks advice after reading it
    setActionFilter("all");
    setExpertFilter("all");
    setOpenI([]); setOpenE([]); setHl(null);
  };

  const runAdvisor = async () => {
    if (busy) return;
    setResult(null);
    setSelected(new Set());
    if (inputMode === 'Sources') {
      setError(''); setBatchNotice('');
      let snapshot;
      try {
        snapshot = SourceLogic.snapshot(sources);
        const duplicates = SourceLogic.duplicates(snapshot);
        if (duplicates.length && !confirm(`Identical analysis text: ${duplicates.join('; ')}. Each source will have equal weight. Continue?`)) return;
      } catch (e) { setError(e.message); return; }
      const previous = { snapshot: batchSnapshot, results: batchResults, key: batchRoadmapKey, settings: batchSettingsKey };
      setBatchSnapshot(snapshot); setBatchResults([]); setBatchRoadmapKey(roadmapKey); setBatchSettingsKey(settingsKey);
      await runBatch(snapshot, snapshot, () => [], roadmapKey, previous);
      return;
    }
    if (!newsText.trim()) {
      setError("Paste article text or a link first.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setSelected(new Set());
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_text: newsText.trim(),
          input_mode: /^https?:\/\/\S+$/i.test(newsText.trim()) ? "URL" : "Text",
          max_points: maxPoints,
          llm_model: allowExternalAI ? llmModel : null,
          allow_external_ai: allowExternalAI,
          roadmap: state
        })
      });
      if (!res.ok) {
        const message = await readAdvisorError(res);
        const err = new Error(message);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      if (!AdvisorUtils.validResult(data.result)) throw new Error("API returned an incomplete assessment. Retry or check server logs.");
      viewResult(stampRun(data.result));
    } catch (e) {
      setError(friendlyAdvisorError(e, e.status));
    } finally {
      setBusy(false);
    }
  };
  runRef.current = runAdvisor;

  // Runs `rows` of `snapshot`; keep() returns the earlier results that stay (used by Retry).
  const runBatch = async (snapshot, rows, keep, key, previous) => {
    setBusy(true); setStopping(false); cancelRef.current = false;
    const token = ++batchToken.current, kept = keep(), times = [];
    const controller = abortRef.current = new AbortController();
    let started = Date.now(); setSourceStart(started); setDurations([]); setBatchResults(kept);
    const merge = partial => [...kept, ...partial];
    try {
      const results = await SourceLogic.run(rows, async source => {
        let res;
        try {
          res = await fetch(apiUrl, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            ...source, input_mode: 'Text', max_points: maxPoints, roadmap: state,
            llm_model: allowExternalAI ? llmModel : null, allow_external_ai: allowExternalAI
          }) });
        } catch (e) { throw new Error(e.name === 'AbortError' ? 'Stopped before this source finished.' : friendlyAdvisorError(e, 0, apiUrl)); }
        if (!res.ok) throw new Error(friendlyAdvisorError(new Error(await readAdvisorError(res)), res.status, apiUrl));
        return stampRun((await res.json()).result);
      }, partial => {
        if (token !== batchToken.current) return;
        times.push(Date.now() - started); started = Date.now(); setSourceStart(started); setDurations([...times]);
        setBatchResults(merge(partial));
      }, () => token !== batchToken.current || cancelRef.current);
      if (token !== batchToken.current) return;
      const all = merge(results), failed = all.filter(r => r.error).length, missing = snapshot.length - all.length;
      const first = all.find(r => !r.error) || null;
      // A run where nothing succeeded (service down, stopped early) must not replace the last good assessment.
      const prevFirst = previous?.results.find(r => !r.error);
      if (!first && prevFirst) {
        setBatchSnapshot(previous.snapshot); setBatchResults(previous.results); setBatchRoadmapKey(previous.key); setBatchSettingsKey(previous.settings);
        viewResult(prevFirst);
        setBatchNotice(`The new assessment did not finish, so your previous results are shown unchanged. ${all.find(r => r.error)?.error || 'It was stopped.'}`);
        return;
      }
      viewResult(first);
      setBatchNotice(cancelRef.current ? 'Stopped. Results returned so far are kept; there is no overall score until every source is assessed.'
        : failed === snapshot.length ? `${snapshot.length === 1 ? 'The source' : `None of the ${snapshot.length} sources`} could ${snapshot.length === 1 ? 'not ' : ''}be assessed. Fix the problem shown below, then click Retry.`
        : failed || missing ? `${failed + missing} of ${snapshot.length} sources were not assessed. Successful results are kept below; Retry the rest for an overall score.` : '');
      try { sessionStorage.setItem(storeKey, JSON.stringify({ roadmapKey: key, settingsKey, snapshot, results: all, viewing: first?.source_ref?.id })); } catch { /* quota: keep in memory only */ }
    } finally { setBusy(false); setStopping(false); }
  };
  const retryRows = batchSnapshot.filter(row => !batchResults.some(r => r.source_ref?.id === row.source_ref.id && !r.error));
  const retryBatch = () => {
    const done = batchResults.filter(r => !r.error);
    setBatchNotice('');
    runBatch(batchSnapshot, retryRows, () => done, batchRoadmapKey);
  };

  const toggleSelected = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applySelected = () => {
    // Pass entries containing all advices for selected items. Caller decides how to merge into notes.
    const picked = itemEntries.filter(item => selected.has(item.item_id));
    onApplyGuidance(picked, result);
    setSelected(new Set()); // added once; a second click must not append the same advice again
  };

  let combined = null;
  try { combined = SourceLogic.aggregate(batchResults, batchSnapshot); } catch (e) { /* visible below */ }

  // ── Derived view data ──
  const sourcesMode = inputMode === "Sources";
  const rows = batchSnapshot;
  const failedCount = batchResults.filter(r => r.error).length;
  const pct = value => `${(value * 100).toFixed(2)}`;
  const current = Math.min(batchResults.length + 1, rows.length), onThis = Math.max(0, Math.round((Date.now() - sourceStart) / 1000));
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length / 1000 : 0;
  const left = avg ? Math.max(0, avg * (rows.length - current) + Math.max(avg - onThis, 0)) : 0;
  // No estimate without a measured source; once the last source overruns the average, say so instead of a stale "5 s left".
  const eta = !avg ? (current === 1 ? ' · the first source is usually the slowest while models load' : '')
    : onThis > avg && current === rows.length ? ' · taking longer than the earlier sources' : left < 60 ? ` · about ${Math.max(5, Math.round(left / 5) * 5)} s left` : ` · about ${Math.round(left / 60)} min left`;
  const overallNote = busy ? (stopping ? 'Stopping after the current source finishes; its result will be kept.' : `Assessing source ${current} of ${rows.length} · ${onThis} s on this source${eta}`)
    : failedCount === rows.length ? `No overall score: ${rows.length === 1 ? 'the source' : `all ${rows.length} sources`} failed.`
    : failedCount ? `No overall score: ${failedCount} of ${rows.length} sources failed. Successful individual results remain available below.`
    : 'No overall score: not every selected source was assessed.';
  const stale = !busy && rows.length ? (batchRoadmapKey && batchRoadmapKey !== roadmapKey ? 'The roadmap changed after this assessment. Re-run it for current matches and advice.'
    : batchSettingsKey !== settingsKey ? 'Settings changed after this assessment (model, evidence points or API). Re-run it to apply them.'
    : rows.some(row => { const now = library.find(x => x.id === row.source_ref.id); return !now || now.revision !== row.source_ref.revision; })
      ? 'A source was edited or removed after this assessment. Re-run it for current results.' : '') : '';
  const reviseCount = batchResults.filter(r => !r.error && r.verdict === 'Revise').length;
  const worst = batchResults.filter(r => !r.error).reduce((a, r) => !a || r.severity > a.severity ? r : a, null);
  const multi = sourcesMode && rows.length > 1;
  const runningId = rows.find(row => !batchResults.some(r => r.source_ref?.id === row.source_ref.id))?.source_ref.id;
  const headline = sourcesMode ? (combined && { sev: combined.severity, verdict: combined.verdict, thresholds: combined.thresholds })
    : result && { sev: Number(result.severity || 0), verdict: result.verdict, thresholds: result.thresholds };
  const SUBLABEL = { Revise: "Significant revision needed", Adjust: "Minor adjustments advised", Maintain: "Aligns well with the signals" };
  const evById = id => evidence.find(e => e.id === id);
  const usedBy = id => itemEntries.filter(i => (i.advices || []).some(a => a.evidence_keypoint?.id === id)).length;
  const pcounts = {}; evidence.forEach(e => { pcounts[e.pestle] = (pcounts[e.pestle] || 0) + 1; });
  const scounts = {}; evidence.forEach(e => { const k = (e.sentiment_label || "neutral").toLowerCase(); scounts[k] = (scounts[k] || 0) + 1; });
  const evRows = evidence.map((e, i) => ({ ...e, id: e.id || `K${i + 1}`, n: i })).sort((a, b) => evSort === "rel" ? (b.relevance || 0) - (a.relevance || 0) : a.n - b.n);
  const goEv = id => { setTab("evidence"); setHl(id); setOpenE(s => s.includes(id) ? s : [...s, id]); };
  const tg = set => id => set(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const shortBand = label => /^beyond\s+(\d{4})/i.test(label) ? label.replace(/^beyond\s+(\d{4}).*/i, "$1+") : label.replace(/(?:19|20)(\d\d)\s*[–-]\s*(?:19|20)(\d\d)/, "$1–$2");
  const layers = [...new Set(filteredEntries.map(i => i.layer || "Other"))];
  const nShownSel = filteredEntries.filter(i => selected.has(i.item_id)).length;
  const tabs = [
    result && ["evidence", "Key signals", evidence.length, <path d="M2 8h3l2-5 2 10 2-5h3" />],
    result && ["recs", "Advice", itemEntries.length, <><path d="M7 2.5l1.2 3.3 3.3 1.2-3.3 1.2L7 11.5 5.8 8.2 2.5 7l3.3-1.2z" /><path d="M12.5 10.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" /></>],
    sourcesMode && rows.length > 0 && ["sources", "Sources", rows.length, <><ellipse cx="8" cy="4" rx="5" ry="2" /><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" /></>]
  ].filter(Boolean);
  const activeTab = tabs.some(t => t[0] === tab) ? tab : tabs[0]?.[0];

  // Source picker (Saved sources mode)
  const folderName = id => folders.find(f => f.id === id)?.name || "Unfiled";
  const isReady = s => SourceLogic.status(s)[1] === "ok";
  const lib = library.filter(s => (fold === "all" || (s.folderId || "") === fold) && (stat === "all" || (stat === "ready" ? isReady(s) : sourceIds.includes(s.id)))
    && `${s.name} ${(s.tags || []).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()));
  lib.sort(srt === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const PS = 8, pages = Math.max(1, Math.ceil(lib.length / PS)), cur = Math.min(pg, pages), pageRows = lib.slice((cur - 1) * PS, cur * PS);
  const room = SourceLogic.MAX_SOURCES - sources.length;
  const readyShown = pageRows.filter(s => isReady(s) && !sourceIds.includes(s.id));
  const pick = s => { if (busy) return; const on = sourceIds.includes(s.id); if (on) onSourceIds(sourceIds.filter(x => x !== s.id)); else if (isReady(s) && room > 0) onSourceIds([...sourceIds, s.id]); };
  const filters = (fold !== "all") + (srt !== "recent");
  const hoverOpen = (id, el) => {
    const r = el.getBoundingClientRect(), L = el.closest(".layout").getBoundingClientRect();
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek({ id, top: r.top - L.top, mid: r.height / 2, vh: L.height }), peek ? 60 : 350);
  };
  const hoverClose = () => { clearTimeout(peekTimer.current); peekTimer.current = setTimeout(() => setPeek(null), 280); };
  const startDrag = e => {
    e.preventDefault(); const x0 = e.clientX, w0 = railW; document.body.classList.add("resizing");
    const mv = ev => setRailW(Math.max(260, Math.min(560, w0 + ev.clientX - x0)));
    const up = () => { document.body.classList.remove("resizing"); removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  const ToneBadge = ({ t }) => <span className={`badge ${t}`}><Icon name={actionIcon(t)} size={10} />{actionLabel(t)}</span>;
  const PTag = ({ p }) => <span className="ptag" style={{ "--pc": pestleColor(p) }}><i style={{ background: pestleColor(p) }} />{p}</span>;

  return (
    <div className="nip pg" id="main" role="main" tabIndex={-1} style={{ "--rail-w": `${railW}px` }}>
      <h1 className="visually-hidden">News Impact</h1>
      <div className="layout">
        <aside className="rail" aria-label="What to assess">
          <div><div className="eyebrow">News impact</div><h2>Assess impact</h2><p className="field-help" style={{ marginTop: 4 }}>Score how news affects this roadmap, then add the advice to its items.</p></div>
          <div className="segmented" role="group" aria-label="What to assess">
            {[["Sources", "Saved sources"], ["Text", "Paste text or link"]].map(([mode, label]) =>
              <button key={mode} disabled={busy} className={inputMode === mode ? "on" : ""} aria-pressed={inputMode === mode} onClick={() => setInputMode(mode)}>{label}</button>)}
          </div>

          {sourcesMode ? <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span className="eyebrow">Sources to assess</span><span className="field-help num">{sources.length} of {SourceLogic.MAX_SOURCES} max</span></div>
            {library.length ? <>
              <div className="rail-tools">
                <div className="srch-row">
                  <label className="search"><Icon name="search" size={13} aria-hidden="true" /><input className="field-input" type="search" aria-label="Search sources" placeholder="Search sources" value={q} onChange={e => setQ(e.target.value)} /></label>
                  <button className={`fbtn ${fpop || filters ? "on" : ""}`} aria-expanded={fpop} aria-label="Folder and sort" title="Folder and sort" onClick={() => setFpop(v => !v)}>
                    <Icon name="filter" size={14} />{filters > 0 && <span className="fdot num">{filters}</span>}</button>
                  {fpop && <div className="fpop">
                    <div className="fpop-f"><span className="eyebrow">Folder</span><Select aria-label="Folder" value={fold} onChange={setFold}
                      options={[["all", `All folders (${library.length})`], ["", `Unfiled (${library.filter(s => !s.folderId).length})`], ...folders.map(f => [f.id, `${f.name} (${library.filter(s => s.folderId === f.id).length})`])]} /></div>
                    <div className="fpop-f"><span className="eyebrow">Sort</span><Select aria-label="Sort" value={srt} onChange={setSrt} options={[["recent", "Recently added"], ["name", "Name A–Z"]]} /></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><button className="link-btn" disabled={!filters} onClick={() => { setFold("all"); setSrt("recent"); }}>Reset</button><button className="link-btn" onClick={() => setFpop(false)}>Done</button></div>
                  </div>}
                </div>
                <div className="mini-seg" role="group" aria-label="Show">{[["ready", "Ready", library.filter(isReady).length], ["picked", "Selected", sources.length], ["all", "All", library.length]].map(([k, l, c]) =>
                  <button key={k} className={stat === k ? "on" : ""} aria-pressed={stat === k} onClick={() => setStat(k)}>{l} <span className="num">{c}</span></button>)}</div>
                {fold !== "all" && <div className="factive">In <b>{folderName(fold)}</b><button onClick={() => setFold("all")} aria-label="Clear folder"><Icon name="x" size={10} /></button></div>}
              </div>
              <div className="list-meta"><span className="num">{lib.length ? `${(cur - 1) * PS + 1}–${Math.min(cur * PS, lib.length)} of ${lib.length}` : "0 results"}</span>
                <span style={{ display: "flex", gap: 10 }}>
                  <button className="link-btn" disabled={busy || !readyShown.length || room <= 0} onClick={() => onSourceIds([...sourceIds, ...readyShown.map(s => s.id)].slice(0, SourceLogic.MAX_SOURCES))}>Select page</button>
                  <button className="link-btn" disabled={busy || !sourceIds.length} onClick={() => onSourceIds([])}>Clear</button>
                </span></div>
              <ul className="src-list">{pageRows.length ? pageRows.map(s => {
                const on = sourceIds.includes(s.id), ready = isReady(s);
                return <li key={s.id} className={`src ${on ? "on" : ""} ${ready ? "" : "off"} ${peek?.id === s.id ? "peeking" : ""}`}
                  onMouseEnter={e => hoverOpen(s.id, e.currentTarget)} onMouseLeave={hoverClose} onClick={() => pick(s)}>
                  <Check state={on ? "on" : ""} label={`Select ${s.name}`} disabled={busy || (!on && (!ready || room <= 0))} onClick={() => pick(s)} />
                  <div className="src-info"><div className="src-name" title={s.name}>{s.name}</div>
                    <div className="src-meta"><SourceBadge source={s} /><small>{folderName(s.folderId)} · Rev {s.revision} · {SOURCE_LANGUAGES[s.language]}</small></div></div>
                </li>;
              }) : <li className="src-empty">No sources match. Change the search, folder or status.</li>}</ul>
              {pages > 1 && <div className="rpager">
                <button disabled={cur === 1} onClick={() => setPg(cur - 1)} aria-label="Previous page">‹</button>
                <label className="pjump num">Page <input key={cur} type="number" min={1} max={pages} defaultValue={cur} aria-label="Go to page"
                  onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} onFocus={e => e.target.select()}
                  onBlur={e => { const n = Math.round(+e.target.value); if (n >= 1 && n <= pages) setPg(n); else e.target.value = cur; }} /> of {pages}</label>
                <button disabled={cur === pages} onClick={() => setPg(cur + 1)} aria-label="Next page">›</button>
              </div>}
              <p className="field-help">Only Ready sources can be ticked. Fix the others on the <a href="#" onClick={e => { e.preventDefault(); onManageSources(); }}>Sources tab</a>.</p>
            </> : <p className="field-help">This roadmap has no sources yet. Add files, websites or text on the <a href="#" onClick={e => { e.preventDefault(); onManageSources(); }}>Sources tab</a>.</p>}
            {busy && (!stopping
              ? <button className="btn" onClick={() => { cancelRef.current = true; setStopping(true); }}>Stop after current source</button>
              : <button className="btn" onClick={() => abortRef.current?.abort()}>Stop now (discard current source)</button>)}
          </> : <div className="field">
            <label className="field-label" htmlFor="advisor-news-input">Article text or a link</label>
            <textarea id="advisor-news-input" ref={textareaRef} className="field-textarea" rows={10} placeholder="Paste a news article or policy update, or a single https:// link"
              value={newsText} onChange={e => setNewsText(e.target.value)} />
          </div>}

          {(error || configError) && <div className="bad-bar" role="alert" aria-live="assertive"><Icon name="alert-triangle" size={14} /><p>{error || configError}</p></div>}

          <button className="btn-run" onClick={runAdvisor} title="Ctrl+Enter" disabled={busy || (sourcesMode ? !sources.length : !newsText.trim())}>
            <span className="run-ic">{busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkles" size={16} />}</span>
            <span className="run-txt">
              <b>{busy ? <>Assessing… <span className="num">{elapsed}s</span></> : !sourcesMode ? "Assess text" : sources.length ? `Assess ${sources.length} source${sources.length === 1 ? "" : "s"}` : "Assess sources"}</b>
              <small>{busy ? "Scoring impact and writing advice" : (sourcesMode ? sources.length : newsText.trim()) ? "Score impact and generate advice" : sourcesMode ? "Select at least one source" : "Paste text or a link first"}</small>
            </span>
            <span className="run-go" aria-hidden="true">→</span>
          </button>

          <details className="settings">
            <summary><Icon name="settings" size={13} />Settings</summary>
            <div className="settings-body">
              <label className="check-inline"><Check state={allowExternalAI ? "on" : ""} label="Use hosted AI guidance" disabled={busy || !modelOptions.length} onClick={() => setAllowExternalAI(v => !v)} />Use hosted AI guidance</label>
              <div className="field-help">Off uses deterministic advice and makes no hosted guidance calls. On sends evidence and matched roadmap items to OpenRouter.</div>
              <div className="field">
                <label className="field-label" htmlFor="advisor-llm-model">LLM advice model</label>
                <Select id="advisor-llm-model" value={llmModel} disabled={busy || !allowExternalAI || !modelOptions.length} options={modelOptions.map(m => [m, m])} onChange={setLlmModel} />
                <div className="field-help">Server-approved OpenRouter models. Hosted advice requires <code>OPENROUTER_API_KEY</code> on the backend.</div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="advisor-points">Evidence points</label>
                <input id="advisor-points" className="field-input" type="number" min={KEYPOINTS_MIN} max={KEYPOINTS_MAX} value={maxPoints} onChange={e => setMaxPoints(Number(e.target.value || KEYPOINTS_MAX))} />
                <div className="field-help">Key points extracted per source. Verdict bands are calibrated at {KEYPOINTS_MAX}.</div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="advisor-api-url">API endpoint</label>
                <input id="advisor-api-url" className="field-input mono" value={apiDraft} onChange={e => setApiDraft(e.target.value)}
                  onBlur={e => setApiUrl(e.target.value.trim() || DEFAULT_ADVISOR_API)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                <div className="field-help">Applied when you leave the field. The service is started on the computer with <code>python src/api/roadmap_api.py</code>.</div>
              </div>
            </div>
          </details>
        </aside>
        <div className="rail-handle" role="separator" aria-orientation="vertical" aria-label="Resize sources panel" aria-valuenow={railW} aria-valuemin={260} aria-valuemax={560} tabIndex={0}
          title="Drag to resize · double-click to reset" style={{ left: railW - 4 }} onPointerDown={startDrag} onDoubleClick={() => setRailW(340)}
          onKeyDown={e => { if (e.key === "ArrowLeft") setRailW(w => Math.max(260, w - 20)); if (e.key === "ArrowRight") setRailW(w => Math.min(560, w + 20)); }} />

        <main className="main" aria-busy={busy ? "true" : "false"}>
          {sourcesMode && !rows.length && <section className="card empty">
            <Icon name="search" size={22} />
            <h2>{!library.length ? "Add sources to this roadmap first" : sources.length ? `Ready to assess ${sources.length} source${sources.length === 1 ? "" : "s"}` : "Tick the sources to assess"}</h2>
            <p>{!library.length ? "Import PDFs, images, text files or websites on the Sources tab and review their text. Then come back here."
              : "Each source is scored separately and averaged into one overall impact severity. Afterwards, pick the advice to add to your roadmap items."}</p>
            {!library.length && <button className="btn btn-accent" onClick={onManageSources}><Icon name="plus" size={14} />Add sources</button>}
          </section>}
          {!sourcesMode && !result && <section className="card empty">
            {busy ? <><span className="spinner" aria-hidden="true" /><h2>Assessing the text… <span className="num">{elapsed}s</span></h2><p>The first run is usually the slowest while models load.</p></>
              : <><Icon name="search" size={22} /><h2>Paste an article or a link</h2><p>It is compared with this roadmap. Afterwards, pick the advice to add to your roadmap items.</p></>}
          </section>}

          {(rows.length > 0 && sourcesMode || result) && <section className="card">
            <div className="sum-score">
              <div className="eyebrow">{sourcesMode ? `Overall impact severity · ${rows.length} source${rows.length === 1 ? "" : "s"}` : "Impact severity · pasted text"}</div>
              {headline ? <>
                <div className="score-line">
                  <div className="score-big num">{pct(headline.sev)}<small>/ 100</small></div>
                  <div className="verdict"><b className={`tone-${verdictTone(headline.verdict)}`}>{headline.verdict}</b><span>{SUBLABEL[headline.verdict]}</span></div>
                </div>
                <div className="scale" role="img" aria-label={`Severity ${pct(headline.sev)} of 100. Adjust from ${pct(headline.thresholds.adjust)}, Revise from ${pct(headline.thresholds.revise)}.`}>
                  <div className="scale-marker" style={{ left: `${headline.sev * 100}%` }}><span>{pct(headline.sev)}</span></div>
                  <div className="scale-track">{[[headline.thresholds.adjust, "oklch(88% 0.06 158)"], [headline.thresholds.revise - headline.thresholds.adjust, "oklch(87% 0.09 65)"], [1 - headline.thresholds.revise, "oklch(86% 0.08 25)"]].map(([w, c], i) => <i key={i} style={{ width: `${w * 100}%`, background: c }} />)}</div>
                </div>
              </> : <>
                <p className="viewing">{overallNote}</p>
                {busy && <div className="progress-track" aria-hidden="true"><i style={{ width: `${100 * batchResults.length / (rows.length || 1)}%` }} /></div>}
              </>}
            </div>
            {headline && result && <div className="calc-inline">
              <button className="calc-toggle" aria-expanded={calcOpen} onClick={() => setCalcOpen(v => !v)}>Where does this score come from? <span className={`chev-d ${calcOpen ? "open" : ""}`}>▾</span><span className="hint">4 steps · equal weight per source</span></button>
              {calcOpen && <div className="calc-body">
                <ol className="flow">
                  <li className="fstep"><span className="fnum">1</span><div className="fval">{evidence.length} <small>signals</small></div><b>We pulled out the key sentences</b><p>Sentences {result.source_ref ? <>from <b>{result.source_ref.name}</b>{multi ? " (the source you are viewing)" : ""}</> : "from the text"} that relate to this roadmap.</p>
                    <div className="pestle-bar">{Object.entries(pcounts).map(([p, c]) => <i key={p} title={`${p} ${c}`} style={{ width: `${c / evidence.length * 100}%`, background: pestleColor(p) }} />)}</div>
                    <div className="flegend">{Object.entries(pcounts).map(([p, c]) => <span key={p}><i style={{ background: pestleColor(p) }} />{p} {c}</span>)}</div></li>
                  <li className="farrow" aria-hidden="true">→</li>
                  <li className="fstep"><span className="fnum">2</span><div className="fval">{pct(result.severity)}</div><b>We scored {result.source_ref ? "this source" : "the text"}</b><p>How strongly these signals affect your roadmap, from 0 to 100.{multi ? " Other sources are scored the same way." : ""}</p></li>
                  <li className="farrow" aria-hidden="true">→</li>
                  <li className="fstep"><span className="fnum">3</span><div className="fval">{pct(headline.sev)}</div><b>{sourcesMode ? "We averaged all sources" : "One text, no averaging"}</b>
                    <p>{!sourcesMode || combined.count === 1 ? "Only one input, so the overall score is the same." : `Each of the ${combined.count} sources counts equally (1/${combined.count}).`}</p></li>
                  <li className="farrow" aria-hidden="true">→</li>
                  <li className="fstep final"><span className="fnum">4</span><div className={`fval tone-${verdictTone(headline.verdict)}`}>{headline.verdict}</div><b>The score sets the verdict</b>
                    <div className="fbands">
                      <span className={`fb ${headline.verdict === "Maintain" ? "on" : ""}`}>Maintain <em>under {pct(headline.thresholds.adjust)}</em></span>
                      <span className={`fb ${headline.verdict === "Adjust" ? "on" : ""}`}>Adjust <em>{pct(headline.thresholds.adjust)}–{pct(headline.thresholds.revise)}</em></span>
                      <span className={`fb ${headline.verdict === "Revise" ? "on" : ""}`}>Revise <em>{pct(headline.thresholds.revise)}+</em></span>
                    </div></li>
                </ol>
                {sourcesMode && combined && <p className="formula">({batchResults.map(r => pct(r.severity)).join(" + ")}) ÷ {combined.count} = {pct(combined.severity)} <span>· arithmetic mean of unrounded returned severities</span></p>}
                <p className="fnote"><Icon name="alert-triangle" size={13} />This score shows how much the news affects your roadmap. It does not rate source credibility, company performance or how likely the events are.</p>
              </div>}
            </div>}
            {result?.reason && !multi && <div className="reason"><span className="eyebrow">Why</span><p>{result.reason}</p></div>}
          </section>}

          {sourcesMode && rows.length > 0 && (reviseCount > 0 && combined && combined.verdict !== "Revise" || stale || batchNotice || (!busy && retryRows.length > 0)) && <div className="notes">
            {combined && combined.verdict !== "Revise" && reviseCount > 0 && <p role="status" className="note-bar">{reviseCount} source{reviseCount === 1 ? "" : "s"} individually indicate{reviseCount === 1 ? "s" : ""} <b>Revise</b>{worst ? <> (highest: {worst.source_ref?.name}, {pct(worst.severity)})</> : ""}. The average can hide this; review {reviseCount === 1 ? "that source" : "those sources"} before relying on the overall verdict.</p>}
            {stale && <p role="status" className="note-bar">{stale}</p>}
            {batchNotice && <p role="status" className="note-bar">{batchNotice}</p>}
            {!busy && retryRows.length > 0 && <button className="btn btn-sm" onClick={retryBatch}><Icon name="redo" size={13} />Retry {retryRows.length} source{retryRows.length === 1 ? "" : "s"}</button>}
          </div>}
          {result?.source_ref && rows.length > 1 && <p className="viewing">Signals and advice below are for <b>{result.source_ref.name}</b> · revision {result.source_ref.revision}. Pick another source on the Sources tab.</p>}
          {multi && result?.reason && <div className="reason"><span className="eyebrow">Why this source</span><p>{result.reason}</p></div>}

          {tabs.length > 0 && <>
            <nav className="ptabs" role="tablist" aria-label="Results">{tabs.map(([k, l, c, ic]) =>
              <button key={k} data-k={k} role="tab" aria-selected={activeTab === k} className={activeTab === k ? "on" : ""} onClick={() => setTab(k)}>
                <span className="ti"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{ic}</svg></span>{l}<span className="ct num">{c}</span></button>)}</nav>

            {activeTab === "recs" && <section className="card" role="tabpanel" aria-label="Advice">
              <div className="bar1">
                <Check state={!nShownSel ? "" : nShownSel === filteredEntries.length ? "on" : "mixed"} label="Select all advice shown" disabled={!filteredEntries.length}
                  onClick={() => setSelected(nShownSel === filteredEntries.length ? new Set() : new Set(filteredEntries.map(i => i.item_id)))} />
                <span className="lh-text">{selectedCount ? <><b>{selectedCount}</b> of {itemEntries.length} selected</> : <>{filteredEntries.length} advice item{filteredEntries.length === 1 ? "" : "s"}</>}</span>
                <span className="spacer" />
                <button className="btn btn-ghost btn-sm" onClick={() => setOpenI(openI.length ? [] : filteredEntries.map(i => i.item_id))}>{openI.length ? "Collapse all" : "Expand all"}</button>
              </div>
              {itemEntries.length > 0 && <div className="filter-rows">
                <div className="fr"><span className="fl">Action</span><div className="filt" role="group" aria-label="Filter by action">
                  {[["all", "All"], ["revise", "Revise"], ["adjust", "Adjust"], ["maintain", "Maintain"]].map(([k, l]) =>
                    <button key={k} className={actionFilter === k ? "on" : ""} aria-pressed={actionFilter === k} title={`${l}. Shift+click to select these items.`}
                      disabled={k !== "all" && !actionCounts[k]} onClick={e => filterPillSelect(k, e)}>{l}<span className="ct num">{actionCounts[k] || 0}</span></button>)}
                </div></div>
                {expertsActive.length > 0 && <div className="fr"><span className="fl">Expert</span><div className="filt" role="group" aria-label="Filter by expert">
                  <button className={expertFilter === "all" ? "on" : ""} aria-pressed={expertFilter === "all"} onClick={() => setExpertFilter("all")}>All experts<span className="ct num">{expertsActive.length}</span></button>
                  {expertsActive.map(role => <button key={role} className={expertFilter === role ? "on" : ""} aria-pressed={expertFilter === role} onClick={() => setExpertFilter(expertFilter === role ? "all" : role)}>
                    <i style={{ background: pestleColor(role) }} />{role}<span className="ct num">{expertCounts[role] || 0}</span></button>)}
                </div></div>}
              </div>}
              {layers.map(L => { const group = filteredEntries.filter(i => (i.layer || "Other") === L); return <div key={L}>
                <div className="ghead">{L}<span className="num">{group.length}</span></div>
                {group.map(item => {
                  const tones = new Set(item.advices.map(a => actionTone(a.action)));
                  const t = tones.has("revise") ? "revise" : tones.has("adjust") ? "adjust" : "maintain";
                  const on = selected.has(item.item_id), op = openI.includes(item.item_id);
                  const pc = pestleColor((item.matched_drivers || [])[0] || item.advices[0]?.role);
                  return <React.Fragment key={item.item_id}>
                    <div className={`r1 ${on ? "sel" : ""}`} style={{ "--pc": pc }} role="button" tabIndex={0} aria-expanded={op}
                      onClick={() => tg(setOpenI)(item.item_id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tg(setOpenI)(item.item_id); } }}>
                      <Check state={on ? "on" : ""} label={`Select ${item.item_name}`} onClick={() => toggleSelected(item.item_id)} />
                      <h3 title={item.item_name}>{item.item_name}</h3>
                      <div className="bands" title={(item.time_bands || []).join(", ")}>{state.bands.map(b => <span key={b.id} className={(item.time_bands || []).includes(b.label) ? "on" : ""} style={{ "--bc": b.color }}>{shortBand(b.label)}</span>)}</div>
                      <ToneBadge t={t} />
                      <span className={`chev ${op ? "open" : ""}`} aria-hidden="true">›</span>
                    </div>
                    {op && <div className="xpand" style={{ "--pc": pc }}>
                      {item.advices.map((a, idx) => { const ev = a.evidence_keypoint; const e = ev?.id && evById(ev.id); return <div key={`${a.role}-${idx}`} className="xadv">
                        <p className="advice">{a.advice}</p>
                        <div className="advice-foot"><span className="who">{a.role} expert · {actionLabel(actionTone(a.action))}</span>
                          {ev?.sentence && <><span>·</span><span>Based on</span><button className="cite" title={evidenceSnippet(ev.sentence)} onClick={() => e ? goEv(e.id) : null}>
                            <Icon name="quote" size={11} /><span>{`${ev.id ? ev.id + " · " : ""}${ev.sentence.split(" ").slice(0, 6).join(" ")}…`}</span></button></>}
                        </div>
                      </div>; })}
                      {(item.matched_drivers || []).length > 0 && <div className="advice-foot"><span>Matched drivers</span>{item.matched_drivers.map(d => <PTag key={d} p={d} />)}</div>}
                    </div>}
                  </React.Fragment>;
                })}
              </div>; })}
              {!filteredEntries.length && <div className="src-empty">{itemEntries.length ? "No items match these filters." : "No matched roadmap items in this analysis."}</div>}
              {guidance.summary && <div className="provider">
                <p>{guidance.summary}</p>
                <p>Advisor: {guidance.llm_provider || "deterministic"}{guidance.llm_model ? ` (${guidance.llm_model})` : ""}</p>
                {guidance.llm_error && <p role="alert" className="bad-bar">Hosted guidance unavailable. Showing deterministic advice: {guidance.llm_error}</p>}
                {guidance.expert_errors && <p role="alert" className="bad-bar">Some expert guidance is unavailable: {Object.entries(guidance.expert_errors).map(([role, message]) => `${role}: ${message}`).join("; ")}</p>}
              </div>}
            </section>}

            {activeTab === "evidence" && <section className="card" role="tabpanel" aria-label="Key signals">
              {evidence.length > 0 && <div className="ev-summary">
                <div className="pestle-bar">{Object.entries(pcounts).map(([p, c]) => <i key={p} title={`${p} ${c}`} style={{ width: `${c / evidence.length * 100}%`, background: pestleColor(p) }} />)}</div>
                <div className="legend">{Object.keys(pcounts).map(p => <PTag key={p} p={p} />)}</div>
                <div className="legend">{["positive", "neutral", "negative"].filter(k => scounts[k]).map(k => <span key={k} className={`sent sent-${k}`}>{scounts[k]} {k[0].toUpperCase() + k.slice(1)}</span>)}</div>
              </div>}
              <div className="bar1"><span className="field-help">Click a signal to read it in full</span><span className="spacer" />
                <button className="btn btn-ghost btn-sm" onClick={() => setOpenE(openE.length ? [] : evRows.map(x => x.id))}>{openE.length ? "Collapse all" : "Expand all"}</button>
                <div className="filt" role="group" aria-label="Sort signals"><button className={evSort === "rel" ? "on" : ""} aria-pressed={evSort === "rel"} onClick={() => setEvSort("rel")}>By relevance</button><button className={evSort === "id" ? "on" : ""} aria-pressed={evSort === "id"} onClick={() => setEvSort("id")}>In order</button></div>
              </div>
              {evRows.map(x => { const op = openE.includes(x.id), rel = Math.round((x.relevance || 0) * 100), s = (x.sentiment_label || "neutral").toLowerCase(); return (
                <div key={x.id} className={`e1 ${op ? "open" : ""} ${hl === x.id ? "hl" : ""}`} style={{ "--pc": pestleColor(x.pestle) }} role="button" tabIndex={0} aria-expanded={op}
                  onClick={() => tg(setOpenE)(x.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tg(setOpenE)(x.id); } }}>
                  <span className="ev-id">{x.id}</span>
                  <div><p className="ev-text">{x.sentence}</p>{op && <div className="ev-meta"><PTag p={x.pestle} /><span>Relevance {rel}%</span><span>Sentiment: {s}</span>{usedBy(x.id) > 0 && <span className="used">Cited by {usedBy(x.id)} item{usedBy(x.id) === 1 ? "" : "s"}</span>}</div>}</div>
                  <span className={`sent sent-${s} num`} title={`${s} · relevance ${rel}%`}>{rel}%</span>
                </div>); })}
              {!evidence.length && <div className="src-empty">No key signals in this result.</div>}
            </section>}

            {activeTab === "sources" && <section className="card" role="tabpanel" aria-label="Sources">
              <div className="sec-title"><div><div className="eyebrow">Results by source</div><h2>Source scores<small>{batchResults.length - failedCount} of {rows.length} assessed</small></h2></div>
                <span className="field-help">Signals and advice are shown for the highlighted source</span></div>
              <div role="table">
                <div className="srow head" role="row"><span>Source</span><span className="bar-col">Severity</span><span style={{ textAlign: "right" }}>Score</span><span>Verdict</span><span className="act-col" /></div>
                {rows.map(row => {
                  const r = batchResults.find(x => x.source_ref?.id === row.source_ref.id);
                  const st = r ? (r.error ? "failed" : verdictTone(r.verdict)) : busy && row.source_ref.id === runningId ? "running" : "waiting";
                  const viewing = !!r && result === r;
                  return <div key={row.source_ref.id} className={`srow ${viewing ? "viewing" : ""}`} role="row">
                    <span className="srow-name" title={row.source_ref.name}>{row.source_ref.name} <small>· rev {row.source_ref.revision}</small></span>
                    <span className="bar-col minibar">{r && !r.error && <i style={{ width: `${r.severity * 100}%`, background: `var(--t-${st})` }} />}</span>
                    <span className="mono num">{r && !r.error ? pct(r.severity) : "–"}</span>
                    <span>{r && !r.error ? <ToneBadge t={st} /> : <span className="field-help" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{st === "running" && <span className="spinner" aria-hidden="true" />}{r?.error ? "Failed" : st === "running" ? "Assessing…" : busy ? "Waiting" : "Not assessed"}</span>}</span>
                    <span className="act-col">{r && !r.error && <button className="btn btn-sm" disabled={busy || viewing} aria-pressed={viewing} onClick={() => viewResult(r)}>{viewing ? "Viewing" : "View advice"}</button>}</span>
                    {r?.error && <p role="alert" className="srow-err">{r.error}</p>}
                  </div>;
                })}
              </div>
            </section>}
          </>}
        </main>

        {peek && sourcesMode && (() => {
          const s = library.find(x => x.id === peek.id); if (!s) return null;
          const text = (s.language === "en" ? s.correctedText : s.englishText || s.correctedText) || "";
          const words = text.trim() ? text.trim().split(/\s+/).length : 0;
          const top = Math.max(12, Math.min(peek.top - 24, peek.vh - 440)), tip = Math.max(18, Math.min(peek.top + peek.mid - top, 420));
          return <aside className="peekpane" style={{ left: railW + 10, top, "--tip": `${tip}px` }} onMouseEnter={() => clearTimeout(peekTimer.current)} onMouseLeave={hoverClose} aria-label={`Preview of ${s.name}`}>
            <span className="eyebrow">Source preview</span>
            <h3 className="pp-title">{s.name}</h3>
            <div className="src-meta"><SourceBadge source={s} /><small>{SOURCE_LANGUAGES[s.language]} · Rev {s.revision}</small></div>
            <dl className="pp-facts"><div><dt>Folder</dt><dd>{folderName(s.folderId)}</dd></div><div><dt>Added</dt><dd className="num">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "–"}</dd></div><div><dt>Length</dt><dd className="num">{words.toLocaleString()} words</dd></div></dl>
            <div className="pp-body"><span className="eyebrow">Excerpt{s.language !== "en" && s.englishText ? " (English)" : ""}</span><p>{text.slice(0, 700) || "No text yet."}{text.length > 700 ? "…" : ""}</p></div>
            {!isReady(s) && <p className="pp-note">{SourceLogic.status(s)[0] === "Needs translation" ? "Translate this source before it can be assessed." : "Review this source on the Sources tab before it can be assessed."}</p>}
          </aside>;
        })()}
      </div>

      {selectedCount > 0 && result && <div className="applybar" role="region" aria-label="Add advice">
        <span><b className="num">{selectedCount}</b> item{selectedCount === 1 ? "" : "s"} selected{result.source_ref ? ` · advice from ${result.source_ref.name}` : ""}</span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Deselect all</button>
        <button className="btn btn-accent" onClick={applySelected}><Icon name="check" size={14} />Add {selectedCount} advice note{selectedCount === 1 ? "" : "s"} to roadmap</button>
      </div>}
      <footer className="app-foot" title="Analysis sends approved text to your local API; hosted advice remains opt-in.">Analysis sends approved text to your local API; hosted advice remains opt-in.</footer>
    </div>
  );
}

Object.assign(window, { ImpactAdvisor });
