/* global React, ReactDOM, Icon, InfoDot, Select, AdvisorUtils, GLOSSARY, PESTLE, PALETTE */

// Generate a collision-resistant id for a new entity.
// Combines timestamp (ordering) with random suffix (uniqueness within the same ms).
function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Inline style for the small <input type="color"> swatch in StructureModal.
// Background is overwritten per-render with the resolved hex.
const COLOR_SWATCH_BASE_STYLE = {
  width: 32,
  height: 28,
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: 2,
  cursor: "pointer"
};

const STRUCTURE_CARD_STYLE = {
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  padding: 10,
  background: "var(--surface-2)"
};

// Resolve a CSS color (incl. var(--…) and oklch()) into a hex string
// suitable for <input type="color"> (which requires #rrggbb).
function resolveToHex(input) {
  if (!input) return "#888888";
  if (/^#[0-9a-f]{6}$/i.test(input)) return input;
  try {
    // Canvas reliably handles oklch / var() / named colors
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d");
    // Resolve var(--…) first by setting it on a probe element
    let value = input;
    if (input.includes("var(")) {
      const probe = document.createElement("div");
      probe.style.color = input;
      document.body.appendChild(probe);
      value = getComputedStyle(probe).color || input;
      probe.remove();
    }
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const toHex = n => n.toString(16).padStart(2, "0");
    return "#" + toHex(r) + toHex(g) + toHex(b);
  } catch { return "#888888"; }
}

// ─── Add / Edit Item Modal ─────────────────────────────────
// Item details on the left; one feed of the user's notes and Advisor Expert advice on the right.
// Notes stay one text field (one note per paragraph) and advice stays in its stored text format,
// so saved roadmaps, exports and History are unchanged.
const BAND_HELP = "Choose the starting and ending periods for this roadmap item. Every period between them will be included automatically.";
const PESTLE_HELP = <ul className="popover-list">
  {[["Political", "Government policy and political influences."], ["Economic", "Markets, costs, and economic conditions."],
    ["Social", "People, culture, and societal trends."], ["Technological", "Innovation and technology changes."],
    ["Legal", "Laws, regulations, and compliance."], ["Environmental", "Sustainability and environmental impacts."]]
    .map(([name, text]) => <li key={name}><b>{name}:</b> <span>{text}</span></li>)}
</ul>;
const paragraphs = text => String(text || "").split(/\n{2,}/).map(t => t.trim()).filter(Boolean);
const oneParagraph = text => text.trim().replace(/\n{2,}/g, "\n"); // a blank line would split one note into two
const SPARK = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9z"/><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/></svg>;

// One Advisor Expert recommendation: action, heading, explanation, then its source with evidence on demand.
function AdviceEntry({ rec, onRemove, removeTitle }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const { title, body } = AdvisorUtils.splitAdvice(rec.text);
  const hasEvidence = rec.source || rec.references.length || rec.evidence;
  return <article className="entry adv">
    <div className="av adv" aria-hidden="true">{SPARK}</div>
    <div>
      <div className="ehead"><b>Advisor</b>{rec.role && rec.role !== "Advisor" && <span className="who-sub">{rec.role} expert</span>}<span className={`badge ${rec.action.toLowerCase()}`}>{rec.action}</span></div>
      <div className="etitle">{title}</div>
      {body && <p className="etext sm">{body}</p>}
      {hasEvidence && <div className="prov">
        {rec.source && <><Icon name="file-text" size={13} aria-hidden="true" /><span className="file" title={rec.source.name}>{rec.source.name}</span><span className="rev">Rev {rec.source.revision}</span></>}
        <button type="button" className="linkbtn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>Evidence <Icon name="chevron-down" size={12} aria-hidden="true" /></button>
      </div>}
      {open && <div className="evidence" id={id}>
        {rec.evidence && <q>{rec.evidence}</q>}
        {rec.references.length > 0 && <span>References: <span className="mono">{rec.references.join(", ")}</span></span>}
        {rec.source && <span>Source ID: <span className="mono">{rec.source.id}</span></span>}
      </div>}
      {onRemove && <div className="efoot"><span className="tools"><button type="button" className="del" title={removeTitle} onClick={onRemove}>Remove</button></span></div>}
    </div>
  </article>;
}

function NoteEntry({ text, onSave, onDelete }) {
  const [draft, setDraft] = React.useState(null);
  return <article className="entry">
    <div className="av me" aria-hidden="true">YO</div>
    <div>
      <div className="ehead"><b>You</b><span className="origin">My note</span></div>
      {draft == null ? <p className="etext">{text}</p>
        : <div className="field" style={{ marginTop: 6 }}>
            <textarea className="field-textarea" aria-label="Edit note" autoFocus value={draft} onChange={e => setDraft(e.target.value)} />
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="btn btn-sm btn-accent" disabled={!draft.trim()} onClick={() => { onSave(oneParagraph(draft)); setDraft(null); }}>Save note</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>}
      {draft == null && <div className="efoot"><span className="tools"><button type="button" onClick={() => setDraft(text)}>Edit</button><button type="button" className="del" onClick={onDelete}>Delete</button></span></div>}
    </div>
  </article>;
}

function ItemModal({ open, item, prefill, categories, bands, onSave, onClose, onDelete }) {
  const [name, setName] = React.useState("");
  const [catId, setCatId] = React.useState("");
  const [bandIds, setBandIds] = React.useState([]);
  const [pestle, setPestle] = React.useState([]);
  const [desc, setDesc] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [advice, setAdvice] = React.useState("");
  const [newNote, setNewNote] = React.useState("");
  const [feed, setFeed] = React.useState("all");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [err, setErr] = React.useState("");
  const initialRef = React.useRef("");

  React.useEffect(() => {
    if (!open) return;
    setErr(""); setConfirmDelete(false); setNewNote(""); setFeed("all");
    // Items saved before `advice` existed hold generated advice inside their notes.
    const text = item ? (item.advice == null ? AdvisorUtils.splitLegacyNotes(item.notes) : { notes: item.notes || "", advice: item.advice }) : null;
    const v = item
      ? { name: item.name, catId: item.catId, bandIds: Array.isArray(item.bands) ? [...item.bands] : [], pestle: [...(item.pestle || [])], desc: item.description || "", notes: text.notes, advice: text.advice }
      : { name: "", catId: prefill?.catId || categories[0]?.id || "", bandIds: prefill?.bandId ? [prefill.bandId] : (bands[0] ? [bands[0].id] : []), pestle: [], desc: "", notes: "", advice: "" };
    setName(v.name); setCatId(v.catId); setBandIds(v.bandIds); setPestle(v.pestle); setDesc(v.desc); setNotes(v.notes); setAdvice(v.advice);
    initialRef.current = JSON.stringify(v);
  }, [open, item, prefill]);

  if (!open) return null;
  const isEdit = !!item;
  const cat = categories.find(c => c.id === catId);

  // Bands always form one continuous range, so a card never claims a horizon the user did not pick.
  const picked = bands.map((b, i) => bandIds.includes(b.id) ? i : -1).filter(i => i >= 0);
  const startIdx = picked.length ? picked[0] : 0, endIdx = picked.length ? picked[picked.length - 1] : 0;
  const setRange = (lo, hi) => setBandIds(bands.slice(lo, hi + 1).map(b => b.id));
  const onStart = id => { const i = bands.findIndex(b => b.id === id); setRange(i, Math.max(i, endIdx)); };
  const onEnd = id => { const i = bands.findIndex(b => b.id === id); setRange(Math.min(startIdx, i), i); };
  const bandOptions = bands.map(b => [b.id, b.tag ? `${b.label} · ${b.tag}` : b.label]);
  const bandText = !picked.length ? "" : startIdx === endIdx ? bands[startIdx].label : `${bands[startIdx].label} → ${bands[endIdx].label}`;

  const noteList = paragraphs(notes);
  const blocks = paragraphs(advice);
  const recs = blocks.flatMap((block, bi) => { const list = AdvisorUtils.parseAdvice(block); return list.map(rec => ({ rec, bi, size: list.length })); });
  const setNoteList = list => setNotes(list.join("\n\n"));
  const removeBlock = bi => setAdvice(blocks.filter((_, i) => i !== bi).join("\n\n"));
  const addNote = () => { const t = oneParagraph(newNote); if (!t) return; setNoteList([t, ...noteList]); setNewNote(""); if (feed === "adv") setFeed("all"); };
  const counts = { all: noteList.length + recs.length, me: noteList.length, adv: recs.length };

  const dirty = JSON.stringify({ name, catId, bandIds, pestle, desc, notes, advice }) !== initialRef.current || !!newNote.trim();
  const requestClose = () => { if (!dirty || confirm("Discard your unsaved changes to this item?")) onClose(); };

  const save = () => {
    if (!name.trim()) return;
    if (!categories.length) { setErr("Add at least one layer before saving an item."); return; }
    if (!bands.length) { setErr("Add at least one time band before saving an item."); return; }
    // A note still in the composer is saved too, rather than silently dropped.
    const pending = oneParagraph(newNote);
    onSave({
      id: item?.id || makeId("i"),
      name: name.trim(),
      catId,
      bands: bandIds.length ? bandIds : [bands[0].id],
      pestle,
      description: desc.trim(),
      notes: (pending ? [pending, ...noteList] : noteList).join("\n\n"),
      advice: advice.trim()
    });
  };

  const noteRows = noteList.map((t, i) => <NoteEntry key={`n${i}:${t}`} text={t}
    onSave={v => setNoteList(noteList.map((x, j) => j === i ? v : x))} onDelete={() => setNoteList(noteList.filter((_, j) => j !== i))} />);
  const adviceRows = recs.map(({ rec, bi, size }, i) => rec.raw
    ? <article key={`a${i}`} className="entry adv"><div className="av adv" aria-hidden="true">{SPARK}</div><div><div className="ehead"><b>Advisor</b></div><p className="etext sm">{rec.raw}</p>
        <div className="efoot"><span className="tools"><button type="button" className="del" onClick={() => removeBlock(bi)}>Remove</button></span></div></div></article>
    : <AdviceEntry key={`a${i}`} rec={rec} onRemove={() => removeBlock(bi)} removeTitle={size > 1 ? `Removes all ${size} recommendations from this News Impact run` : "Remove this recommendation"} />);
  const shown = feed === "me" ? noteRows : feed === "adv" ? adviceRows : [...noteRows, ...adviceRows];

  return (
    <Dialog onClose={requestClose} label={isEdit ? "Edit item" : "Add item"} className="eim">
      <header className="mhead">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{isEdit ? "Edit item" : "Add item"}</div>
          <h2>{name.trim() || (isEdit ? item.name : "New item")}</h2>
          <div className="mmeta">{cat && <span>{cat.label}</span>}{bandText && <><span className="sep">·</span><span>{bandText}</span></>}
            {isEdit && item.reviewNeeded && <><span className="sep">·</span><span>Advice to review</span></>}</div>
        </div>
        <button className="close" aria-label="Close" onClick={requestClose}><Icon name="x" size={12} /></button>
      </header>
      <div className="mbody">
        <section className="card" aria-labelledby="item-details-title">
          <div className="sec-title"><h3 id="item-details-title">Item details</h3><span className="aside">Shown on the roadmap card</span></div>
          <div className="sec-body">
            <div className="field">
              <label className="field-label" htmlFor="item-name">Name <span className="req">*</span></label>
              <input id="item-name" className="field-input" autoFocus placeholder="e.g. Growth of Generative AI" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && name.trim()) save(); }} />
            </div>
            <div className="field">
              <div className="field-label"><label htmlFor="item-layer">Layer</label><InfoDot label="About layers" title="Layers" tip={GLOSSARY.layer.def.replace(/<[^>]+>/g, "")} /></div>
              <Select id="item-layer" wrap value={catId} onChange={setCatId} options={categories.map(c => [c.id, c.sub ? `${c.label}: ${c.sub}` : c.label])} />
              {cat?.help && <div className="help">{cat.help}</div>}
            </div>
            <div className="field" role="group" aria-labelledby="item-bands-label">
              <div className="field-label"><span id="item-bands-label">Time bands</span><InfoDot label="About time bands" title="Time Bands" tip={BAND_HELP} />
                <span className="opt">{picked.length === 1 ? "1 band" : `${picked.length} bands`}</span></div>
              <div className="two">
                <Select aria-label="Start band" wrap value={bands[startIdx]?.id} options={bandOptions} onChange={onStart} />
                <span className="arrow" aria-hidden="true">→</span>
                <Select aria-label="End band" wrap value={bands[endIdx]?.id} options={bandOptions} onChange={onEnd} />
              </div>
            </div>
            <div className="field" role="group" aria-labelledby="item-pestle-label">
              <div className="field-label"><span id="item-pestle-label">PESTLE tags</span><InfoDot label="About PESTLE tags" title="PESTLE Categories" tip={PESTLE_HELP} /><span className="opt">optional</span></div>
              <div className="pestle">{PESTLE.map(p => { const on = pestle.includes(p.key); return (
                <button key={p.key} type="button" className={on ? "on" : ""} style={{ "--pc": p.color }} aria-pressed={on} title={p.def}
                  onClick={() => setPestle(on ? pestle.filter(x => x !== p.key) : [...pestle, p.key])}><b>{p.key}</b>{p.label}</button>); })}</div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="item-desc">Description <span className="opt">optional</span></label>
              <textarea id="item-desc" className="field-textarea" rows={4} placeholder="Why does this matter? What does it look like? Who is involved?" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
          </div>
        </section>
        <section className="card" aria-labelledby="item-notes-title">
          <div className="sec-title"><h3 id="item-notes-title">Notes &amp; advice</h3><span className="aside">{counts.me} note{counts.me === 1 ? "" : "s"} · {counts.adv} advice</span></div>
          <div className="feedbar">
            <div className="segmented" role="group" aria-label="Show">
              {[["all", "All"], ["me", "Mine"], ["adv", "Advisor"]].map(([k, l]) =>
                <button key={k} type="button" className={feed === k ? "on" : ""} aria-pressed={feed === k} onClick={() => setFeed(k)}>{l} <span>{counts[k]}</span></button>)}
            </div>
            {advice && <button type="button" className="btn btn-ghost btn-sm danger" style={{ marginLeft: "auto" }} onClick={() => setAdvice("")}><Icon name="trash" size={12} />Clear advice</button>}
          </div>
          <div className="composer">
            <textarea className="field-textarea" aria-label="New note" placeholder="Add a note, decision, or follow-up…" value={newNote} onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addNote(); } }} />
            <button type="button" className="btn btn-accent" disabled={!newNote.trim()} onClick={addNote}><Icon name="pencil" size={13} />Add note</button>
          </div>
          <div className="feed">
            {shown.length ? shown : <div className="empty">{feed === "me" ? "No notes yet. Write one above."
              : <>No advice applied yet. Run <b>News Impact</b> and apply its advice to this item.</>}</div>}
          </div>
        </section>
      </div>
      <footer className="mfoot">
        {isEdit && <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={13} />Delete item</button>}
        <span role={err ? "alert" : undefined} className={`state ${err ? "bad" : dirty ? "dirty" : ""}`}>{err || (dirty ? "Unsaved changes" : isEdit ? "No unsaved changes" : "Not added yet")}</span>
        <button className="btn" onClick={requestClose}>Cancel</button>
        <button className="btn btn-accent" onClick={save} disabled={!name.trim()}>{isEdit ? "Save changes" : "Add to roadmap"}</button>
      </footer>

      {confirmDelete && ReactDOM.createPortal(
        <LibConfirm title={`Delete “${item.name}”?`} body="This removes the item from the roadmap. You can undo it with Ctrl+Z." confirmLabel="Delete item"
          onClose={() => setConfirmDelete(false)} onConfirm={() => onDelete(item.id)} />, document.body)}
    </Dialog>
  );
}

