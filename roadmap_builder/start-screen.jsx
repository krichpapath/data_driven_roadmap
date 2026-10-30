/* global React, Icon, Dialog, Select, TEMPLATES, buildFromTemplate, RoadmapLibrary, LibThumb, LibraryFooter */
// ─── New roadmap ─────────────────────────────────────────────
// Three entry points: pick template, blank, import JSON.
// Hero side teaches the DDRM concept with a visual mini-grid.

function StartScreen({ onStart, onImport }) {
  return (
    <div className="lib-page">
      <main className="ncp" id="main" tabIndex={-1}>
        <div className="ncp-in">
          <div className="ncp-card">
            <div className="ncp-hero">
              <span className="ey">Data-driven roadmaps · for everyone</span>
              <h1>Start a roadmap<br />without the <em>jargon</em>.</h1>
              <p>A DDRM is a single picture of <b>what's coming</b>, <b>what we'll build</b>, and <b>when</b>, organised in layers across time. Pick a starting point on the right and we'll explain each step as you go.</p>
              <div className="ncp-concepts">
                <div className="concept"><div className="ci"><Icon name="layers" size={14} /></div><b>Layers</b><span>Rows, from <i>why</i> (drivers) at the top to <i>how</i> (resources) at the bottom.</span></div>
                <div className="concept"><div className="ci"><Icon name="cols" size={14} /></div><b>Time bands</b><span>Columns. Now · Next · Later, or pick years.</span></div>
                <div className="concept"><div className="ci"><Icon name="item" size={14} /></div><b>Items</b><span>Live in cells and can span several bands.</span></div>
              </div>
              <div className="ncp-mini" aria-hidden="true">
                <div /><div className="h">Now</div><div className="h">Next</div><div className="h">Later</div>
                <div className="l" style={{ borderLeftColor: "var(--c-blue)" }}>Drivers</div>
                <div className="c"><div className="chip" style={{ borderColor: "var(--c-blue)", color: "var(--c-blue)" }}>GenAI growth</div></div>
                <div className="c"><div className="chip" style={{ borderColor: "var(--c-blue)", color: "var(--c-blue)" }}>Geopolitics</div></div><div className="c" />
                <div className="l" style={{ borderLeftColor: "var(--c-violet)" }}>Products</div><div className="c" />
                <div className="c" style={{ gridColumn: "3 / span 2" }}><div className="chip" style={{ borderColor: "var(--c-violet)", color: "var(--c-violet)", textAlign: "center" }}>↔ ASEAN platform</div></div>
                <div className="l" style={{ borderLeftColor: "var(--c-amber)" }}>R&amp;D</div>
                <div className="c" style={{ gridColumn: "2 / span 3" }}><div className="chip" style={{ borderColor: "var(--c-amber)", color: "var(--c-amber)", textAlign: "center" }}>↔ Digital Twins programme</div></div>
              </div>
            </div>

            <div className="ncp-opts">
              <h2 className="eyebrow">Start a roadmap</h2>
              <button type="button" className="opt featured" onClick={() => onStart("templates")}>
                <div className="oi"><Icon name="grid" size={19} /></div>
                <div><b>Pick a template</b><p>Industrial Digital, SaaS Product, Research Programme. Pre-filled and editable.</p></div>
                <Icon name="arrow-right" size={17} />
              </button>
              <button type="button" className="opt" onClick={() => onStart("blank")}>
                <div className="oi"><Icon name="blank" size={19} /></div>
                <div><b>Blank canvas</b><p>3 layers × 3 time bands. Rename and add as you go.</p></div>
                <Icon name="arrow-right" size={17} />
              </button>
              <button type="button" className="opt" onClick={onImport}>
                <div className="oi"><Icon name="import" size={19} /></div>
                <div><b>Import existing JSON</b><p>Bring in a roadmap you've exported before, with or without its sources.</p></div>
                <Icon name="arrow-right" size={17} />
              </button>
              <div className="tip"><Icon name="info" size={15} /><span><b>New to DDRM?</b> The <b>Industrial Digital</b> template is pre-loaded with the structure from a real digital-industry review document. Open it, look around, then adapt it to your own context.</span></div>
            </div>
          </div>
        </div>
      </main>
      <LibraryFooter />
    </div>
  );
}

