/* global React, Icon, mix */

// ─── Coach Rail ──────────────────────────────────────────────
// Left rail on the Roadmap page: setup checklist, next step, roadmap health and coverage by layer.


function CoachRail({ state, exported, onJump, onClose, onReview, onShowGlossary }) {
  const { items, categories: cats, bands } = state;
  const covered = (c, b) => items.some(i => i.catId === c.id && i.bands.includes(b.id));
  const emptyLayers = cats.filter(c => !items.some(i => i.catId === c.id)).length;
  const steps = [
    ["name", "type", "Name your roadmap", "A clear title helps others find and trust it.", !!state.title && state.title !== "Untitled Roadmap"],
    ["structure", "rows", "Confirm layers & time bands", `${cats.length} layer${cats.length === 1 ? "" : "s"} × ${bands.length} band${bands.length === 1 ? "" : "s"}. Change them in Structure.`, cats.length >= 2 && bands.length >= 2],
    ["first-item", "plus", "Add your first item", "Use Add item, or hover any cell and click Add.", items.length > 0],
    ["all-layers", "flag", "Cover every layer", "Each layer should hold at least one item.", cats.length > 0 && !emptyLayers],
    ["span", "span", "Try a multi-band item", "Choose a start and an end band; the bar widens to match.", items.some(i => i.bands.length > 1)],
    ["tag", "tag", "Tag with PESTLE", "Optional. Shows what kind of force each item is.", items.some(i => (i.pestle || []).length > 0)],
    ["export", "share", "Export or share", "Download JSON, print to PDF, or copy as text.", !!exported]
  ];
  const done = steps.filter(s => s[4]).length;
  const next = steps.find(s => !s[4]);
  const cells = cats.length * bands.length;
  const cov = cats.reduce((n, c) => n + bands.filter(b => covered(c, b)).length, 0);
  const review = items.filter(i => i.reviewNeeded).length;
  const multi = items.filter(i => i.bands.length > 1).length;
  const untagged = items.filter(i => !(i.pestle || []).length).length;

  return (
    <aside className="coach" aria-label="Roadmap coach">
      <div className="c-sec">
        <div className="c-head">
          <div className="c-title"><span className="c-icon"><Icon name="compass" size={15} /></span>Roadmap coach</div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Hide coach" title="Hide coach"><Icon name="chevron-left" size={14} /></button>
        </div>
        <div className="prog">
          <div className="prog-row"><span>Setup progress</span><b>{done} of {steps.length}</b></div>
          <div className="pbar">{steps.map(s => <i key={s[0]} className={s[4] ? "on" : ""} />)}</div>
        </div>
        {next && <div className="next">
          <div className="next-top">
            <span className="c-icon"><Icon name={next[1]} size={14} /></span>
            <div><span className="eyebrow" style={{ color: "var(--accent-ink)" }}>Next step</span><b>{next[2]}</b><p>{next[3]}</p></div>
          </div>
          <button className="btn btn-sm btn-accent" style={{ alignSelf: "flex-start" }} onClick={() => onJump(next[0])}>
            {next[0] === "export" ? <><Icon name="download" size={12} />Export roadmap</> : "Show me"}
          </button>
        </div>}
      </div>
      <div className="c-sec">
        <span className="eyebrow">Checklist</span>
        <ul className="steps">{steps.map(([id, icon, title, help, ok]) => {
          const st = ok ? "done" : next && next[0] === id ? "cur" : "";
          return <li key={id} className={st}>
            <button type="button" onClick={() => onJump(id)}>
              <span className="sdot"><Icon name={ok ? "check" : icon} size={11} /></span>
              <span><b>{title}</b>{!ok && <small>{help}</small>}</span>
            </button>
          </li>;
        })}</ul>
      </div>
      <div className="c-sec">
        <span className="eyebrow">Roadmap health</span>
        <div>
          <div className={`hrow ${review ? "warn" : ""}`}><Icon name="alert-triangle" size={14} /><span><b>{review}</b> item{review === 1 ? " has" : "s have"} advisor advice</span>{review > 0 && <button onClick={onReview}>Review</button>}</div>
          <div className="hrow"><Icon name="grid" size={14} /><span>Grid coverage</span><b>{cells ? Math.round(cov / cells * 100) : 0}%</b></div>
          <div className={`hrow ${emptyLayers ? "warn" : ""}`}><Icon name="rows" size={14} /><span>Layers with items</span><b>{cats.length - emptyLayers}/{cats.length}</b></div>
          <div className="hrow"><Icon name="span" size={14} /><span>Multi-band items</span><b>{multi}</b></div>
          <div className="hrow"><Icon name="tag" size={14} /><span>Untagged items</span><b>{untagged}</b></div>
        </div>
      </div>
      <div className="c-sec">
        <span className="eyebrow">Coverage by layer</span>
        <div className="cov" style={{ "--n": bands.length }}>
          <span />{bands.map((b, i) => <span key={b.id} className="ch" title={b.label}>{i + 1}</span>)}
          {cats.map(c => <React.Fragment key={c.id}>
            <span title={c.label}>{c.label}</span>
            {bands.map(b => <i key={b.id} className={covered(c, b) ? "on" : ""} style={{ "--c-cov": mix(c.color, 55) }} title={`${c.label} · ${b.label}${covered(c, b) ? "" : ": empty"}`} />)}
          </React.Fragment>)}
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Columns 1–{bands.length} follow the time bands left to right. Empty squares are gaps.</span>
      </div>
      <div className="c-sec"><button className="c-link" onClick={onShowGlossary}><Icon name="book" size={13} />Read the glossary</button></div>
    </aside>
  );
}

Object.assign(window, { CoachRail });
