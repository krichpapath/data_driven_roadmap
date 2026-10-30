/* global React, Icon, Check, Select, CoachRail, PESTLE */
// ─── Roadmap page ──────────────────────────────────────────
// Layers (rows) × time bands (columns). Each item is one bar covering its bands; bars that overlap
// in a layer are stacked into lanes so nothing hides behind anything else.

// Mix `color` with white at the given percentage. Returns a CSS color-mix()
// expression that browsers resolve at paint time — works with var(--…) and oklch().
function mix(color, pct) {
  return `color-mix(in oklch, ${color} ${pct}%, white)`;
}

const VERDICT_COLOR = { maintain: "var(--c-green)", adjust: "var(--c-amber)", revise: "var(--c-red)" };
const verdictKey = item => item.reviewNeeded ? (item.lastImpactVerdict || "review").toLowerCase() : "";

// First and last band index an item covers, or null when none of its bands exist any more.
function bandRange(item, bands) {
  const xs = item.bands.map(b => bands.findIndex(x => x.id === b)).filter(x => x >= 0);
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

// Index of the band whose "YYYY – YYYY" label contains this year, or -1.
function currentBand(bands) {
  const y = new Date().getFullYear();
  return bands.findIndex(b => { const m = /(\d{4})\s*[–-]\s*(\d{4})/.exec(b.label); return m && y >= +m[1] && y <= +m[2]; });
}

// Earliest items first, longer before shorter; each takes the first lane where it overlaps nothing.
function packLanes(items, bands) {
  const lanes = [];
  return items.map(it => ({ it, r: bandRange(it, bands) })).filter(x => x.r)
    .sort((a, b) => a.r[0] - b.r[0] || (b.r[1] - b.r[0]) - (a.r[1] - a.r[0]))
    .map(({ it, r: [s, e] }) => {
      let lane = lanes.findIndex(l => l.every(([a, b]) => e < a || s > b));
      if (lane < 0) { lane = lanes.length; lanes.push([]); }
      lanes[lane].push([s, e]);
      return { it, s, e, lane };
    });
}

function BoardRow({ cat, items, bands, cur, colorOf, matches, selected, onToggleSelect, onSelectMany, drag, setDrag, onDrop, onAddItem, onEditItem }) {
  const [over, setOver] = React.useState(null);
  const placed = packLanes(items, bands);
  const lanes = Math.max(1, ...placed.map(p => p.lane + 1));
  const nSel = items.filter(i => selected.has(i.id)).length, review = items.filter(i => i.reviewNeeded).length;
  return <div className="rrow" style={{ gridTemplateRows: `repeat(${lanes}, auto) 30px` }}>
    <div className="rl" style={{ gridRow: "1 / -1" }}>
      {items.length ? <Check state={nSel === 0 ? "" : nSel === items.length ? "on" : "mixed"} label={`Select all items in ${cat.label}`}
        onClick={() => onSelectMany(items.map(i => i.id), nSel !== items.length)} /> : <span />}
      <div className="rl-name"><span className="sw" style={{ background: cat.color }} />{cat.label}</div>
      {cat.sub && <div className="rl-sub" title={cat.help || undefined}>{cat.sub}</div>}
      <div className="rl-meta"><span>{items.length} item{items.length === 1 ? "" : "s"}</span>{review > 0 && <><span>·</span><span className="rv">{review} to review</span></>}</div>
    </div>
    {bands.map((b, i) => <div key={b.id} className={`cell ${i === 0 ? "first" : ""} ${i === cur ? "now-col" : ""} ${over === i ? "over" : ""}`} style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
      onDragOver={e => { if (drag) { e.preventDefault(); setOver(i); } }} onDragLeave={() => setOver(o => o === i ? null : o)}
      onDrop={e => { e.preventDefault(); setOver(null); onDrop(cat.id, i); }}>
      <button type="button" className="add" aria-label={`Add item to ${cat.label}, ${b.label}`} onClick={() => onAddItem(cat.id, b.id)}><Icon name="plus" size={11} />Add</button>
    </div>)}
    {placed.map(({ it, s, e, lane }) => {
      const c = colorOf(it, cat), on = selected.has(it.id), v = verdictKey(it);
      return <div key={it.id} className={`item ${matches(it) ? "" : "dim"} ${on ? "sel" : ""} ${drag === it.id ? "drag" : ""}`} draggable
        style={{ gridColumn: `${s + 2} / ${e + 3}`, gridRow: lane + 1, pointerEvents: drag && drag !== it.id ? "none" : undefined, background: c ? mix(c, 7) : "var(--surface)", borderColor: c ? mix(c, 28) : "var(--border)" }}
        title={it.description ? `${it.name}\n${it.description}` : it.name}
        onDragStart={ev => { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", it.id); const id = it.id; setTimeout(() => setDrag(id), 0); }}
        onDragEnd={() => setDrag(null)}
        onClick={ev => { if (ev.shiftKey || ev.metaKey || ev.ctrlKey || selected.size) onToggleSelect(it.id); else onEditItem(it.id); }}>
        <Check state={on ? "on" : ""} label={`Select ${it.name}`} onClick={() => onToggleSelect(it.id)} />
        {/* A real button so keyboard and screen-reader users can open the item; its click bubbles to the bar. */}
        <button type="button" className="item-name" aria-label={`Edit ${it.name}${v ? `, ${it.lastImpactVerdict || "review"} advice to review` : ""}`}>{it.name}</button>
        {(it.notes || it.advice) && !v && <span className="note-ic" title="Has notes"><Icon name="edit" size={11} /></span>}
        {(it.pestle || []).length > 0 && <span className="pt">{it.pestle.map(k => { const p = PESTLE.find(x => x.key === k); return p && <span key={k} title={p.label} style={{ color: `color-mix(in oklch, ${p.color} 80%, var(--ink))` }}>{k}</span>; })}</span>}
        {v && <span className={`st ${v}`} title="News Impact added Advisor Expert advice. Open the item to review it, or tick it and choose Mark reviewed.">{it.lastImpactVerdict || "Review"}</span>}
      </div>;
    })}
  </div>;
}

function RoadmapPage({ state, setState, selected, setSelected, showCoach, setShowCoach, exported, onJump, onShowGlossary, onImport, onExport, onPrint, onCopyText,
  onStructure, undo, canUndo, onAddItem, onEditItem, onMoveItem, onDeleteSelected, onExportSelected, showToast }) {
  const [q, setQ] = React.useState(""), [pf, setPf] = React.useState([]), [view, setView] = React.useState("all"), [mode, setMode] = React.useState("layer");
  const [menu, setMenu] = React.useState(null), [drag, setDrag] = React.useState(null);
  const { items, categories: cats, bands } = state;
  React.useEffect(() => {
    if (!menu) return;
    const close = e => { if (!e.target.closest?.(".menu-wrap")) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const review = items.filter(i => i.reviewNeeded).length;
  const matches = it => (view === "all" || it.reviewNeeded) && (!pf.length || (it.pestle || []).some(k => pf.includes(k))) && it.name.toLowerCase().includes(q.trim().toLowerCase());
  const filtering = q.trim() || pf.length || view !== "all";
  const colorOf = (it, cat) => mode === "layer" ? cat.color : mode === "pestle" ? (PESTLE.find(p => p.key === (it.pestle || [])[0])?.color || null) : (VERDICT_COLOR[verdictKey(it)] || null);
  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleMany = (ids, on) => setSelected(s => { const n = new Set(s); ids.forEach(id => on ? n.add(id) : n.delete(id)); return n; });
  const nSel = selected.size, count = n => `${n} item${n === 1 ? "" : "s"}`;
  const range = (s, e) => s === e ? bands[s].label : `${bands[s].label} – ${bands[e].label}`;
  const bulk = (fn, msg) => { setState(st => ({ ...st, items: st.items.map(i => selected.has(i.id) ? fn(i) : i) })); setSelected(new Set()); setMenu(null); showToast(msg, { action: { label: "Undo", onClick: undo } }); };
  const selReview = items.filter(i => selected.has(i.id) && i.reviewNeeded).length;
  const onDrop = (catId, bi) => {
    const it = items.find(i => i.id === drag); setDrag(null);
    const r = it && bandRange(it, bands);
    if (!r) return;
    const len = r[1] - r[0] + 1, start = Math.min(bi, bands.length - len), nb = bands.slice(start, start + len).map(b => b.id);
    if (it.catId === catId && nb.join() === it.bands.join()) return;
    onMoveItem(it.id, catId, nb);
  };
  const cur = currentBand(bands);
  const ranges = []; bands.forEach((_, s) => bands.forEach((_, e) => { if (e >= s) ranges.push([s, e]); }));
  const legend = mode === "pestle" ? PESTLE.filter(p => items.some(i => (i.pestle || [])[0] === p.key)).map(p => [p.label, p.color])
    : mode === "advice" ? [["Maintain", VERDICT_COLOR.maintain], ["Adjust", VERDICT_COLOR.adjust], ["Revise", VERDICT_COLOR.revise], ["No advice", null]] : null;

  return <div className="rmp pg" id="main" role="main" tabIndex={-1}>
    {showCoach && <CoachRail state={state} exported={exported} onJump={onJump} onClose={() => setShowCoach(false)} onReview={() => setView("review")} onShowGlossary={onShowGlossary} />}
    <div className="main">
      <div className="page">
        <div className="head">
          <div>
            <div className="eyebrow">Technology roadmap</div>
            <h1 className="visually-hidden">{state.title}</h1>
            <textarea id="roadmap-title" className="title-input" rows={1} aria-label="Roadmap title" value={state.title} placeholder="Untitled Roadmap"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
              onChange={e => setState(s => ({ ...s, title: e.target.value.replace(/\s*\n\s*/g, " ") }))} />
            <div className="meta"><span><b>{cats.length}</b> {cats.length === 1 ? "layer" : "layers"}</span><span><b>{bands.length}</b> {bands.length === 1 ? "time band" : "time bands"}</span><span><b>{items.length}</b> {items.length === 1 ? "item" : "items"}</span>
              {state.templateId === "industrial-digital" && <span>Based on the Digital Industry review</span>}</div>
          </div>
          <div className="actions">
            {!showCoach && <button className="btn" onClick={() => setShowCoach(true)}><Icon name="compass" size={14} />Coach</button>}
            <button className="btn" onClick={onShowGlossary}><Icon name="book" size={14} />Glossary</button>
            <div className="group">
              <button className="btn" onClick={onImport} title="Import roadmap JSON as a new roadmap"><Icon name="upload" size={14} />Import</button>
              <div className="menu-wrap">
                <button className="btn" aria-expanded={menu === "export"} onClick={() => setMenu(m => m === "export" ? null : "export")}><Icon name="download" size={14} />Export<Icon name="chevron-down" size={12} /></button>
                {menu === "export" && <div className="menu" role="menu">
                  <button role="menuitem" onClick={() => { setMenu(null); onExport(); }}>Export JSON…<span>Re-import later, share, or include sources</span></button>
                  <button role="menuitem" onClick={() => { setMenu(null); onPrint(); }}>Print or save as PDF<span>Prints the roadmap table only</span></button>
                  <button role="menuitem" onClick={() => { setMenu(null); onCopyText(); }}>Copy as text<span>Layers and items as a list</span></button>
                </div>}
              </div>
            </div>
            <div className="group">
              <button className="btn" onClick={onStructure} title="Edit layers and time bands"><Icon name="grid" size={14} />Structure</button>
              <button className="btn" disabled={!canUndo} onClick={undo} title={canUndo ? "Undo last change (Ctrl+Z)" : "Nothing to undo"}><Icon name="undo" size={14} />Undo</button>
            </div>
            <button className="btn btn-accent" onClick={() => onAddItem()}><Icon name="plus" size={14} />Add item</button>
          </div>
        </div>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Show">
            <button className={view === "all" ? "on" : ""} aria-pressed={view === "all"} onClick={() => setView("all")}>All items<span className="n">{items.length}</span></button>
            <button className={view === "review" ? "on" : ""} aria-pressed={view === "review"} onClick={() => setView("review")}>Needs review<span className="n amber">{review}</span></button>
          </div>
          <label className="search"><Icon name="search" size={13} /><input type="search" aria-label="Search items" placeholder="Search items" value={q} onChange={e => setQ(e.target.value)} /></label>
          <div className="pfs" role="group" aria-label="Filter by PESTLE">{PESTLE.map(p => { const on = pf.includes(p.key); return <button key={p.key} className={`pfb ${on ? "on" : ""}`} aria-pressed={on} title={p.label} style={{ "--pc": p.color }} onClick={() => setPf(f => on ? f.filter(x => x !== p.key) : [...f, p.key])}><i />{p.key}</button>; })}</div>
          {filtering && <button className="btn btn-sm btn-ghost" onClick={() => { setQ(""); setPf([]); setView("all"); }}>Clear filters</button>}
          {review > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set(items.filter(i => i.reviewNeeded).map(i => i.id)))} title="Select the items that received News Impact advice">Select {review} to review</button>}
          <span className="spacer" />
          {legend && <div className="legend">{legend.map(([l, c]) => <span key={l}><i className="sw" style={{ background: c ? mix(c, 60) : "var(--surface-3)" }} />{l}</span>)}</div>}
          <label className="lbl">Colour by<Select aria-label="Colour by" value={mode} onChange={setMode} options={[["layer", "Layer"], ["pestle", "PESTLE"], ["advice", "Advice"]]} /></label>
        </div>
        <p className="visually-hidden">Scroll sideways to see all {bands.length} time bands.</p>
        <div className={`board ${nSel ? "selecting" : ""}`}>
          <div className="rm" style={{ "--label-w": "232px", gridTemplateColumns: `var(--label-w) repeat(${bands.length}, minmax(220px, 1fr))`, minWidth: `calc(var(--label-w) + ${bands.length} * 220px)` }}>
            <div className="th corner"><small>Layer</small></div>
            {bands.map((b, i) => <div key={b.id} className="th" style={{ "--bandc": b.color }}>
              <div className="th-top"><b>{b.label}</b>{i === cur && <span className="now">Current</span>}<span className="cnt">{items.filter(x => x.bands.includes(b.id)).length}</span></div>
              <small>{b.tag || "Time band"}</small>
            </div>)}
            {cats.map(c => <BoardRow key={c.id} cat={c} items={items.filter(i => i.catId === c.id)} bands={bands} cur={cur} colorOf={colorOf} matches={matches}
              selected={selected} onToggleSelect={toggle} onSelectMany={toggleMany} drag={drag} setDrag={setDrag} onDrop={onDrop} onAddItem={onAddItem} onEditItem={onEditItem} />)}
          </div>
        </div>
        <div className="hint">Click an item to edit · tick the checkbox to select · drag to move between layers or bands · <kbd>Ctrl+A</kbd> select all · <kbd>Esc</kbd> clear · <kbd>Del</kbd> delete · <kbd>Ctrl+Z</kbd> undo</div>
        {nSel > 0 && <div className="bulk" role="toolbar" aria-label="Bulk actions">
          <strong>{count(nSel)} selected</strong><span className="bsep" />
          <div className="menu-wrap"><button className="btn btn-sm" aria-expanded={menu === "move"} onClick={() => setMenu(m => m === "move" ? null : "move")}><Icon name="arrow-right" size={13} />Move to layer<Icon name="chevron-down" size={11} /></button>
            {menu === "move" && <div className="menu up">{cats.map(c => <button key={c.id} onClick={() => bulk(i => ({ ...i, catId: c.id }), `Moved ${count(nSel)} to ${c.label}.`)}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}><i className="sw" style={{ background: c.color }} />{c.label}</span></button>)}</div>}</div>
          <div className="menu-wrap"><button className="btn btn-sm" aria-expanded={menu === "time"} onClick={() => setMenu(m => m === "time" ? null : "time")}><Icon name="clock" size={13} />Set timeframe<Icon name="chevron-down" size={11} /></button>
            {menu === "time" && <div className="menu up">{ranges.map(([s, e]) => <button key={s + "-" + e} onClick={() => bulk(i => ({ ...i, bands: bands.slice(s, e + 1).map(b => b.id) }), `Set ${count(nSel)} to ${range(s, e)}.`)}>
              {range(s, e)}<span>{e - s + 1} band{e > s ? "s" : ""}</span></button>)}</div>}</div>
          <button className="btn btn-sm" disabled={!selReview} onClick={() => bulk(i => ({ ...i, reviewNeeded: false }), `Marked ${count(selReview)} as reviewed.`)}><Icon name="shield" size={13} />Mark reviewed{selReview ? ` (${selReview})` : ""}</button>
          <div className="menu-wrap"><button className="btn btn-sm" aria-expanded={menu === "exp"} onClick={() => setMenu(m => m === "exp" ? null : "exp")}><Icon name="download" size={13} />Export<Icon name="chevron-down" size={11} /></button>
            {menu === "exp" && <div className="menu up">{[["json", "JSON", "Re-import later"], ["csv", "CSV", "Open in a spreadsheet"], ["text", "Text", "Plain list"]].map(([k, l, d]) =>
              <button key={k} onClick={() => { setMenu(null); onExportSelected(k); }}>{l}<span>{d}</span></button>)}</div>}</div>
          <button className="btn btn-sm btn-danger" onClick={onDeleteSelected}><Icon name="trash" size={13} />Delete</button>
          <span className="bsep" />
          <button className="btn btn-sm" onClick={() => setSelected(new Set())} aria-label="Clear selection"><Icon name="x" size={12} /></button>
        </div>}
      </div>
    </div>
  </div>;
}

Object.assign(window, { RoadmapPage, mix });