// ─── Template library ─────────────────────────────────────────
// Counts up to `to` once; shows the final number straight away when motion is reduced.
function CountUp({ to }) {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf, start;
    const step = ts => { start ??= ts; const p = Math.min(1, (ts - start) / 600); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return v;
}

const TPL_GROUPS = ["All", ...new Set(TEMPLATES.map(t => t.group))];
const tplThumb = t => RoadmapLibrary.thumb({ categories: t.categories, bands: t.bands_data, items: t.items });

function TemplatePicker({ open, onClose, onPick, folders = [], roadmaps = [] }) {
  const [selected, setSelected] = React.useState("industrial-digital");
  const [group, setGroup] = React.useState("All");
  const [q, setQ] = React.useState("");
  const [name, setName] = React.useState("");
  const [folderId, setFolderId] = React.useState("");
  React.useEffect(() => { setName(buildFromTemplate(selected).title); }, [selected]);
  if (!open) return null;

  const tpl = TEMPLATES.find(t => t.id === selected);
  const query = q.trim().toLowerCase();
  const shown = TEMPLATES.filter(t => (group === "All" || t.group === group) && `${t.name} ${t.tagline}`.toLowerCase().includes(query));
  const used = id => roadmaps.filter(r => r.state?.templateId === id).length;
  const perLayer = tpl.categories.map(c => tpl.items.filter(i => i.catId === c.id).length), most = Math.max(1, ...perLayer);
  const pick = id => onPick(id, { title: (id === selected ? name.trim() : "") || buildFromTemplate(id).title, folderId: folderId || null });
  const n = used(tpl.id);

  return (
    <Dialog onClose={onClose} label="Start a roadmap from a template" className="lib-tpl">
      <div className="mhead">
        <div><h2>Start a roadmap from a template</h2><p>Templates ship with sensible layers and time bands. Everything is editable once you open it.</p></div>
        <div className="lib-search"><Icon name="search" size={13} /><input className="field-input" type="search" placeholder="Search templates" aria-label="Search templates" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button type="button" className="btn btn-icon" aria-label="Close" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      <div className="mbody">
        <aside className="mrail" aria-label="Template categories">
          <div className="eyebrow">Categories</div>
          {TPL_GROUPS.map(g => (
            <button key={g} type="button" className={`lib-folder ${group === g ? "on" : ""}`} aria-pressed={group === g} onClick={() => setGroup(g)}>
              <Icon name="folder" size={14} /><span className="nm">{g === "All" ? "All templates" : g}</span>
              <span className="n">{g === "All" ? TEMPLATES.length : TEMPLATES.filter(t => t.group === g).length}</span>
            </button>
          ))}
        </aside>
        <div className="tgrid" key={group}>
          {shown.length === 0 && <p className="lib-none">No templates match "{q}".</p>}
          {shown.map((t, i) => {
            const u = used(t.id);
            return (
              <button key={t.id} type="button" style={{ "--i": i }} className={`tcard ${selected === t.id ? "on" : ""}`} aria-pressed={selected === t.id}
                onClick={() => setSelected(t.id)} onDoubleClick={() => pick(t.id)}>
                {selected === t.id && <span className="check"><Icon name="check" size={12} strokeWidth={2.6} /></span>}
                <LibThumb rows={tplThumb(t)} size="sm" />
                <div><b>{t.name}{t.id === "industrial-digital" && <span className="tag accent">Recommended</span>}</b><p>{t.tagline}</p></div>
                <div className="tags"><span className="tag">{t.layers} layers</span><span className="tag">{t.bands} bands</span>{t.items.length > 0 && <span className="tag green">{t.items.length} items</span>}</div>
                <div className="tmeta"><span><Icon name="folder" size={11} />{t.group}</span><span><Icon name="clock" size={11} />{u ? `Used ${u}×` : "Not used yet"}</span></div>
              </button>
            );
          })}
        </div>
        <aside className="preview" key={tpl.id} aria-label={`${tpl.name} preview`}>
          <LibThumb rows={tplThumb(tpl)} size="lg" />
          <div><h3>{tpl.name}</h3><p className="desc">{tpl.tagline}</p></div>
          <div className="kv">
            <div><b><CountUp to={tpl.categories.length} /></b><span>Layers</span></div>
            <div><b><CountUp to={tpl.bands_data.length} /></b><span>Time bands</span></div>
            <div><b><CountUp to={tpl.items.length} /></b><span>Items</span></div>
          </div>
          <div className="plist">
            <div className="eyebrow">Layers</div>
            {tpl.categories.map((c, i) => (
              <div key={c.id} className="layer" style={{ "--i": i }}>
                <i style={{ background: c.color }} />{c.label}
                {tpl.items.length > 0 && <span className="q"><span className="qbar"><span style={{ width: `${perLayer[i] / most * 100}%`, background: c.color, "--i": i }} /></span>{perLayer[i]} items</span>}
              </div>
            ))}
          </div>
          <div className="plist"><div className="eyebrow">Time bands</div><div className="bands">{tpl.bands_data.map(b => <span key={b.id} className="band">{b.label}</span>)}</div></div>
          <div className="plist meta">{n ? `Used in ${n} of your roadmaps` : "Not used in your roadmaps yet"}</div>
        </aside>
      </div>
      <div className="mfoot">
        <div className="nm">
          <label htmlFor="tpl-name">Name</label>
          <input id="tpl-name" className="field-input" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") pick(selected); }} />
          <Select className="tpl-folder" value={folderId} onChange={setFolderId} aria-label="Folder"
            options={[["", "Unfiled"], ...folders.map(f => [f.id, `Folder: ${f.name}`])]} />
        </div>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-accent" onClick={() => pick(selected)}>Use this template <Icon name="arrow-right" size={13} /></button>
      </div>
    </Dialog>
  );
}

Object.assign(window, { StartScreen, TemplatePicker });
