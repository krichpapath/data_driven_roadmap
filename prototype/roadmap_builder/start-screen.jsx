/* global React, Icon, TEMPLATES */
// ─── Start Screen ────────────────────────────────────────────
// Three entry points: pick template, blank, import JSON.
// Hero side teaches the DDRM concept with a visual mini-grid.

function StartScreen({ onStart, onImport }) {
  const [hover, setHover] = React.useState(null);

  return (
    <div className="start-shell">
      <div className="start-topbar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div className="brand-name">DDRM Builder<em>beta</em></div>
        </div>
        <div className="row" style={{ gap: 6, fontSize: 12.5, color: "var(--ink-muted)" }}>
          <a className="btn btn-ghost btn-sm" href="#docs">Docs</a>
          <a className="btn btn-ghost btn-sm" href="#examples">Examples</a>
        </div>
      </div>

      <div className="start-main">
        <div className="start-card">
          {/* HERO — teaches the concept */}
          <div className="start-hero">
            <div>
              <span className="start-eyebrow">Data-Driven Roadmaps · for everyone</span>
              <h1 className="start-title">
                Start a roadmap<br/>
                without the <em>jargon</em>.
              </h1>
              <p className="start-lede">
                A DDRM is a single picture of <b>what's coming</b>, <b>what we'll build</b>, and <b>when</b> — organised in layers across time. Pick a starting point on the right and we'll explain each step as you go.
              </p>

              <div className="start-bullets">
                <div className="start-bullet">
                  <div className="start-bullet-dot">1</div>
                  <div><b>Layers</b> are rows. They go from <i>why</i> (drivers) at the top to <i>how</i> (resources) at the bottom.</div>
                </div>
                <div className="start-bullet">
                  <div className="start-bullet-dot">2</div>
                  <div><b>Time bands</b> are columns. Now &middot; Next &middot; Later — or pick years.</div>
                </div>
                <div className="start-bullet">
                  <div className="start-bullet-dot">3</div>
                  <div><b>Items</b> live in cells. An item can span multiple bands if it stretches across time.</div>
                </div>
              </div>
            </div>

            {/* Mini visual */}
            <div className="start-diagram" aria-hidden="true">
              <div className="sd-cell sd-head"></div>
              <div className="sd-cell sd-head" style={{textAlign:"center"}}>Now</div>
              <div className="sd-cell sd-head" style={{textAlign:"center"}}>Next</div>
              <div className="sd-cell sd-head" style={{textAlign:"center"}}>Later</div>

              <div className="sd-cell sd-row-label" style={{borderLeft: "3px solid var(--c-blue)", paddingLeft: 6}}>Drivers</div>
              <div className="sd-cell"><div className="sd-chip" style={{borderColor:"var(--c-blue)", color:"var(--c-blue)"}}>GenAI growth</div></div>
              <div className="sd-cell"><div className="sd-chip" style={{borderColor:"var(--c-blue)", color:"var(--c-blue)"}}>Geopolitics</div></div>
              <div className="sd-cell"></div>

              <div className="sd-cell sd-row-label" style={{borderLeft: "3px solid var(--c-violet)", paddingLeft: 6}}>Products</div>
              <div className="sd-cell"></div>
              <div className="sd-cell" style={{gridColumn: "3 / span 2"}}>
                <div className="sd-chip" style={{borderColor:"var(--c-violet)", color:"var(--c-violet)", textAlign:"center"}}>↔ ASEAN platform</div>
              </div>

              <div className="sd-cell sd-row-label" style={{borderLeft: "3px solid var(--c-amber)", paddingLeft: 6}}>R&amp;D</div>
              <div className="sd-cell" style={{gridColumn: "2 / span 3"}}>
                <div className="sd-chip" style={{borderColor:"var(--c-amber)", color:"var(--c-amber)", textAlign:"center"}}>↔ Digital Twins programme</div>
              </div>
            </div>
          </div>

          {/* OPTIONS */}
          <div className="start-options">
            <div className="start-options-title">Start a roadmap</div>

            <button
              className="start-option featured"
              onMouseEnter={() => setHover("template")}
              onMouseLeave={() => setHover(null)}
              onClick={() => onStart("templates")}
            >
              <div className="start-option-icon"><Icon name="grid" size={20} /></div>
              <div>
                <div className="start-option-title">Pick a template</div>
                <div className="start-option-sub">Industrial Digital, SaaS Product, Research Programme — pre-filled and editable.</div>
              </div>
              <Icon name="arrow-right" size={18} className="start-option-arrow" />
            </button>

            <button
              className="start-option"
              onClick={() => onStart("blank")}
            >
              <div className="start-option-icon"><Icon name="blank" size={20} /></div>
              <div>
                <div className="start-option-title">Blank canvas</div>
                <div className="start-option-sub">3 layers × 3 time bands. Rename and add as you go.</div>
              </div>
              <Icon name="arrow-right" size={18} className="start-option-arrow" />
            </button>

            <button
              className="start-option"
              onClick={onImport}
            >
              <div className="start-option-icon"><Icon name="import" size={20} /></div>
              <div>
                <div className="start-option-title">Import existing JSON</div>
                <div className="start-option-sub">Bring in a roadmap you've exported before.</div>
              </div>
              <Icon name="arrow-right" size={18} className="start-option-arrow" />
            </button>

            <div style={{ marginTop: 12, padding: "12px 14px", border: "1px dashed var(--line-strong)", borderRadius: "var(--r-md)", fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.55 }}>
              <b style={{ color: "var(--ink-2)" }}>New to DDRM?</b> The <b>Industrial Digital</b> template is pre-loaded with the structure from a real digital-industry review document — open it, look around, then adapt it to your own context.
            </div>
          </div>
        </div>
      </div>

      <div className="start-footer">
        <span>DDRM Builder · designed for non-developers</span>
        <span className="row" style={{ gap: 8 }}>
          <span><span className="kbd">⌘</span> <span className="kbd">K</span> · keyboard help</span>
        </span>
      </div>
    </div>
  );
}

