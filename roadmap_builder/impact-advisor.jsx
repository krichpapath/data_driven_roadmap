/* global React, Icon, PESTLE */

const ADVISOR_API_KEY = "ddrm_advisor_api_url";
const ADVISOR_MODEL_KEY = "ddrm_advisor_llm_model";
const DEFAULT_ADVISOR_API = "http://127.0.0.1:7875/api/recommend";
const DEFAULT_ADVISOR_MODEL = "gpt-4o-mini";
const EVIDENCE_SNIPPET_MAX = 220;
// Mirrors KEYPOINTS_MIN / KEYPOINTS_MAX in src/config.py. The impact bands are
// calibrated at KEYPOINTS_MAX, so asking for fewer points shifts verdicts.
// The backend clamps to this range anyway; keep the two in sync if config.py changes.
const KEYPOINTS_MIN = 3;
const KEYPOINTS_MAX = 7;

const ADVISOR_MODEL_OPTIONS = [
  { value: "gpt-4o",        label: "GPT-4o — best quality, slower",         tier: "premium" },
  { value: "gpt-4o-mini",   label: "GPT-4o mini — fast, cheap (default)",   tier: "default" },
  { value: "gpt-4-turbo",   label: "GPT-4 Turbo — strong reasoning",        tier: "premium" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo — cheapest, lower depth", tier: "budget"  },
  { value: "o1-mini",       label: "o1-mini — reasoning model",             tier: "premium" },
  { value: "o3-mini",       label: "o3-mini — newer reasoning model",       tier: "premium" },
];

// localStorage-backed state. Reads once on mount; writes on every change.
// Falls back to `defaultValue` when storage is empty or unavailable.
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

// Read a File as UTF-8 text. Returns a promise so callers can await + handle errors uniformly.
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Build the inline style for a PESTLE-tinted pill. Centralises the four
// color-mix() calls that were duplicated across keypoint, expert, and driver pills.
function pestleTintStyle(color) {
  return {
    background: `color-mix(in oklch, ${color} 22%, var(--surface))`,
    color: `color-mix(in oklch, ${color} 90%, var(--ink))`,
    borderColor: `color-mix(in oklch, ${color} 50%, var(--line))`
  };
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

function severityBucket(s) {
  const v = Number(s || 0);
  if (v >= 0.66) return "High";
  if (v >= 0.33) return "Med";
  return "Low";
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

function friendlyAdvisorError(error, status) {
  const raw = error?.message || String(error || "");
  if (raw === "Failed to fetch" || raw.includes("NetworkError")) {
    return "Advisor API is not running. Start `python src/api/roadmap_api.py` and retry.";
  }
  if (status === 400) {
    return `Input needs more usable news text. ${raw}`;
  }
  if (status === 503) {
    return `Impact model is not ready. ${raw}`;
  }
  return raw || "Advisor request failed.";
}

function ImpactAdvisor({ open, onClose, state, onApplyGuidance }) {
  const fileRef = React.useRef(null);
  const textareaRef = React.useRef(null);
  const [fileDragOver, setFileDragOver] = React.useState(false);
  const [apiUrl, setApiUrl] = useLocalStorageState(ADVISOR_API_KEY, DEFAULT_ADVISOR_API);
  const [llmModel, setLlmModel] = useLocalStorageState(ADVISOR_MODEL_KEY, DEFAULT_ADVISOR_MODEL);
  const [inputMode, setInputMode] = React.useState("Text");
  const [newsText, setNewsText] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [maxPoints, setMaxPoints] = React.useState(KEYPOINTS_MAX);
  const [busy, setBusy] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState(null);
  const [selected, setSelected] = React.useState(new Set());
  const [actionFilter, setActionFilter] = React.useState("all"); // all | revise | adjust | maintain
  const [expertFilter, setExpertFilter] = React.useState("all"); // all | <PESTLE role>
  const [showReasoning, setShowReasoning] = React.useState(false);

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

  // Keyboard shortcuts: Cmd/Ctrl+Enter run, Esc close, "/" focus textarea
  const runRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runRef.current?.();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
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
  }, [open, onClose]);

  if (!open) return null;

  const guidance = result?.guidance || {};
  const expertAdvicesMap = guidance.expert_advices || {};
  const expertsActive = guidance.experts_active || [];
  const matches = result?.roadmap_matches || [];
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

  // Apply both filters. expertFilter narrows the visible advice cards inside an item too.
  const filteredEntries = itemEntries
    .map(item => {
      const advices = (item.advices || []).filter(a => {
        if (expertFilter !== "all" && a.role !== expertFilter) return false;
        return true;
      });
      return { ...item, advices };
    })
    .filter(item => {
      if (item.advices.length === 0) return false;
      if (actionFilter === "all") return true;
      return item.advices.some(a => actionTone(a.action) === actionFilter);
    });

  const loadFile = async (file) => {
    setFileName(file.name);
    try {
      setNewsText(await readTextFile(file));
    } catch {
      setError("Could not read file.");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleModeSwitch = (mode) => {
    setInputMode(mode);
    if (mode !== "File") setFileName("");
  };

  const filterPillSelect = (filterKey, e) => {
    setActionFilter(filterKey);
    if (e.shiftKey) {
      // Shift+click bulk-select items where any advice matches
      const ids = filterKey === "all"
        ? itemEntries.map(i => i.item_id)
        : itemEntries
            .filter(i => (i.advices || []).some(a => actionTone(a.action) === filterKey))
            .map(i => i.item_id);
      setSelected(new Set(ids));
    }
  };

  const runAdvisor = async () => {
    if (!newsText.trim()) {
      setError(inputMode === "File" ? "Load a .txt file first." : "Add news URL or article text first.");
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
          input_mode: inputMode === "File" ? "Text" : inputMode,
          max_points: maxPoints,
          llm_model: llmModel,
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
      setResult(data.result);
      // Pre-select all items that received advice (new shape first, legacy fallback second).
      const expertMap = data.result.guidance?.expert_advices || {};
      const expertIds = Object.keys(expertMap);
      const ids = new Set(
        expertIds.length > 0
          ? expertIds
          : (data.result.guidance?.item_guidance || []).map(i => i.item_id)
      );
      setSelected(ids);
      setExpertFilter("all");
      setActionFilter("all");
    } catch (e) {
      setError(friendlyAdvisorError(e, e.status));
    } finally {
      setBusy(false);
    }
  };
  runRef.current = runAdvisor;

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
  };

  return (
    <div className="advisor-shell">
      <div className="advisor-topbar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <div className="brand-name">DDRM<em>advisor</em></div>
            <div className="advisor-subtitle">News impact connected to this roadmap</div>
          </div>
        </div>
        <button className="btn" onClick={onClose}><Icon name="x" size={14} /> Close</button>
      </div>

      <div className="advisor-layout">
        <aside className="advisor-input">
          <div className="advisor-panel-head">
            <div>
              <div className="rail-eyebrow">Incoming signal</div>
              <h2>Assess news</h2>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Input type</label>
            <div className="segmented">
              {["Text", "URL", "File"].map(mode => (
                <button key={mode} className={inputMode === mode ? "on" : ""} onClick={() => handleModeSwitch(mode)}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {inputMode === "File" ? (
            <div className="field">
              <label className="field-label">Text file (.txt)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".txt"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <div
                className={`advisor-dropzone ${fileDragOver ? "drag-over" : ""} ${fileName ? "has-file" : ""}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setFileDragOver(true); }}
                onDragEnter={e => { e.preventDefault(); setFileDragOver(true); }}
                onDragLeave={() => setFileDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setFileDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  if (!file.name.endsWith(".txt")) {
                    setError("Only .txt files supported.");
                    return;
                  }
                  loadFile(file);
                }}
              >
                {fileName ? (
                  <>
                    <div className="advisor-dropzone-icon success"><Icon name="check" size={18} /></div>
                    <div className="advisor-dropzone-text">
                      <strong>{fileName}</strong>
                      <span>{newsText.length.toLocaleString()} chars loaded</span>
                    </div>
                    <button className="btn btn-ghost btn-icon advisor-dropzone-clear"
                      title="Clear file"
                      onClick={e => { e.stopPropagation(); setFileName(""); setNewsText(""); }}>
                      <Icon name="x" size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="advisor-dropzone-icon"><Icon name="import" size={20} /></div>
                    <div className="advisor-dropzone-text">
                      <strong>{fileDragOver ? "Drop to load" : "Drop .txt file here"}</strong>
                      <span>or click to browse</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="field">
              <label className="field-label" htmlFor="advisor-news-input">{inputMode === "URL" ? "News URL" : "Article text"}</label>
              <textarea
                id="advisor-news-input"
                ref={textareaRef}
                className="field-textarea advisor-news"
                placeholder={inputMode === "URL" ? "https://..." : "Paste upcoming news or policy update here. (Press / to focus)"}
                value={newsText}
                onChange={e => setNewsText(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label className="field-label">Evidence points</label>
            <input
              className="field-input"
              type="number"
              min={KEYPOINTS_MIN}
              max={KEYPOINTS_MAX}
              value={maxPoints}
              onChange={e => setMaxPoints(Number(e.target.value || KEYPOINTS_MAX))}
            />
          </div>

          {error && (
            <div className="advisor-error" role="alert" aria-live="assertive">{error}</div>
          )}

          <button className="btn btn-accent btn-lg advisor-run" onClick={runAdvisor} disabled={busy}>
            <Icon name="wand" size={15} />
            {busy ? (
              <span>Assessing… <span className="advisor-timer num">{elapsed}s</span></span>
            ) : "Assess impact"}
          </button>
          <div className="advisor-shortcuts" aria-hidden="true">
            <Icon name="keyboard" size={12} />
            <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> run · <kbd>/</kbd> focus · <kbd>Esc</kbd> close</span>
          </div>

          <details className="advisor-settings">
            <summary><Icon name="settings" size={13} /> Settings</summary>
            <div className="field">
              <label className="field-label" htmlFor="advisor-llm-model">LLM advice model</label>
              <select
                id="advisor-llm-model"
                className="field-input"
                value={llmModel}
                onChange={e => setLlmModel(e.target.value)}
              >
                {ADVISOR_MODEL_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <div className="field-help">OpenAI model used for guidance. Backend must have <code>OPENAI_API_KEY</code> configured.</div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="advisor-api-url">API endpoint</label>
              <input id="advisor-api-url" className="field-input mono" value={apiUrl} onChange={e => setApiUrl(e.target.value)} />
              <div className="field-help">Run <code>python src/api/roadmap_api.py</code> before using this panel.</div>
            </div>
          </details>
        </aside>

        <main className="advisor-results" aria-busy={busy ? "true" : "false"}>
          <div className="advisor-stepper" role="list" aria-label="Progress">
            {[
              { label: "Input",   done: !!newsText.trim() && (busy || !!result), active: !newsText.trim() },
              { label: "Analyze", done: !!result,                                 active: busy && !result },
              { label: "Review",  done: !!result && selectedCount > 0,            active: !!result && selectedCount === 0 },
              { label: "Apply",   done: false,                                    active: selectedCount > 0 },
            ].map((step, i, arr) => (
              <React.Fragment key={step.label}>
                <div role="listitem" className={`advisor-step ${step.done ? "done" : step.active ? "active" : ""}`} aria-current={step.active ? "step" : undefined}>
                  <div className="advisor-step-node">
                    {step.done ? <Icon name="check" size={11} /> : <span>{i + 1}</span>}
                  </div>
                  <span className="advisor-step-label">{step.label}</span>
                </div>
                {i < arr.length - 1 && <div className={`advisor-step-connector ${step.done ? "done" : ""}`} aria-hidden="true" />}
              </React.Fragment>
            ))}
          </div>

          {busy && !result && (
            <div className="advisor-skeleton-wrap">
              <div className="advisor-skel-banner advisor-skel-pulse" />
              {[0, 1, 2].map(i => (
                <div key={i} className="advisor-skel-card advisor-skel-pulse">
                  <div className="advisor-skel-card-head">
                    <div className="advisor-skel-line advisor-skel-line--title" />
                    <div className="advisor-skel-tag" />
                  </div>
                  <div className="advisor-skel-line advisor-skel-line--meta" />
                  <div className="advisor-skel-line" />
                  <div className="advisor-skel-line advisor-skel-line--short" />
                  <div className="advisor-skel-block" />
                </div>
              ))}
            </div>
          )}

          {!result && !busy && (
            <div className="advisor-empty">
              <Icon name="search" size={22} />
              <h2>Roadmap-aware impact review</h2>
              <p>Current roadmap is already attached. Add news, run impact, then review matched roadmap items and LLM advice in one place.</p>
            </div>
          )}

          {result && (
            <>
              {(() => {
                const sev = Number(result.severity || 0);
                const sevPct = Math.round(sev * 100);
                const tone = verdictTone(result.verdict);
                const sublabel = result.verdict === "Revise"
                  ? "Significant revision needed"
                  : result.verdict === "Adjust"
                    ? "Minor adjustments recommended"
                    : "Aligns well with signals";
                return (
                  <section className={`advisor-verdict advisor-verdict--v2 advisor-verdict--compact ${tone}`}>
                    <div className="advisor-verdict-pill">
                      <Icon name={actionIcon(tone)} size={20} />
                      <div>
                        <div className="rail-eyebrow">DDRM verdict</div>
                        <h1>{result.verdict}</h1>
                      </div>
                    </div>
                    <div className="advisor-verdict-meta">
                      <span className="advisor-verdict-sublabel">{sublabel}</span>
                    </div>
                    <div className="advisor-verdict-severity"
                      role="progressbar"
                      aria-valuenow={sevPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Severity ${severityBucket(sev)} (${sevPct}%)`}>
                      <div className="advisor-severity-header">
                        <span className="advisor-severity-label">Severity · {severityBucket(sev)}</span>
                        <span className="advisor-severity-value num">{sev.toFixed(2)}</span>
                      </div>
                      <div className="advisor-severity-track">
                        <div className="advisor-severity-fill" style={{ width: `${sevPct}%` }} />
                        <span className="advisor-severity-tick" style={{ left: "33%" }} aria-hidden="true" />
                        <span className="advisor-severity-tick" style={{ left: "66%" }} aria-hidden="true" />
                      </div>
                      <div className="advisor-severity-scale" aria-hidden="true">
                        <span>Low</span><span>Med</span><span>High</span>
                      </div>
                    </div>
                    <details className="advisor-verdict-reasoning" open={showReasoning} onToggle={e => setShowReasoning(e.target.open)}>
                      <summary>{showReasoning ? "Hide reasoning" : "Show reasoning"}</summary>
                      <p className="advisor-verdict-reason">{result.reason}</p>
                    </details>
                  </section>
                );
              })()}

              {evidence.length > 0 && (
                <section className="advisor-section">
                  <div className="advisor-section-title">
                    <div>
                      <div className="rail-eyebrow">Extracted from news</div>
                      <h2>{evidence.length} key signal{evidence.length !== 1 ? "s" : ""}</h2>
                    </div>
                  </div>
                  <div className="advisor-keypoints">
                    {evidence.map((ev, i) => {
                      const col = pestleColor(ev.pestle);
                      const relPct = Math.round((ev.relevance || 0) * 100);
                      return (
                        <div key={i} className="advisor-keypoint-row">
                          <span className="advisor-kp-pestle advisor-kp-pestle--lg" title={`PESTLE: ${ev.pestle}`} style={pestleTintStyle(col)}>{ev.pestle}</span>
                          <span className="advisor-kp-text" title={ev.sentence}>{ev.sentence}</span>
                          <div className="advisor-kp-rel-block"
                            role="progressbar"
                            aria-valuenow={relPct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Relevance ${relPct}%`}>
                            <div className="advisor-kp-rel-bar">
                              <div className="advisor-kp-rel-fill" style={{ width: `${relPct}%` }} />
                            </div>
                            <span className="advisor-kp-rel num">{relPct}%</span>
                          </div>
                          {ev.sentiment_label && (
                            <span className="advisor-kp-sent advisor-kp-sent--badge">{ev.sentiment_label}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="advisor-section">
                <div className="advisor-section-title">
                  <div>
                    <div className="rail-eyebrow">Matched roadmap items</div>
                    <h2><span className="num">{itemEntries.length}</span> reviewed item{itemEntries.length === 1 ? "" : "s"}</h2>
                  </div>
                  <button className="btn btn-sm" onClick={() => setSelected(new Set(itemEntries.map(i => i.item_id)))}>
                    Select all
                  </button>
                </div>

                {expertsActive.length > 0 && (
                  <div className="advisor-match-filters advisor-expert-filters" role="tablist" aria-label="Filter by expert">
                    <button
                      role="tab"
                      aria-selected={expertFilter === "all"}
                      className={`advisor-match-filter ${expertFilter === "all" ? "on" : ""}`}
                      onClick={() => setExpertFilter("all")}
                      title="Show all experts"
                    >
                      <Icon name="filter" size={11} />
                      <span>All experts</span>
                      <span className="advisor-match-filter-count num">{expertsActive.length}</span>
                    </button>
                    {expertsActive.map(role => {
                      const col = pestleColor(role);
                      const isOn = expertFilter === role;
                      return (
                        <button
                          key={role}
                          role="tab"
                          aria-selected={isOn}
                          className={`advisor-match-filter ${isOn ? "on" : ""}`}
                          onClick={() => setExpertFilter(isOn ? "all" : role)}
                          title={`Show only ${role} expert`}
                          style={isOn ? pestleTintStyle(col) : undefined}
                        >
                          <span>{role}</span>
                          <span className="advisor-match-filter-count num">{expertCounts[role] || 0}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="advisor-match-filters" role="tablist" aria-label="Filter by action">
                  {[
                    { key: "all",      label: "All" },
                    { key: "revise",   label: "Revise" },
                    { key: "adjust",   label: "Adjust" },
                    { key: "maintain", label: "Maintain" },
                  ].map(f => (
                    <button
                      key={f.key}
                      role="tab"
                      aria-selected={actionFilter === f.key}
                      className={`advisor-match-filter tone-${f.key} ${actionFilter === f.key ? "on" : ""}`}
                      onClick={(e) => filterPillSelect(f.key, e)}
                      title={`${f.label} — Shift+click to bulk-select`}
                      disabled={f.key !== "all" && (actionCounts[f.key] || 0) === 0}
                    >
                      {f.key !== "all" && <Icon name={actionIcon(f.key)} size={11} />}
                      <span>{f.label}</span>
                      <span className="advisor-match-filter-count num">{actionCounts[f.key] || 0}</span>
                    </button>
                  ))}
                </div>

                <div className="advisor-match-grid">
                  {filteredEntries.map(item => {
                    // Worst-action drives card tone (Revise > Adjust > Maintain).
                    const tones = new Set((item.advices || []).map(a => actionTone(a.action)));
                    const tone = tones.has("revise") ? "revise" : tones.has("adjust") ? "adjust" : "maintain";
                    const isSel = selected.has(item.item_id);
                    return (
                      <article
                        key={item.item_id}
                        className={`advisor-card advisor-card--v2 advisor-card--clickable tone-${tone} ${isSel ? "selected" : ""}`}
                        onClick={(e) => {
                          const t = e.target;
                          if (t.closest("summary") || t.closest("a") || t.closest("button")) return;
                          toggleSelected(item.item_id);
                        }}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSel}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSelected(item.item_id); } }}
                      >
                        <button
                          className={`chip-check ${isSel ? "on" : ""}`}
                          aria-label={isSel ? `Deselect ${item.item_name}` : `Select ${item.item_name}`}
                          onClick={(e) => { e.stopPropagation(); toggleSelected(item.item_id); }}
                        >
                          {isSel && <Icon name="check" size={10} />}
                        </button>
                        <div className="advisor-card-body">
                          <div className="advisor-card-head">
                            <h3 title={item.item_name}>{item.item_name}</h3>
                            <span className={`advisor-action-tag ${tone}`} title={`Worst action: ${actionLabel(tone)}`}>
                              <Icon name={actionIcon(tone)} size={11} />
                              <span>{actionLabel(tone)}</span>
                            </span>
                          </div>
                          <div className="advisor-meta">
                            <b>{item.layer}</b>
                            <span>{(item.time_bands || []).join(" / ") || "Current band"}</span>
                          </div>
                          <div className="advisor-driver-row">
                            {(item.matched_drivers || []).map(driver => {
                              const col = pestleColor(driver);
                              return (
                                <em key={driver} className="advisor-driver-pill" title={`PESTLE: ${driver}`} style={pestleTintStyle(col)}>{driver}</em>
                              );
                            })}
                          </div>

                          {/* Stacked advice cards — one per expert who weighed in */}
                          <div className="advisor-expert-stack">
                            {item.advices.map((a, idx) => {
                              const aTone = actionTone(a.action);
                              const col = pestleColor(a.role);
                              return (
                                <div key={`${a.role}-${idx}`} className={`advisor-expert-advice tone-${aTone}`} style={{
                                  borderLeft: `3px solid ${col}`,
                                }}>
                                  <div className="advisor-expert-advice-head">
                                    <span className="advisor-expert-role" style={pestleTintStyle(col)}>{a.role} expert</span>
                                  </div>
                                  <p className="advisor-expert-advice-text">{a.advice}</p>
                                  {a.evidence_keypoint && a.evidence_keypoint.sentence && (
                                    <details className="advisor-labelled--collapse" onClick={(e) => e.stopPropagation()}>
                                      <summary>Evidence cited{a.evidence_keypoint.id ? ` · ${a.evidence_keypoint.id}` : ""}</summary>
                                      <p>{evidenceSnippet(a.evidence_keypoint.sentence)}</p>
                                    </details>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {filteredEntries.length === 0 && itemEntries.length > 0 && (
                    <div className="advisor-filter-empty">
                      No items match current filters
                      {actionFilter !== "all" && <> · action: <strong>{actionFilter}</strong></>}
                      {expertFilter !== "all" && <> · expert: <strong>{expertFilter}</strong></>}
                      .
                    </div>
                  )}
                  {itemEntries.length === 0 && (
                    <div className="advisor-filter-empty">No matched roadmap items in this analysis.</div>
                  )}
                </div>
              </section>

              {guidance.summary && (
                <div className="advisor-summary-note">
                  <p>{guidance.summary}</p>
                  <p className="advisor-provider">Advisor: {guidance.llm_provider || "deterministic"}{guidance.llm_model ? ` (${guidance.llm_model})` : ""}</p>
                </div>
              )}

              {selectedCount > 0 && (
                <div className="advisor-apply-bar">
                  <span className="advisor-apply-count"><span className="num">{selectedCount}</span> item{selectedCount === 1 ? "" : "s"} selected</span>
                  <div className="spacer" />
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Deselect all</button>
                  <button className="btn btn-accent" onClick={applySelected}>
                    <Icon name="check" size={14} /> Add {selectedCount} advice note{selectedCount === 1 ? "" : "s"} →
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { ImpactAdvisor });
