/* global React, ReactDOM, Icon, InfoDot, StartScreen, TemplatePicker, CoachRail, RoadmapGrid, ItemModal, GlossaryModal, ImportModal, StructureModal, Toast, GLOSSARY, TEMPLATES, buildFromTemplate, TweaksPanel, useTweaks, TweakSection, TweakToggle, TweakRadio */
const STORAGE_KEY = "ddrm_v1";

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function App() {
  // Tweaks: density / coach visibility / band-style
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "density": "comfortable",
    "showCoachRail": true,
    "showFirstTimeBanner": true,
    "bandStyle": "gradient"
  }/*EDITMODE-END*/);

  const [phase, setPhase] = React.useState("start"); // start | builder
  const [state, setState] = React.useState(null);
  const [showTplPicker, setShowTplPicker] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [showGloss, setShowGloss] = React.useState(false);
  const [showStructure, setShowStructure] = React.useState(false);
  const [itemModal, setItemModal] = React.useState({ open: false, item: null, prefill: null });
  const [toast, setToast] = React.useState({ on: false, msg: "" });
  const [coachStep, setCoachStep] = React.useState("name");
  const [selected, setSelected] = React.useState(new Set());
  const [showExport, setShowExport] = React.useState({ open: false, kind: null, payload: "" });

  // restore saved on mount
  React.useEffect(() => {
    const saved = loadSaved();
    if (saved && saved.categories) {
      setState(saved);
      setPhase("builder");
    }
  }, []);

  // autosave
  React.useEffect(() => { if (state) saveState(state); }, [state]);

  // figure out current step based on data
  React.useEffect(() => {
    if (!state) return;
    if (state.title === "Untitled Roadmap") setCoachStep("name");
    else if (state.items.length === 0) setCoachStep("first-item");
    else if (!state.categories.every(c => state.items.some(i => i.catId === c.id))) setCoachStep("all-layers");
    else if (!state.items.some(i => i.bands.length > 1)) setCoachStep("span");
    else if (!state.items.some(i => (i.pestle || []).length > 0)) setCoachStep("tag");
    else setCoachStep("export");
  }, [state]);

  // ── Keyboard shortcuts: ⌘/Ctrl+A select all, Esc clear, Delete remove ──
  React.useEffect(() => {
    if (phase !== "builder" || !state) return;
    const handler = (e) => {
      // skip when typing in inputs / textareas
      const tag = e.target?.tagName;
      const editing = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !editing) {
        e.preventDefault();
        setSelected(new Set(state.items.map(i => i.id)));
      } else if (e.key === "Escape" && selected.size > 0 && !showExport.open && !itemModal.open) {
        setSelected(new Set());
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.size > 0 && !editing && !itemModal.open) {
        e.preventDefault();
        if (confirm(`Delete ${selected.size} selected item${selected.size > 1 ? "s" : ""}?`)) {
          setState(s => ({ ...s, items: s.items.filter(i => !selected.has(i.id)) }));
          setSelected(new Set());
          showToast(`Deleted ${selected.size}`);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, state, selected, showExport.open, itemModal.open]);

  const showToast = (msg) => {
    setToast({ on: true, msg });
    setTimeout(() => setToast({ on: false, msg: "" }), 2200);
  };

  // ── Start screen handlers ─────────────────────────────
  const handleStart = (kind) => {
    if (kind === "templates") setShowTplPicker(true);
    else if (kind === "blank") {
      setState(buildFromTemplate("blank"));
      setPhase("builder");
      showToast("Blank roadmap created");
    }
  };

  const handlePickTemplate = (id) => {
    setState(buildFromTemplate(id));
    setShowTplPicker(false);
    setPhase("builder");
    const tpl = TEMPLATES.find(t => t.id === id);
    showToast(`Loaded "${tpl.name}" — ${tpl.items.length || 0} items pre-filled`);
  };

  const handleImport = (data) => {
    setState({ ...data, templateId: data.templateId || "imported" });
    setShowImport(false);
    setPhase("builder");
    showToast("Roadmap imported");
  };

  // ── Builder handlers ──────────────────────────────────
  const updateState = (patch) => setState(s => ({ ...s, ...patch }));

  const onAddItem = (catId, bandId) => setItemModal({ open: true, item: null, prefill: { catId, bandId } });
  const onEditItem = (id) => {
    const it = state.items.find(i => i.id === id);
    if (it) setItemModal({ open: true, item: it, prefill: null });
  };
  const onSaveItem = (it) => {
    setState(s => {
      const exists = s.items.some(x => x.id === it.id);
      return { ...s, items: exists ? s.items.map(x => x.id === it.id ? it : x) : [...s.items, it] };
    });
    setItemModal({ open: false, item: null, prefill: null });
    showToast(itemModal.item ? "Item updated" : "Item added");
  };
  const onDeleteItem = (id) => {
    setState(s => ({ ...s, items: s.items.filter(i => i.id !== id) }));
    setItemModal({ open: false, item: null, prefill: null });
    showToast("Item deleted");
  };
  const onMoveItem = (id, catId, bandId) => {
    setState(s => ({
      ...s,
      items: s.items.map(i => i.id === id ? { ...i, catId, bands: [bandId] } : i)
    }));
    showToast("Item moved");
  };

  // ── Selection ─────────────────────────────────────────
  const onToggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const onClearSelection = () => setSelected(new Set());
  const onSelectAll = () => setSelected(new Set(state.items.map(i => i.id)));
  const onDeleteSelected = () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} selected item${selected.size > 1 ? "s" : ""}?`)) return;
    setState(s => ({ ...s, items: s.items.filter(i => !selected.has(i.id)) }));
    setSelected(new Set());
    showToast(`Deleted ${selected.size} item${selected.size > 1 ? "s" : ""}`);
  };

  const buildSelectedExport = (kind) => {
    const picked = state.items.filter(i => selected.has(i.id));
    if (kind === "json") {
      // include only categories & bands that selected items reference
      const usedCats  = new Set(picked.map(i => i.catId));
      const usedBands = new Set(picked.flatMap(i => i.bands));
      const subset = {
        title: state.title + " (selection)",
        sourceTemplate: state.templateId,
        exportedAt: new Date().toISOString(),
        categories: state.categories.filter(c => usedCats.has(c.id)),
        bands: state.bands.filter(b => usedBands.has(b.id)),
        items: picked
      };
      return JSON.stringify(subset, null, 2);
    }
    if (kind === "csv") {
      const head = ["Name","Layer","Time bands","PESTLE","Description"].join(",");
      const esc = v => `"${String(v||"").replace(/"/g,'""')}"`;
      const rows = picked.map(i => {
        const cat  = state.categories.find(c => c.id === i.catId);
        const blab = i.bands.map(b => state.bands.find(x => x.id === b)?.label).filter(Boolean).join(" / ");
        return [esc(i.name), esc(cat?.label || ""), esc(blab), esc((i.pestle||[]).join(" ")), esc(i.description || "")].join(",");
      });
      return [head, ...rows].join("\n");
    }
    if (kind === "text") {
      const byCat = {};
      picked.forEach(i => {
        const cat = state.categories.find(c => c.id === i.catId);
        const k = cat?.label || "Unknown";
        (byCat[k] ||= []).push(i);
      });
      let out = `# ${state.title} — selected items (${picked.length})\n\n`;
      Object.entries(byCat).forEach(([cat, items]) => {
        out += `## ${cat}\n`;
        items.forEach(i => {
          const bl = i.bands.map(b => state.bands.find(x => x.id === b)?.label).filter(Boolean).join(" → ");
          out += `  - ${i.name}${bl ? `  (${bl})` : ""}${i.pestle?.length ? `  [${i.pestle.join(", ")}]` : ""}\n`;
          if (i.description) out += `      ${i.description}\n`;
        });
        out += "\n";
      });
      return out;
    }
    return "";
  };

  const onExportSelected = (kind) => {
    if (!selected.size) return;
    const payload = buildSelectedExport(kind);
    setShowExport({ open: true, kind, payload });
  };

  const downloadExport = () => {
    const ext  = showExport.kind === "json" ? "json" : showExport.kind === "csv" ? "csv" : "txt";
    const mime = showExport.kind === "json" ? "application/json" : showExport.kind === "csv" ? "text/csv" : "text/plain";
    const blob = new Blob([showExport.payload], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.title.replace(/[^\w\-]+/g,"_")}_selection.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast("Downloaded");
  };
  const copyExport = () => {
    navigator.clipboard.writeText(showExport.payload).then(
      () => showToast("Copied to clipboard"),
      () => showToast("Couldn't copy — select & ⌘C")
    );
  };

  const onSaveStructure = (cats, bands) => {
    setState(s => ({
      ...s,
      categories: cats,
      bands,
      // drop items whose layer or all bands no longer exist
      items: s.items
        .filter(i => cats.some(c => c.id === i.catId))
        .map(i => ({ ...i, bands: i.bands.filter(b => bands.some(bb => bb.id === b)) }))
        .filter(i => i.bands.length > 0)
    }));
    setShowStructure(false);
    showToast("Structure updated");
  };

  const onJump = (stepId) => {
    setCoachStep(stepId);
    if (stepId === "first-item" || stepId === "all-layers" || stepId === "span") {
      // open the add-item modal at the first empty layer
      const cat = state.categories.find(c => !state.items.some(i => i.catId === c.id)) || state.categories[0];
      setItemModal({ open: true, item: null, prefill: { catId: cat.id, bandId: state.bands[0].id } });
    } else if (stepId === "structure") {
      setShowStructure(true);
    } else if (stepId === "export") {
      doExport();
    }
  };

  const doExport = () => {
    const data = JSON.stringify(state, null, 2);
    navigator.clipboard.writeText(data).then(
      () => showToast("JSON copied to clipboard"),
      () => showToast("Press ⌘C — couldn't auto-copy")
    );
  };

  const doReset = () => {
    if (!confirm("Reset to start screen? Your current roadmap is autosaved and you can re-load it from the start screen if needed.")) return;
    setPhase("start");
  };

  // ── Render ────────────────────────────────────────────
  if (phase === "start") {
    return <>
      <StartScreen onStart={handleStart} onImport={() => setShowImport(true)} />
      <TemplatePicker open={showTplPicker} onClose={() => setShowTplPicker(false)} onPick={handlePickTemplate} />
      <ImportModal open={showImport} onClose={() => setShowImport(false)} onLoad={handleImport} />
      <Toast on={toast.on} message={toast.msg} />
      <TweaksPanel title="Tweaks">
        <TweakSection title="Onboarding">
          <TweakToggle label="Show first-time helper banner" value={tweaks.showFirstTimeBanner} onChange={v => setTweak("showFirstTimeBanner", v)} />
        </TweakSection>
      </TweaksPanel>
    </>;
  }

  // builder
  const tpl = `${tweaks.showCoachRail ? "296px" : "0px"} 1fr`;

  return (
    <>
      <div className="app" style={{ gridTemplateColumns: tpl }}>
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">D</div>
            <div className="brand-name">DDRM<em>builder</em></div>
          </div>
          <div className="crumbs">
            <span className="sep">/</span>
            <input
              className="title-input"
              value={state.title}
              onChange={e => updateState({ title: e.target.value })}
              placeholder="Untitled Roadmap"
            />
          </div>
          <div className="topbar-spacer" />
          <button
            className={`btn btn-ghost btn-sm ${tweaks.showCoachRail ? "pressed" : ""}`}
            onClick={() => setTweak("showCoachRail", !tweaks.showCoachRail)}
            title="Toggle Roadmap Coach (left rail)"
          >
            <Icon name="lightbulb" size={14} /> Coach
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowGloss(true)}>
            <Icon name="book" size={14} /> Glossary
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowStructure(true)}>
            <Icon name="edit" size={14} /> Structure
          </button>
          <button className="btn btn-ghost btn-sm" onClick={doExport}>
            <Icon name="download" size={14} /> Export JSON
          </button>
          <button className="btn btn-ghost btn-sm" onClick={doReset}>
            <Icon name="undo" size={14} /> New
          </button>
          <button className="btn btn-accent btn-sm" onClick={() => setItemModal({ open: true, item: null, prefill: null })}>
            <Icon name="plus" size={14} /> Add item
          </button>
        </header>

        {tweaks.showCoachRail && (
          <CoachRail
            state={state}
            currentStep={coachStep}
            onJump={onJump}
            onShowGlossary={() => setShowGloss(true)}
          />
        )}

        <main className="canvas">
          <div className="canvas-inner">
            <div className="canvas-header">
              <div className="canvas-title-block">
                <div className="eyebrow">Roadmap</div>
                <h1 className="canvas-title">{state.title}</h1>
                <p className="canvas-sub">
                  {state.categories.length} layers <span style={{ color: "var(--ink-faint)" }}>·</span> {state.bands.length} time bands <span style={{ color: "var(--ink-faint)" }}>·</span> {state.items.length} items
                  {state.templateId === "industrial-digital" && (
                    <> <span style={{ color: "var(--ink-faint)" }}>·</span> based on Digital Industry review (อุตสาหกรรมดิจิทัล)</>
                  )}
                </p>
              </div>
              <div className="canvas-actions">
                <button className="btn" onClick={() => setShowStructure(true)}>
                  <Icon name="edit" size={14} /> Edit layers & bands
                </button>
              </div>
            </div>

            {/* First-time banner */}
            {tweaks.showFirstTimeBanner && state.items.length > 0 && state.items.length < 5 && (
              <div className="first-time-banner">
                <div className="ftb-icon"><Icon name="sparkles" size={18} /></div>
                <div className="ftb-body">
                  <div className="ftb-title">You're building it. Click any chip to edit, or any empty cell to add.</div>
                  <div className="ftb-sub">
                    Watch the <b>Roadmap Coach</b> on the left — it shows what to do next. Hover the <span className="info-dot" data-tip="Like this!">?</span> icons whenever a term feels unfamiliar.
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={() => setTweak("showFirstTimeBanner", false)} title="Dismiss">
                  <Icon name="x" size={14} />
                </button>
              </div>
            )}

            {/* Selection bar */}
            {selected.size > 0 && (
              <div className="sel-bar">
                <span className="sel-count">{selected.size}</span>
                <span>item{selected.size > 1 ? "s" : ""} selected</span>
                <button className="btn btn-quiet btn-sm" onClick={onSelectAll}>
                  Select all ({state.items.length})
                </button>
                <span className="spacer" />
                <button className="btn btn-sm" onClick={() => onExportSelected("json")}>
                  <Icon name="download" size={13} /> JSON
                </button>
                <button className="btn btn-sm" onClick={() => onExportSelected("csv")}>
                  <Icon name="download" size={13} /> CSV
                </button>
                <button className="btn btn-sm" onClick={() => onExportSelected("text")}>
                  <Icon name="download" size={13} /> Text
                </button>
                <button className="btn btn-sm" onClick={onDeleteSelected} style={{ color: "var(--c-rose)", borderColor: "color-mix(in oklch, var(--c-rose) 30%, white)" }}>
                  <Icon name="trash" size={13} /> Delete
                </button>
                <button className="btn btn-quiet btn-sm" onClick={onClearSelection} title="Clear selection">
                  <Icon name="x" size={13} />
                </button>
              </div>
            )}

            <RoadmapGrid
              state={state}
              currentStep={coachStep}
              onAddItem={onAddItem}
              onEditItem={onEditItem}
              onMoveItem={onMoveItem}
              selected={selected}
              onToggleSelect={onToggleSelect}
            />

            {/* Footer hint */}
            <div style={{ marginTop: 22, padding: "14px 18px", fontSize: 12.5, color: "var(--ink-muted)", textAlign: "center", lineHeight: 1.6 }}>
              Tip: <b>Click the small checkbox</b> on any chip to select. <span className="kbd">⌘A</span> select all · <span className="kbd">Esc</span> clear · <span className="kbd">Del</span> remove. Drag chips to move them. Toggle the <b>Coach</b> button to hide the left rail.
            </div>
          </div>
        </main>
      </div>

      <ItemModal
        open={itemModal.open}
        item={itemModal.item}
        prefill={itemModal.prefill}
        categories={state.categories}
        bands={state.bands}
        onClose={() => setItemModal({ open: false, item: null, prefill: null })}
        onSave={onSaveItem}
        onDelete={onDeleteItem}
      />
      <GlossaryModal open={showGloss} onClose={() => setShowGloss(false)} />
      <StructureModal
        open={showStructure}
        state={state}
        onSave={onSaveStructure}
        onClose={() => setShowStructure(false)}
      />

      {/* Export-selected preview */}
      {showExport.open && (
        <div className="backdrop on" onClick={() => setShowExport({ open: false, kind: null, payload: "" })}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">Export {selected.size} selected item{selected.size > 1 ? "s" : ""}</div>
                <div className="modal-sub">
                  Format: <b style={{ textTransform: "uppercase" }}>{showExport.kind}</b>. Preview below — copy to clipboard or download as a file.
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowExport({ open: false, kind: null, payload: "" })}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="modal-body">
              <pre style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                padding: 14,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                lineHeight: 1.6,
                color: "var(--ink-2)",
                maxHeight: "50vh",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
              }}>{showExport.payload}</pre>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowExport({ open: false, kind: null, payload: "" })}>Close</button>
              <button className="btn" onClick={copyExport}><Icon name="share" size={13} /> Copy</button>
              <button className="btn btn-accent" onClick={downloadExport}>
                <Icon name="download" size={13} /> Download .{showExport.kind === "json" ? "json" : showExport.kind === "csv" ? "csv" : "txt"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast on={toast.on} message={toast.msg} />

      <TweaksPanel title="Tweaks">
        <TweakSection title="Onboarding">
          <TweakToggle label="Show Roadmap Coach (left rail)" value={tweaks.showCoachRail} onChange={v => setTweak("showCoachRail", v)} />
          <TweakToggle label="Show first-time banner above grid" value={tweaks.showFirstTimeBanner} onChange={v => setTweak("showFirstTimeBanner", v)} />
        </TweakSection>
        <TweakSection title="Density">
          <TweakRadio
            label="Spacing"
            value={tweaks.density}
            onChange={v => setTweak("density", v)}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact",     label: "Compact" }
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
