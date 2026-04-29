/* global React, Icon */

const ADVISOR_API_KEY = "ddrm_advisor_api_url";
const DEFAULT_ADVISOR_API = "http://127.0.0.1:7875/api/recommend";

function verdictTone(verdict) {
  if (verdict === "Revise") return "revise";
  if (verdict === "Adjust") return "adjust";
  return "maintain";
}

function evidenceSnippet(text) {
  if (!text) return "";
  return text.length > 220 ? text.slice(0, 220).trim() + "..." : text;
}

function ImpactAdvisor({ open, onClose, state, onApplyGuidance }) {
  const [apiUrl, setApiUrl] = React.useState(() => localStorage.getItem(ADVISOR_API_KEY) || DEFAULT_ADVISOR_API);
  const [inputMode, setInputMode] = React.useState("Text");
  const [newsText, setNewsText] = React.useState("");
  const [maxPoints, setMaxPoints] = React.useState(5);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState(null);
  const [selected, setSelected] = React.useState(new Set());

  React.useEffect(() => {
    localStorage.setItem(ADVISOR_API_KEY, apiUrl);
  }, [apiUrl]);

  React.useEffect(() => {
    if (!open) return;
    setError("");
  }, [open]);

  if (!open) return null;

  const guidance = result?.guidance || {};
  const itemGuidance = guidance.item_guidance || [];
  const matches = result?.roadmap_matches || [];
  const selectedCount = selected.size;

  const runAdvisor = async () => {
    if (!newsText.trim()) {
      setError("Add news URL or article text first.");
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
          input_mode: inputMode,
          max_points: maxPoints,
          roadmap: state
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setResult(data.result);
      const ids = new Set((data.result.guidance?.item_guidance || []).map(i => i.item_id));
      setSelected(ids);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applySelected = () => {
    const picked = itemGuidance.filter(item => selected.has(item.item_id));
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
        <div className="advisor-steps">
          <span className="done">Roadmap</span>
          <span className={result ? "done" : busy ? "active" : ""}>Impact</span>
          <span className={itemGuidance.length ? "done" : ""}>Advice</span>
          <span className={selectedCount ? "active" : ""}>Apply</span>
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
            <label className="field-label">API endpoint</label>
            <input className="field-input mono" value={apiUrl} onChange={e => setApiUrl(e.target.value)} />
            <div className="field-help">Run `python src/api/roadmap_api.py` before using this panel.</div>
          </div>

          <div className="field">
            <label className="field-label">Input type</label>
            <div className="segmented">
              {["Text", "URL"].map(mode => (
                <button key={mode} className={inputMode === mode ? "on" : ""} onClick={() => setInputMode(mode)}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label">{inputMode === "URL" ? "News URL" : "Article text"}</label>
            <textarea
              className="field-textarea advisor-news"
              placeholder={inputMode === "URL" ? "https://..." : "Paste upcoming news or policy update here."}
              value={newsText}
              onChange={e => setNewsText(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label">Evidence points</label>
            <input
              className="field-input"
              type="number"
              min="3"
              max="10"
              value={maxPoints}
              onChange={e => setMaxPoints(Number(e.target.value || 5))}
            />
          </div>

          {error && <div className="advisor-error">{error}</div>}

          <button className="btn btn-accent btn-lg advisor-run" onClick={runAdvisor} disabled={busy}>
            <Icon name="wand" size={15} /> {busy ? "Assessing..." : "Assess impact"}
          </button>
        </aside>

        <main className="advisor-results">
          {!result && (
            <div className="advisor-empty">
              <Icon name="search" size={22} />
              <h2>Roadmap-aware impact review</h2>
              <p>Current roadmap is already attached. Add news, run impact, then review matched roadmap items and LLM advice in one place.</p>
            </div>
          )}

          {result && (
            <>
              <section className={`advisor-verdict ${verdictTone(result.verdict)}`}>
                <div>
                  <div className="rail-eyebrow">DDRM verdict</div>
                  <h1>{result.verdict}</h1>
                  <p>{result.reason}</p>
                </div>
                <div className="advisor-score">
                  <span>{Number(result.severity || 0).toFixed(2)}</span>
                  <small>severity</small>
                </div>
              </section>

              <section className="advisor-section">
                <div className="advisor-section-title">
                  <div>
                    <div className="rail-eyebrow">Matched roadmap items</div>
                    <h2>{matches.length} related items</h2>
                  </div>
                  <button className="btn btn-sm" onClick={() => setSelected(new Set(itemGuidance.map(i => i.item_id)))}>
                    Select all
                  </button>
                </div>

                <div className="advisor-match-grid">
                  {itemGuidance.map(item => (
                    <article key={item.item_id} className={`advisor-card ${selected.has(item.item_id) ? "selected" : ""}`}>
                      <button className={`chip-check ${selected.has(item.item_id) ? "on" : ""}`} onClick={() => toggleSelected(item.item_id)}>
                        {selected.has(item.item_id) && <Icon name="check" size={10} />}
                      </button>
                      <div className="advisor-card-body">
                        <div className="advisor-card-head">
                          <h3>{item.item_name}</h3>
                          <span>{item.action}</span>
                        </div>
                        <div className="advisor-meta">
                          <b>{item.layer}</b>
                          <span>{(item.time_bands || []).join(" / ") || "Current band"}</span>
                        </div>
                        <div className="advisor-driver-row">
                          {(item.matched_drivers || []).map(driver => <em key={driver}>{driver}</em>)}
                        </div>
                        <div className="advisor-labelled">
                          <label>Why matched</label>
                          <p>{item.reason}</p>
                        </div>
                        <div className="advisor-labelled advice">
                          <label>LLM advice</label>
                          <p>{item.suggested_change}</p>
                        </div>
                        <div className="advisor-labelled">
                          <label>Evidence used</label>
                          <p>{evidenceSnippet(item.evidence_basis)}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="advisor-section compact">
                <div>
                  <div className="rail-eyebrow">Advisor summary</div>
                  <p>{guidance.summary}</p>
                  <p className="advisor-provider">Advisor: {guidance.llm_provider || "deterministic"}{guidance.llm_model ? ` (${guidance.llm_model})` : ""}</p>
                </div>
                <button className="btn btn-accent" onClick={applySelected} disabled={!selectedCount}>
                  <Icon name="check" size={14} /> Add {selectedCount || 0} advice note{selectedCount === 1 ? "" : "s"}
                </button>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

Object.assign(window, { ImpactAdvisor });