// ─── Glossary Modal ────────────────────────────────────────
function GlossaryModal({ open, onClose }) {
  if (!open) return null;
  const entries = Object.values(GLOSSARY);
  return (
    <Dialog onClose={onClose} label="DDRM glossary" className="modal-lg">
        <div className="modal-head">
          <div>
            <div className="modal-title">DDRM glossary</div>
            <div className="modal-sub">Every term you'll see in this app, in plain English.</div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="gl">{entries.map(e => <div key={e.term}><h3>{e.term}<small>{e.pill}</small></h3><span dangerouslySetInnerHTML={{ __html: e.def }} /></div>)}</div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-accent" onClick={onClose}>Got it</button>
        </div>
    </Dialog>
  );
}

// ─── Import Modal ──────────────────────────────────────────
function ImportModal({ open, onClose, onLoad }) {
  const [text, setText] = React.useState("");
  const [err, setErr] = React.useState("");
  if (!open) return null;
  const validateRoadmap = (roadmap) => {
    if (!roadmap || typeof roadmap !== "object" || Array.isArray(roadmap)) {
      throw new Error("Roadmap JSON must be an object.");
    }
    if (!Array.isArray(roadmap.categories)) {
      throw new Error("Roadmap JSON must include categories as an array.");
    }
    if (!Array.isArray(roadmap.bands)) {
      throw new Error("Roadmap JSON must include bands as an array.");
    }
    if (!Array.isArray(roadmap.items)) {
      throw new Error("Roadmap JSON must include items as an array.");
    }
    if (roadmap.categories.length < 1) {
      throw new Error("Roadmap needs at least one layer.");
    }
    if (roadmap.bands.length < 1) {
      throw new Error("Roadmap needs at least one time band.");
    }
    roadmap.categories.forEach((cat, idx) => {
      if (!cat || typeof cat !== "object" || !String(cat.id || "").trim() || !String(cat.label || "").trim()) {
        throw new Error(`Layer ${idx + 1} must include id and label.`);
      }
    });
    roadmap.bands.forEach((band, idx) => {
      if (!band || typeof band !== "object" || !String(band.id || "").trim() || !String(band.label || "").trim()) {
        throw new Error(`Time band ${idx + 1} must include id and label.`);
      }
    });
    const categoryIds = new Set(roadmap.categories.map(cat => cat.id));
    const bandIds = new Set(roadmap.bands.map(band => band.id));
    roadmap.items.forEach((item, idx) => {
      if (!item || typeof item !== "object" || !String(item.name || "").trim()) {
        throw new Error(`Item ${idx + 1} must include a name.`);
      }
      if (!String(item.catId || "").trim() || !categoryIds.has(item.catId)) {
        throw new Error(`Item ${idx + 1} must reference an existing layer.`);
      }
      if (!Array.isArray(item.bands) || item.bands.length < 1) {
        throw new Error(`Item ${idx + 1} must include at least one time band.`);
      }
      if (!item.bands.every(bandId => bandIds.has(bandId))) {
        throw new Error(`Item ${idx + 1} must reference existing time bands.`);
      }
      const order = item.bands.map(b => roadmap.bands.map(band => band.id).indexOf(b)).sort((a, b) => a - b);
      if (order.some((pos, i) => i && pos !== order[i - 1] + 1)) {
        throw new Error(`Item ${idx + 1} must use neighbouring time bands (a card is one continuous span).`);
      }
      if (item.pestle != null && (!Array.isArray(item.pestle) || item.pestle.some(p => !["P", "E", "S", "T", "L", "En"].includes(p)))) {
        throw new Error(`Item ${idx + 1} has an unknown PESTLE tag. Use P, E, S, T, L or En.`);
      }
    });
  };
  const load = (raw) => {
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { setErr("This is not valid roadmap JSON. Paste the full text of an exported .json file, or choose the file."); return; }
    try { validateRoadmap(parsed); onLoad(parsed); }
    catch (e) { setErr(e.message); }
  };
  const pickFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const raw = await file.text();
    // Exports with sources can be megabytes: load directly instead of pasting into the box.
    if (raw.length > 200000) load(raw); else { setText(raw); setErr(""); }
  };
  const requestClose = () => { if (!text.trim() || confirm("Discard the pasted JSON?")) onClose(); };
  return (
    <Dialog onClose={requestClose} label="Import roadmap JSON">
        <div className="modal-head">
          <div>
            <div className="modal-title">Import roadmap JSON</div>
            <div className="modal-sub">Choose an exported .json file or paste its text. The app validates structure before loading and creates a new roadmap.</div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={requestClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="btn btn-sm import-file-btn">
              <Icon name="upload" size={13} /> Choose .json file
              <input className="visually-hidden" type="file" accept=".json,application/json" onChange={pickFile} />
            </label>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="import-json">Or paste JSON</label>
            <textarea
              id="import-json"
              className="field-textarea mono"
              style={{ minHeight: 180, fontSize: 12 }}
              placeholder='{"title": "...", "categories": [...], "bands": [...], "items": [...]}'
              value={text}
              aria-invalid={!!err}
              aria-describedby={err ? "import-error" : undefined}
              onChange={e => { setText(e.target.value); setErr(""); }}
            />
            {err && <div id="import-error" role="alert" className="field-help" style={{ color: "var(--c-rose)" }}>⚠ {err}</div>}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={() => load(text)} disabled={!text.trim()}>Load roadmap</button>
        </div>
    </Dialog>
  );
}

