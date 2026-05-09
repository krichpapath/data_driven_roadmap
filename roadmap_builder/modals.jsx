/* global React, Icon, InfoDot, GLOSSARY, PESTLE, PALETTE */

// Generate a collision-resistant id for a new entity.
// Combines timestamp (ordering) with random suffix (uniqueness within the same ms).
function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const OPTIONAL_TAG_STYLE = {
  marginLeft: "auto",
  fontSize: 11,
  color: "var(--ink-faint)",
  fontWeight: 400
};

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
function ItemModal({ open, item, prefill, categories, bands, onSave, onClose, onDelete }) {
  const [name, setName] = React.useState("");
  const [catId, setCatId] = React.useState("");
  const [bandIds, setBandIds] = React.useState([]);
  const [pestle, setPestle] = React.useState([]);
  const [desc, setDesc] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setErr("");
    if (item) {
      setName(item.name); setCatId(item.catId);
      setBandIds(Array.isArray(item.bands) ? [...item.bands] : []);
      setPestle([...(item.pestle || [])]);
      setDesc(item.description || "");
      setNotes(item.notes || "");
    } else {
      setName("");
      setCatId(prefill?.catId || categories[0]?.id || "");
      setBandIds(prefill?.bandId ? [prefill.bandId] : (bands[0] ? [bands[0].id] : []));
      setPestle([]); setDesc(""); setNotes("");
    }
  }, [open, item, prefill]);

  if (!open) return null;
  const isEdit = !!item;
  const cat = categories.find(c => c.id === catId);

  const toggle = (arr, setArr, val) =>
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  const save = () => {
    if (!name.trim()) return;
    if (!categories.length) {
      setErr("Add at least one layer before saving an item.");
      return;
    }
    if (!bands.length) {
      setErr("Add at least one time band before saving an item.");
      return;
    }
    onSave({
      id: item?.id || makeId("i"),
      name: name.trim(),
      catId,
      bands: bandIds.length ? bandIds : [bands[0].id],
      pestle,
      description: desc.trim(),
      notes: notes.trim()
    });
  };

  return (
    <div className="backdrop on" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{isEdit ? "Edit item" : "Add a new item"}</div>
            <div className="modal-sub">
              An item is one card on your roadmap — a single driver, product or programme. It belongs to <b>one layer</b> and <b>at least one time band</b>.
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className="modal-body">
          {!isEdit && (
            <div className="concept-card">
              <Icon name="lightbulb" size={16} className="concept-card-icon" />
              <div>
                <b>Tip:</b> Start with the name. The other fields default sensibly — you can tweak them later. Items with longer-running scope can span multiple time bands.
              </div>
            </div>
          )}

          <div className="field">
            <label className="field-label">
              Name <span style={{ color: "var(--c-rose)" }}>*</span>
            </label>
            <input
              className="field-input"
              autoFocus
              placeholder="e.g. Growth of Generative AI"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="row" style={{ gap: 14, alignItems: "stretch" }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label">
                Layer
                <InfoDot tip={GLOSSARY.layer.def.replace(/<[^>]+>/g, "")} />
              </label>
              <select
                className="field-select"
                value={catId}
                onChange={e => setCatId(e.target.value)}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.label}{c.sub ? ` — ${c.sub}` : ""}</option>
                ))}
              </select>
              {cat?.help && <div className="field-help">{cat.help}</div>}
            </div>
          </div>

          <div className="field">
            <label className="field-label">
              Time bands
              <InfoDot tip="Pick one or more horizons. If you pick non-adjacent ones, the item will be split." />
              <span style={OPTIONAL_TAG_STYLE}>
                {bandIds.length === 0 ? "pick at least one" : bandIds.length === 1 ? "single horizon" : `spans ${bandIds.length} bands`}
              </span>
            </label>
            <div className="toggle-row">
              {bands.map(b => (
                <button
                  key={b.id}
                  className={`toggle ${bandIds.includes(b.id) ? "on" : ""}`}
                  style={bandIds.includes(b.id) ? { background: b.color, borderColor: b.color, color: "white" } : {}}
                  onClick={() => toggle(bandIds, setBandIds, b.id)}
                >
                  {b.label}
                  <span style={{ opacity: 0.7, fontSize: 10.5, marginLeft: 4 }}>{b.tag}</span>
                </button>
              ))}
            </div>
            <div className="field-help">
              Need a longer item? Toggle two adjacent bands and it'll render as a wide card spanning them.
            </div>
          </div>

          <div className="field">
            <label className="field-label">
              PESTLE tags
              <InfoDot tip="Optional. Six-letter checklist for what kind of force this item represents — Political, Economic, Social, Technological, Legal, Environmental." />
              <span style={OPTIONAL_TAG_STYLE}>optional</span>
            </label>
            <div className="toggle-row">
              {PESTLE.map(p => (
                <button
                  key={p.key}
                  className={`toggle ${pestle.includes(p.key) ? "on color-on p-" + p.key : ""}`}
                  onClick={() => toggle(pestle, setPestle, p.key)}
                  title={p.def}
                >
                  <b>{p.key}</b> {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label">Description <span style={OPTIONAL_TAG_STYLE}>optional</span></label>
            <textarea
              className="field-textarea"
              placeholder="Why does this matter? What does it look like? Who's involved?"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label">
              Notes / Advice
              <span style={OPTIONAL_TAG_STYLE}>optional</span>
            </label>
            <textarea
              className="field-textarea field-notes"
              placeholder="Impact advisor notes appear here. Edit freely."
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <div className="field-help">Populated by Impact Advisor. You can edit or clear this.</div>
          </div>

          {err && <div className="field-help" style={{ color: "var(--c-rose)" }}>⚠ {err}</div>}
        </div>

        <div className="modal-foot">
          {isEdit && (
            <button className="btn left" onClick={() => onDelete(item.id)} style={{ color: "var(--c-rose)", borderColor: "color-mix(in oklch, var(--c-rose) 30%, white)" }}>
              <Icon name="trash" size={14} /> Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={save} disabled={!name.trim()}>
            {isEdit ? "Save changes" : "Add to roadmap"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Glossary Modal ────────────────────────────────────────
function GlossaryModal({ open, onClose }) {
  if (!open) return null;
  const entries = Object.values(GLOSSARY);
  return (
    <div className="backdrop on" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">DDRM glossary</div>
            <div className="modal-sub">Every term you'll see in this app, in plain English.</div>
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {entries.map(e => (
              <div key={e.term} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "12px 14px" }}>
                <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                  <b style={{ fontSize: 13 }}>{e.term}</b>
                  <span style={{ font: "500 10px 'JetBrains Mono', monospace", background: "var(--accent-soft)", color: "var(--accent-ink)", padding: "1px 5px", borderRadius: 3, textTransform: "uppercase", letterSpacing: 0.04 }}>{e.pill}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: e.def }} />
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-accent" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
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
    });
  };
  const tryLoad = () => {
    try {
      const parsed = JSON.parse(text);
      validateRoadmap(parsed);
      onLoad(parsed);
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <div className="backdrop on" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Import roadmap JSON</div>
            <div className="modal-sub">Paste a previously exported file. The app validates structure before loading.</div>
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">JSON</label>
            <textarea
              className="field-textarea mono"
              style={{ minHeight: 180, fontSize: 12 }}
              placeholder='{"title": "...", "categories": [...], "bands": [...], "items": [...]}'
              value={text}
              onChange={e => { setText(e.target.value); setErr(""); }}
            />
            {err && <div className="field-help" style={{ color: "var(--c-rose)" }}>⚠ {err}</div>}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={tryLoad} disabled={!text.trim()}>Load roadmap</button>
        </div>
      </div>
    </div>
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
  const saveStructure = () => {
    if (!canSave) {
      setErr("Roadmap needs at least one layer and one time band.");
      return;
    }
    onSave(cats, bands);
  };

  return (
    <div className="backdrop on" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Edit structure</div>
            <div className="modal-sub">
              Customise the rows (<b>layers</b>) and columns (<b>time bands</b>) of your roadmap. Rename, reorder, recolour. Items keep their layer & band IDs, so existing items stay attached.
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="x" size={14} /></button>
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
                        onChange={e => updateCat(c.id, { label: e.target.value })}
                      />
                      <input
                        type="color"
                        value={resolveToHex(c.color)}
                        style={{ ...COLOR_SWATCH_BASE_STYLE, background: resolveToHex(c.color) }}
                        onChange={e => updateCat(c.id, { color: e.target.value })}
                      />
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => delCat(c.id)}
                        disabled={cats.length <= 1}
                        title={cats.length <= 1 ? "Roadmap needs at least one layer" : "Delete layer"}
                      ><Icon name="trash" size={13} /></button>
                    </div>
                    <input
                      className="field-input"
                      style={{ fontSize: 12, padding: "5px 8px" }}
                      placeholder="Sub-label (e.g. External forces)"
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
                <InfoDot tip="Pick the time horizons that match your planning cadence — quarters, years, or qualitative (Now / Next / Later)." />
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
                        onChange={e => updateBand(b.id, { label: e.target.value })}
                      />
                      <input
                        type="color"
                        value={resolveToHex(b.color)}
                        style={{ ...COLOR_SWATCH_BASE_STYLE, background: resolveToHex(b.color) }}
                        onChange={e => updateBand(b.id, { color: e.target.value })}
                      />
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => delBand(b.id)}
                        disabled={bands.length <= 1}
                        title={bands.length <= 1 ? "Roadmap needs at least one time band" : "Delete time band"}
                      ><Icon name="trash" size={13} /></button>
                    </div>
                    <input
                      className="field-input"
                      style={{ fontSize: 12, padding: "5px 8px" }}
                      placeholder="Sub-label (e.g. Now, Mid term)"
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
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={saveStructure} disabled={!canSave}>Save structure</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ItemModal, GlossaryModal, ImportModal, StructureModal });