// ─── Template Picker Modal ────────────────────────────────────
function TemplateThumb({ tpl }) {
  const cells = [];
  for (let r = 0; r < 3; r++) {
    cells.push(<div key={`l${r}`} className="tpl-thumb-cell label" style={{ borderLeft: `3px solid ${tpl.categories[r % tpl.categories.length]?.color || "var(--line)"}` }} />);
    for (let c = 0; c < 3; c++) {
      const filled = (r + c) % 2 === 0 || tpl.id === "industrial-digital";
      const cat = tpl.categories[r % tpl.categories.length];
      cells.push(
        <div key={`c${r}${c}`} className="tpl-thumb-cell">
          {filled && (
            <div style={{
              height: 6, marginTop: 4, marginLeft: 3, marginRight: 3,
              background: cat?.color || "var(--c-slate)",
              opacity: 0.7,
              borderRadius: 2
            }} />
          )}
          {filled && (r + c) % 3 === 0 && (
            <div style={{
              height: 6, marginTop: 3, marginLeft: 3, marginRight: 3,
              background: cat?.color || "var(--c-slate)",
              opacity: 0.4,
              borderRadius: 2
            }} />
          )}
        </div>
      );
    }
  }
  return <div className="tpl-thumb">{cells}</div>;
}

function TemplatePicker({ open, onClose, onPick }) {
  const [selected, setSelected] = React.useState("industrial-digital");
  if (!open) return null;
  const tpl = TEMPLATES.find(t => t.id === selected);

  return (
    <div className={`backdrop on`} onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Start a roadmap from a template</div>
            <div className="modal-sub">Templates ship with sensible layers and time bands. Everything is editable once you open it.</div>
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className="modal-body">
          <div className="tpl-grid">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                className={`tpl-card ${selected === t.id ? "selected" : ""}`}
                onClick={() => setSelected(t.id)}
              >
                <TemplateThumb tpl={t} />
                <div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="tpl-name">{t.name}</span>
                    {t.id === "industrial-digital" && <span className="tpl-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>Recommended</span>}
                  </div>
                  <div className="tpl-meta" style={{ marginTop: 4 }}>{t.tagline}</div>
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    <span className="tpl-tag">{t.layers} layers</span>
                    <span className="tpl-tag">{t.bands} bands</span>
                    {t.items.length > 0 && <span className="tpl-tag">{t.items.length} items pre-filled</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Preview detail */}
          <div style={{
            marginTop: 6,
            padding: 14,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            fontSize: 12.5,
            color: "var(--ink-2)",
            lineHeight: 1.55
          }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <Icon name="info" size={14} />
              <b>What you'll get with "{tpl.name}"</b>
            </div>
            <div>
              <b>Layers:</b> {tpl.categories.map(c => c.label).join(" · ")}<br/>
              <b>Time bands:</b> {tpl.bands_data.map(b => b.label).join(" · ")}<br/>
              {tpl.items.length > 0 && <><b>{tpl.items.length} pre-filled items</b> drawn from a real digital-industry review you can edit, delete or build on.</>}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={() => onPick(selected)}>
            Use this template <Icon name="arrow-right" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { StartScreen, TemplatePicker });