// ─── Structure Modal — edit layers and bands ──────────────
function StructureModal({ open, state, onSave, onClose }) {
  const [cats, setCats] = React.useState([]);
  const [bands, setBands] = React.useState([]);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setCats(state.categories.map(c => ({ ...c })));
    setBands(state.bands.map(b => ({ ...b })));
    setErr("");
  }, [open, state]);

  if (!open) return null;

  const updateCat = (id, patch) => setCats(cats.map(c => c.id === id ? { ...c, ...patch } : c));
  const updateBand = (id, patch) => setBands(bands.map(b => b.id === id ? { ...b, ...patch } : b));
  const addCat = () => setCats([...cats, { id: makeId("l"), label: "New layer", sub: "", color: PALETTE[cats.length % PALETTE.length], help: "" }]);
  const addBand = () => setBands([...bands, { id: makeId("b"), label: "New band", tag: "", color: PALETTE[bands.length % PALETTE.length] }]);
  const delCat = id => {
    if (cats.length <= 1) {
      setErr("Roadmap needs at least one layer.");
      return;
    }
    setErr("");
    setCats(cats.filter(c => c.id !== id));
  };
  const delBand = id => {
    if (bands.length <= 1) {
      setErr("Roadmap needs at least one time band.");
      return;
    }
    setErr("");
    setBands(bands.filter(b => b.id !== id));
  };
  const canSave = cats.length > 0 && bands.length > 0;
  // Items whose layer or every band is removed are deleted on save; the user must see that first.
  const lost = state.items.filter(i => !cats.some(c => c.id === i.catId) || !i.bands.some(id => bands.some(b => b.id === id)));
  const saveStructure = async () => {
    if (!canSave) {
      setErr("Roadmap needs at least one layer and one time band.");
      return;
    }
    // A separate dialog, not a button that changes under the cursor: a double-click must not confirm item loss.
    if (lost.length && !await confirmDeletion({ title: `Delete ${lost.length} item${lost.length === 1 ? "" : "s"}?`,
      body: "They are in the layers or time bands you removed. You can undo it with Ctrl+Z.", names: lost.map(i => i.name),
      confirmLabel: `Delete ${lost.length} item${lost.length === 1 ? "" : "s"} and save` })) return;
    onSave(cats, bands);
  };
  const dirty = JSON.stringify(cats) !== JSON.stringify(state.categories) || JSON.stringify(bands) !== JSON.stringify(state.bands);
  const requestClose = () => { if (!dirty || confirm("Discard your unsaved structure changes?")) onClose(); };

  return (
    <Dialog onClose={requestClose} label="Edit structure" className="modal-xl">
        <div className="modal-head">
          <div>
            <div className="modal-title">Edit structure</div>
            <div className="modal-sub">
              Customise the rows (<b>layers</b>) and columns (<b>time bands</b>) of your roadmap. Rename, recolour, add or remove. Renamed layers and bands keep their items.
            </div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={requestClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            {/* Layers */}
            <div>
              <div className="row" style={{ marginBottom: 10 }}>
                <Icon name="rows" size={14} />
                <b style={{ fontSize: 13 }}>Layers (rows)</b>
                <InfoDot tip="Stack from why → how. Drivers, Strategy, Products, Process, R&D, Infrastructure, Resources is a common order." />
                <span className="spacer" />
                <button className="btn btn-sm" onClick={addCat}><Icon name="plus" size={12} /> Add layer</button>
              </div>
              <div className="col" style={{ gap: 8 }}>
                {cats.map((c, i) => (
                  <div key={c.id} style={STRUCTURE_CARD_STYLE}>
                    <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                      <input
                        className="field-input"
                        style={{ fontWeight: 500, padding: "5px 8px", flex: 1 }}
                        value={c.label}
                        aria-label={`Layer ${i + 1} name`}
                        onChange={e => updateCat(c.id, { label: e.target.value })}
                      />
                      <input
                        type="color"
                        value={resolveToHex(c.color)}
                        aria-label={`Layer ${i + 1} colour`}
                        style={{ ...COLOR_SWATCH_BASE_STYLE, background: resolveToHex(c.color) }}
                        onChange={e => updateCat(c.id, { color: e.target.value })}
                      />
                      <button
                        className="btn btn-ghost btn-icon"
                        aria-label={`Delete layer ${c.label}`}
                        onClick={() => delCat(c.id)}
                        disabled={cats.length <= 1}
                        title={cats.length <= 1 ? "Roadmap needs at least one layer" : "Delete layer"}
                      ><Icon name="trash" size={13} /></button>
                    </div>
                    <input
                      className="field-input"
                      style={{ fontSize: 12, padding: "5px 8px" }}
                      placeholder="Sub-label (e.g. External forces)"
                      aria-label={`Layer ${i + 1} sub-label`}
                      value={c.sub || ""}
                      onChange={e => updateCat(c.id, { sub: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Bands */}
            <div>
              <div className="row" style={{ marginBottom: 10 }}>
                <Icon name="cols" size={14} />
                <b style={{ fontSize: 13 }}>Time bands (columns)</b>
                <InfoDot tip="Pick the time horizons that match your planning cadence: quarters, years, or qualitative (Now / Next / Later)." />
                <span className="spacer" />
                <button className="btn btn-sm" onClick={addBand}><Icon name="plus" size={12} /> Add band</button>
              </div>
              <div className="col" style={{ gap: 8 }}>
                {bands.map((b, i) => (
                  <div key={b.id} style={STRUCTURE_CARD_STYLE}>
                    <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                      <input
                        className="field-input"
                        style={{ fontWeight: 500, padding: "5px 8px", flex: 1 }}
                        value={b.label}
                        aria-label={`Time band ${i + 1} name`}
                        onChange={e => updateBand(b.id, { label: e.target.value })}
                      />
                      <input
                        type="color"
                        value={resolveToHex(b.color)}
                        aria-label={`Time band ${i + 1} colour`}
                        style={{ ...COLOR_SWATCH_BASE_STYLE, background: resolveToHex(b.color) }}
                        onChange={e => updateBand(b.id, { color: e.target.value })}
                      />
                      <button
                        className="btn btn-ghost btn-icon"
                        aria-label={`Delete time band ${b.label}`}
                        onClick={() => delBand(b.id)}
                        disabled={bands.length <= 1}
                        title={bands.length <= 1 ? "Roadmap needs at least one time band" : "Delete time band"}
                      ><Icon name="trash" size={13} /></button>
                    </div>
                    <input
                      className="field-input"
                      style={{ fontSize: 12, padding: "5px 8px" }}
                      placeholder="Sub-label (e.g. Now, Mid term)"
                      aria-label={`Time band ${i + 1} sub-label`}
                      value={b.tag || ""}
                      onChange={e => updateBand(b.id, { tag: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          {err && <span className="field-help left" style={{ color: "var(--c-rose)", marginRight: "auto" }}>⚠ {err}</span>}
          {!err && lost.length > 0 && <span role="alert" className="field-help left structure-loss">
            ⚠ Saving deletes {lost.length} item{lost.length === 1 ? "" : "s"} in removed layers or bands: {lost.slice(0, 3).map(i => i.name).join(", ")}{lost.length > 3 ? "…" : ""}
          </span>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={saveStructure} disabled={!canSave}>Save structure</button>
        </div>
    </Dialog>
  );
}

Object.assign(window, { ItemModal, AdviceEntry, GlossaryModal, ImportModal, StructureModal });
