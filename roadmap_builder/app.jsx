/* global React, ReactDOM, Icon, InfoDot, StartScreen, TemplatePicker, CoachRail, RoadmapGrid, ItemModal, GlossaryModal, ImportModal, StructureModal, ImpactAdvisor, Toast, GLOSSARY, TEMPLATES, buildFromTemplate, TweaksPanel, useTweaks, TweakSection, TweakToggle, TweakRadio */
const LEGACY_STORAGE_KEY = "ddrm_v1";
const ROADMAPS_KEY = "ddrm_roadmaps_v1";
const TOAST_DURATION_MS = 2200;
const UNDO_LIMIT = 30;

function createRoadmapId() {
  return `rm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function titleOf(state) {
  return (state?.title || "").trim() || "Untitled Roadmap";
}

function isValidRoadmapState(state) {
  return !!state
    && typeof state === "object"
    && !Array.isArray(state)
    && Array.isArray(state.categories)
    && Array.isArray(state.bands)
    && Array.isArray(state.items);
}

function makeRecord(state, id = createRoadmapId(), updatedAt = new Date().toISOString()) {
  return {
    id,
    title: titleOf(state),
    updatedAt,
    state: { ...state, title: titleOf(state) }
  };
}

function saveRoadmapCollection(roadmaps) {
  let storage;
  try { storage = localStorage; } catch {}
  return RoadmapStorage.save(storage, ROADMAPS_KEY, roadmaps);
}

function loadRoadmapCollection() {
  let loadError = false;
  let migratedId = null;
  let roadmaps = [];

  try {
    const raw = localStorage.getItem(ROADMAPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.roadmaps)) throw new Error("Bad roadmap collection");
      roadmaps = parsed.roadmaps.filter(r => r && r.id).map(r => ({
        id: String(r.id),
        title: titleOf(r.state),
        updatedAt: r.updatedAt || new Date().toISOString(),
        state: isValidRoadmapState(r.state) ? { ...r.state, title: titleOf(r.state) } : r.state
      }));
    }
  } catch {
    loadError = true;
    roadmaps = [];
  }

  if (!roadmaps.length && !loadError) {
    try {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        if (isValidRoadmapState(legacy)) {
          const record = makeRecord(legacy);
          roadmaps = [record];
          migratedId = record.id;
          saveRoadmapCollection(roadmaps);
        }
      }
    } catch {}
  }

  return { roadmaps, loadError, migratedId };
}

function parseRoute(hash) {
  const path = (hash || "").replace(/^#/, "");
  if (!path) return { view: "empty" };

  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "roadmaps") return { view: "not-found" };
  if (parts.length === 1) return { view: "roadmaps" };
  if (parts.length === 2 && parts[1] === "new") return { view: "new" };
  if (parts.length === 2) return { view: "builder", id: decodeURIComponent(parts[1]) };
  if (parts.length === 3 && parts[2] === "import") {
    return { view: "builder", id: decodeURIComponent(parts[1]), action: "import" };
  }
  return { view: "not-found" };
}

function go(path) {
  window.location.hash = path;
}

function useHashRoute() {
  const [route, setRoute] = React.useState(() => parseRoute(window.location.hash));
  React.useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}

// Single source for transient status messages. Timer cleared on unmount and
// on every new message so overlapping toasts don't dismiss each other early.
function useToast(durationMs = TOAST_DURATION_MS) {
  const [toast, setToast] = React.useState({ on: false, msg: "" });
  const timerRef = React.useRef(null);

  React.useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const showToast = React.useCallback((msg) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ on: true, msg });
    timerRef.current = setTimeout(() => {
      setToast({ on: false, msg: "" });
      timerRef.current = null;
    }, durationMs);
  }, [durationMs]);

  return [toast, showToast];
}

// Build CSV/JSON/text payloads for the "export selection" modal.
// Kept module-level (pure) so they're trivially testable and don't capture
// stale closures from the App component.
//
// TEST MIRROR: `roadmap_builder/lib/exports.js` carries an ESM copy of these
// helpers + `formatGuidanceNote`, `titleOf`, `isValidRoadmapState`, `parseRoute`.
// Vitest imports the mirror. If you change behaviour here, update the mirror
// or tests will silently lock the OLD behaviour.
function csvEscape(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function buildSelectionJson(state, picked) {
  const usedCats = new Set(picked.map(i => i.catId));
  const usedBands = new Set(picked.flatMap(i => i.bands));
  return JSON.stringify({
    title: `${state.title} (selection)`,
    sourceTemplate: state.templateId,
    exportedAt: new Date().toISOString(),
    categories: state.categories.filter(c => usedCats.has(c.id)),
    bands: state.bands.filter(b => usedBands.has(b.id)),
    items: picked
  }, null, 2);
}

function buildSelectionCsv(state, picked) {
  const head = ["Name", "Layer", "Time bands", "PESTLE", "Description"].join(",");
  const rows = picked.map(item => {
    const cat = state.categories.find(c => c.id === item.catId);
    const bandLabels = item.bands
      .map(bid => state.bands.find(b => b.id === bid)?.label)
      .filter(Boolean)
      .join(" / ");
    return [
      csvEscape(item.name),
      csvEscape(cat?.label || ""),
      csvEscape(bandLabels),
      csvEscape((item.pestle || []).join(" ")),
      csvEscape(item.description || "")
    ].join(",");
  });
  return [head, ...rows].join("\n");
}

function buildSelectionText(state, picked) {
  const groups = picked.reduce((acc, item) => {
    const cat = state.categories.find(c => c.id === item.catId);
    const key = cat?.label || "Unknown";
    (acc[key] ||= []).push(item);
    return acc;
  }, {});

  let out = `# ${state.title} - selected items (${picked.length})\n\n`;
  Object.entries(groups).forEach(([catLabel, items]) => {
    out += `## ${catLabel}\n`;
    items.forEach(item => {
      const arrow = item.bands
        .map(bid => state.bands.find(b => b.id === bid)?.label)
        .filter(Boolean)
        .join(" -> ");
      const tags = item.pestle?.length ? `  [${item.pestle.join(", ")}]` : "";
      out += `  - ${item.name}${arrow ? `  (${arrow})` : ""}${tags}\n`;
      if (item.description) out += `      ${item.description}\n`;
    });
    out += "\n";
  });
  return out;
}

const EXPORT_FORMATS = {
  json: { ext: "json", mime: "application/json", build: buildSelectionJson },
  csv:  { ext: "csv",  mime: "text/csv",         build: buildSelectionCsv },
  text: { ext: "txt",  mime: "text/plain",       build: buildSelectionText }
};

// Format an Impact Advisor entry into note text. Supports both new
// (multi-expert advices array) and legacy (single suggested_change) shapes.
function formatGuidanceNote(entry, verdict) {
  const lines = [];
  if (Array.isArray(entry.advices) && entry.advices.length > 0) {
    const expertNoun = entry.advices.length === 1 ? "expert" : "experts";
    lines.push(`Impact review (${verdict}) — ${entry.advices.length} ${expertNoun}:`);
    entry.advices.forEach(a => {
      const role = a.role || "Advisor";
      const action = a.action ? ` (${a.action})` : "";
      lines.push(`  [${role}${action}] ${a.advice || ""}`);
      if (a.evidence_basis) lines.push(`    Evidence: ${a.evidence_basis}`);
    });
  } else {
    lines.push(`Impact review (${verdict}): ${entry.suggested_change || ""}`);
    if (entry.evidence_basis) lines.push(`Evidence: ${entry.evidence_basis}`);
  }
  return lines.filter(Boolean).join("\n");
}

function formatUpdatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function RoadmapList({ roadmaps, loadError, onNew, onOpen, onDuplicate, onDelete }) {
  return (
    <div className="list-shell">
      <div className="list-topbar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div className="brand-name">DDRM Builder<em>beta</em></div>
        </div>
        <button className="btn btn-accent" onClick={onNew}>
          <Icon name="plus" size={14} /> New roadmap
        </button>
      </div>

      <main className="list-main">
        <div className="list-header">
          <div>
            <div className="eyebrow">Roadmaps</div>
            <h1>Your roadmaps</h1>
            <p>Open, duplicate, or delete local roadmaps saved in this browser.</p>
          </div>
          <div className="list-count">{roadmaps.length}</div>
        </div>

        {loadError && (
          <div className="route-error route-error-inline">
            <Icon name="info" size={16} />
            Saved roadmaps could not be loaded.
          </div>
        )}

        {roadmaps.length === 0 ? (
          <div className="empty-list">
            <Icon name="grid" size={30} />
            <h2>No roadmaps yet</h2>
            <p>Create one from a template, blank canvas, or imported JSON.</p>
            <button className="btn btn-accent" onClick={onNew}>
              <Icon name="plus" size={14} /> New roadmap
            </button>
          </div>
        ) : (
          <div className="roadmap-list">
            {roadmaps.map(record => {
              const state = record.state || {};
              const itemCount = Array.isArray(state.items) ? state.items.length : 0;
              const layerCount = Array.isArray(state.categories) ? state.categories.length : 0;
              const bandCount = Array.isArray(state.bands) ? state.bands.length : 0;
              const template = state.templateId || "custom";

              return (
                <article className="roadmap-row" key={record.id}>
                  <button className="roadmap-row-main" onClick={() => onOpen(record.id)}>
                    <div className="roadmap-row-icon"><Icon name="grid" size={18} /></div>
                    <div>
                      <h2>{record.title || "Untitled Roadmap"}</h2>
                      <p>
                        {itemCount} items · {layerCount} layers · {bandCount} bands · {template}
                      </p>
                      <span>Updated {formatUpdatedAt(record.updatedAt)}</span>
                    </div>
                  </button>
                  <div className="roadmap-row-actions">
                    <button className="btn btn-sm" onClick={() => onOpen(record.id)}>
                      Open
                    </button>
                    <button className="btn btn-sm" onClick={() => onDuplicate(record.id)}>
                      <Icon name="redo" size={13} /> Duplicate
                    </button>
                    <button className="btn btn-sm danger" onClick={() => onDelete(record.id)}>
                      <Icon name="trash" size={13} /> Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <div className="start-footer">
        <span>DDRM Builder · local roadmaps</span>
      </div>
    </div>
  );
}

function RouteError({ title, body, actionLabel = "Back to roadmaps", onAction }) {
  return (
    <div className="route-error-screen">
      <div className="route-error-card">
        <div className="route-error-icon"><Icon name="info" size={20} /></div>
        <h1>{title}</h1>
        <p>{body}</p>
        <button className="btn btn-accent" onClick={onAction}>{actionLabel}</button>
      </div>
    </div>
  );
}

function App() {
  const route = useHashRoute();
  const initialCollection = React.useMemo(() => loadRoadmapCollection(), []);
  const [roadmaps, setRoadmaps] = React.useState(initialCollection.roadmaps);
  const [loadError] = React.useState(initialCollection.loadError);
  const migratedId = initialCollection.migratedId;

  // Tweaks: density / coach visibility / band-style
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "density": "comfortable",
    "showCoachRail": true,
    "showFirstTimeBanner": true,
    "bandStyle": "gradient"
  }/*EDITMODE-END*/);

  const [state, setState] = React.useState(null);
  const [stateRoadmapId, setStateRoadmapId] = React.useState(null);
  const [saveError, setSaveError] = React.useState("");
  const [showTplPicker, setShowTplPicker] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [showGloss, setShowGloss] = React.useState(false);
  const [showStructure, setShowStructure] = React.useState(false);
  const [showImpactAdvisor, setShowImpactAdvisor] = React.useState(false);
  const [itemModal, setItemModal] = React.useState({ open: false, item: null, prefill: null });
  const [toast, showToast] = useToast();
  const [coachStep, setCoachStep] = React.useState("name");
  const [selected, setSelected] = React.useState(new Set());
  const [showExport, setShowExport] = React.useState({ open: false, kind: null, payload: "" });

  const activeRecord = route.id ? roadmaps.find(r => r.id === route.id) : null;
  const routeImportOpen = route.view === "builder" && route.action === "import";

  // All collection mutations route through here so persistence is never forgotten.
  // Declared before effects that depend on it to avoid TDZ on the dep-array read.
  const updateRoadmaps = React.useCallback((mutate) => {
    setRoadmaps(mutate);
  }, []);

  React.useEffect(() => {
    if (loadError) {
      setSaveError("Saved roadmaps could not be read. Automatic saving is disabled to preserve the existing data. Export new work before leaving.");
      return;
    }
    setSaveError(saveRoadmapCollection(roadmaps));
  }, [roadmaps, loadError]);

  React.useEffect(() => {
    if (!saveError) return;
    const warn = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveError]);

  React.useEffect(() => {
    if (route.view === "empty") {
      go(migratedId ? `/roadmaps/${encodeURIComponent(migratedId)}` : "/roadmaps");
    }
  }, [route.view, migratedId]);

  React.useEffect(() => {
    if (loadError) showToast("Saved roadmaps could not be loaded.");
  }, [loadError]);

  React.useEffect(() => {
    if (route.view !== "builder" || !activeRecord) {
      setState(null);
      setStateRoadmapId(null);
      setSelected(new Set());
      undoStackRef.current = [];
      setCanUndo(false);
      return;
    }
    setState(activeRecord.state);
    setStateRoadmapId(route.id);
    setSelected(new Set());
    undoStackRef.current = [];
    setCanUndo(false);
  }, [route.view, route.id]);

  // Simple undo: keep last N state snapshots, single-step pop on Ctrl+Z
  const undoStackRef = React.useRef([]);
  const skipUndoPushRef = React.useRef(false);
  const [canUndo, setCanUndo] = React.useState(false);

  React.useEffect(() => {
    if (!state || !isValidRoadmapState(state)) return;
    if (skipUndoPushRef.current) { skipUndoPushRef.current = false; return; }
    const stack = undoStackRef.current;
    stack.push(state);
    if (stack.length > UNDO_LIMIT) stack.shift();
    setCanUndo(stack.length > 1);
  }, [state]);

  const undo = React.useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length < 2) return;
    stack.pop(); // discard current
    const prev = stack[stack.length - 1];
    skipUndoPushRef.current = true;
    setState(prev);
    setCanUndo(stack.length > 1);
    showToast("Undo");
  }, []);

  // Persist current builder state into the collection on every change.
  React.useEffect(() => {
    if (!RoadmapStorage.canPersist(route, stateRoadmapId, state)) return;
    updateRoadmaps(prev => prev.map(record => record.id === route.id
      ? { ...record, title: titleOf(state), updatedAt: new Date().toISOString(), state: { ...state, title: titleOf(state) } }
      : record
    ));
  }, [state, stateRoadmapId, route.view, route.id, updateRoadmaps]);

  // figure out current step based on data
  React.useEffect(() => {
    if (!state || !isValidRoadmapState(state)) return;
    if (state.title === "Untitled Roadmap") setCoachStep("name");
    else if (state.items.length === 0) setCoachStep("first-item");
    else if (!state.categories.every(c => state.items.some(i => i.catId === c.id))) setCoachStep("all-layers");
    else if (!state.items.some(i => i.bands.length > 1)) setCoachStep("span");
    else if (!state.items.some(i => (i.pestle || []).length > 0)) setCoachStep("tag");
    else setCoachStep("export");
  }, [state]);

  // Keyboard shortcuts: Cmd/Ctrl+A select all, Esc clear, Delete remove
  React.useEffect(() => {
    if (route.view !== "builder" || !state || !isValidRoadmapState(state)) return;
    const handler = (e) => {
      const tag = e.target?.tagName;
      const editing = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !editing && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !editing) {
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
  }, [route.view, state, selected, showExport.open, itemModal.open, undo]);

  const addRoadmap = (roadmapState) => {
    const record = makeRecord(roadmapState);
    updateRoadmaps(prev => [record, ...prev]);
    go(`/roadmaps/${encodeURIComponent(record.id)}`);
    return record;
  };

  const openRoadmap = (id) => go(`/roadmaps/${encodeURIComponent(id)}`);
  const duplicateRoadmap = (id) => {
    const record = roadmaps.find(r => r.id === id);
    if (!record || !isValidRoadmapState(record.state)) {
      showToast("Roadmap data is invalid.");
      return;
    }
    const copyState = JSON.parse(JSON.stringify(record.state));
    copyState.title = `${titleOf(copyState)} copy`;
    const copy = makeRecord(copyState);
    updateRoadmaps(prev => [copy, ...prev]);
    showToast("Roadmap duplicated");
  };
  const deleteRoadmap = (id) => {
    const record = roadmaps.find(r => r.id === id);
    if (!record) return;
    if (!confirm(`Delete "${record.title || "Untitled Roadmap"}"? This cannot be undone.`)) return;
    updateRoadmaps(prev => prev.filter(r => r.id !== id));
    if (route.id === id) go("/roadmaps");
    showToast("Roadmap deleted");
  };

  const handleStart = (kind) => {
    if (kind === "templates") setShowTplPicker(true);
    else if (kind === "blank") {
      addRoadmap(buildFromTemplate("blank"));
      showToast("Blank roadmap created");
    }
  };

  const handlePickTemplate = (id) => {
    const record = addRoadmap(buildFromTemplate(id));
    setShowTplPicker(false);
    const tpl = TEMPLATES.find(t => t.id === id);
    showToast(`Loaded "${tpl.name}" - ${record.state.items.length || 0} items pre-filled`);
  };

  const handleImport = (data) => {
    addRoadmap({ ...data, templateId: data.templateId || "imported" });
    setShowImport(false);
    showToast("Roadmap imported");
  };

  const closeRouteImport = () => {
    if (route.id) go(`/roadmaps/${encodeURIComponent(route.id)}`);
  };

  // Builder handlers
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

  const onExportSelected = (kind) => {
    if (!selected.size) return;
    const format = EXPORT_FORMATS[kind];
    if (!format) return;
    const picked = state.items.filter(i => selected.has(i.id));
    setShowExport({ open: true, kind, payload: format.build(state, picked) });
  };

  const downloadExport = () => {
    const format = EXPORT_FORMATS[showExport.kind];
    if (!format) return;
    const blob = new Blob([showExport.payload], { type: format.mime });
    const url = URL.createObjectURL(blob);
    const safeTitle = state.title.replace(/[^\w\-]+/g, "_");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}${showExport.wholeRoadmap ? "" : "_selection"}.${format.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Downloaded");
  };
  const copyExport = () => {
    navigator.clipboard.writeText(showExport.payload).then(
      () => showToast("Copied to clipboard"),
      () => showToast("Couldn't copy - select & Ctrl+C")
    );
  };

  const onSaveStructure = (cats, bands) => {
    setState(s => ({
      ...s,
      categories: cats,
      bands,
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
      const cat = state.categories.find(c => !state.items.some(i => i.catId === c.id)) || state.categories[0];
      setItemModal({ open: true, item: null, prefill: { catId: cat.id, bandId: state.bands[0].id } });
    } else if (stepId === "structure") {
      setShowStructure(true);
    } else if (stepId === "export") {
      doExport();
    }
  };

  const doExport = () => {
    setShowExport({ open: true, kind: "json", payload: JSON.stringify(state, null, 2), wholeRoadmap: true });
  };

  const applyGuidanceNotes = (items, result) => {
    if (!items.length) return;
    const byId = Object.fromEntries(items.map(item => [item.item_id, item]));
    const verdict = result?.verdict || "Review";
    setState(s => ({
      ...s,
      items: s.items.map(item => {
        const entry = byId[item.id];
        if (!entry) return item;
        const note = formatGuidanceNote(entry, verdict);
        const existingNotes = item.notes || "";
        return {
          ...item,
          reviewNeeded: true,
          lastImpactVerdict: verdict,
          notes: existingNotes ? `${existingNotes}\n\n${note}` : note
        };
      })
    }));
    showToast(`Added advice to ${items.length} item${items.length === 1 ? "" : "s"}`);
    setShowImpactAdvisor(false);
  };

  if (route.view === "empty") {
    return <Toast on={toast.on} message={toast.msg} />;
  }

  if (route.view === "roadmaps") {
    return (
      <>
        {saveError && <p role="alert" className="storage-warning">{saveError}</p>}
        <RoadmapList
          roadmaps={roadmaps}
          loadError={loadError}
          onNew={() => go("/roadmaps/new")}
          onOpen={openRoadmap}
          onDuplicate={duplicateRoadmap}
          onDelete={deleteRoadmap}
        />
        <Toast on={toast.on} message={toast.msg} />
      </>
    );
  }

  if (route.view === "new") {
    return <>
      {saveError && <p role="alert" className="storage-warning">{saveError}</p>}
      <StartScreen onStart={handleStart} onImport={() => setShowImport(true)} onRoadmaps={() => go("/roadmaps")} />
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

  if (route.view !== "builder" || !route.id || !activeRecord) {
    return (
      <>
        <RouteError
          title="Roadmap not found"
          body="This route does not match a saved roadmap."
          onAction={() => go("/roadmaps")}
        />
        <Toast on={toast.on} message={toast.msg} />
      </>
    );
  }

  if (!state || !isValidRoadmapState(state)) {
    return (
      <>
        <RouteError
          title="Roadmap data is invalid"
          body="This saved roadmap is missing required layers, bands, or items."
          onAction={() => go("/roadmaps")}
        />
        <Toast on={toast.on} message={toast.msg} />
      </>
    );
  }

  const tpl = `${tweaks.showCoachRail ? "296px" : "0px"} 1fr`;

  return (
    <>
      <div className="app" style={{ gridTemplateColumns: tpl }}>
        {saveError && <p role="alert" className="storage-warning">{saveError}</p>}
        <header className="topbar">
          <button className="brand brand-button" onClick={() => go("/roadmaps")} title="Back to roadmap list">
            <div className="brand-mark">D</div>
            <div className="brand-name">DDRM<em>builder</em></div>
          </button>
          <div className="crumbs">
            <button className="crumb-link" onClick={() => go("/roadmaps")}>Roadmaps</button>
            <span className="sep">/</span>
            <input
              className="title-input"
              value={state.title}
              onChange={e => updateState({ title: e.target.value })}
              placeholder="Untitled Roadmap"
            />
          </div>
          <div className="topbar-spacer" />

          {/* Group 1 — view / help (lowest priority) */}
          <button
            className={`btn btn-ghost btn-sm ${tweaks.showCoachRail ? "pressed" : ""}`}
            onClick={() => setTweak("showCoachRail", !tweaks.showCoachRail)}
            title="Toggle Roadmap Coach (left rail)"
          >
            <Icon name="lightbulb" size={14} /> Coach
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowGloss(true)} title="Open glossary">
            <Icon name="book" size={14} /> Glossary
          </button>

          <div className="topbar-divider" aria-hidden="true" />

          {/* Group 2 — file ops (infrequent) */}
          <button className="btn btn-ghost btn-sm" onClick={() => go("/roadmaps/new")} title="Create a new roadmap">
            <Icon name="plus" size={14} /> New
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => go(`/roadmaps/${encodeURIComponent(route.id)}/import`)} title="Import roadmap JSON">
            <Icon name="import" size={14} /> Import
          </button>
          <button className="btn btn-ghost btn-sm" onClick={doExport} title="Export current roadmap as JSON">
            <Icon name="download" size={14} /> Export
          </button>

          <div className="topbar-divider" aria-hidden="true" />

          {/* Group 3 — edit (frequent) */}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowStructure(true)} title="Edit layers & bands">
            <Icon name="edit" size={14} /> Structure
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={undo}
            disabled={!canUndo}
            title={canUndo ? "Undo last change (Ctrl+Z)" : "Nothing to undo"}
          >
            <Icon name="undo" size={14} /> Undo
          </button>

          <div className="topbar-divider" aria-hidden="true" />

          {/* Group 4 — signature feature + primary CTA */}
          <button
            className="btn btn-feature btn-sm"
            onClick={() => setShowImpactAdvisor(true)}
            title="Assess news impact against this roadmap"
          >
            <Icon name="search" size={14} /> News Impact
          </button>
          <button
            className="btn btn-accent btn-sm"
            onClick={() => setItemModal({ open: true, item: null, prefill: null })}
            title="Add a new roadmap item"
          >
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
                    <> <span style={{ color: "var(--ink-faint)" }}>·</span> based on Digital Industry review</>
                  )}
                </p>
              </div>
              <div className="canvas-actions">
                <button className="btn" onClick={() => setShowStructure(true)}>
                  <Icon name="edit" size={14} /> Edit layers & bands
                </button>
              </div>
            </div>

            {tweaks.showFirstTimeBanner && state.items.length > 0 && state.items.length < 5 && (
              <div className="first-time-banner">
                <div className="ftb-icon"><Icon name="sparkles" size={18} /></div>
                <div className="ftb-body">
                  <div className="ftb-title">You're building it. Click any chip to edit, or any empty cell to add.</div>
                  <div className="ftb-sub">
                    Watch the <b>Roadmap Coach</b> on the left - it shows what to do next. Hover the <span className="info-dot" data-tip="Like this!">?</span> icons whenever a term feels unfamiliar.
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={() => setTweak("showFirstTimeBanner", false)} title="Dismiss">
                  <Icon name="x" size={14} />
                </button>
              </div>
            )}

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

            <div style={{ marginTop: 22, padding: "14px 18px", fontSize: 12.5, color: "var(--ink-muted)", textAlign: "center", lineHeight: 1.6 }}>
              Tip: <b>Click the small checkbox</b> on any chip to select. <span className="kbd">Ctrl+A</span> select all · <span className="kbd">Esc</span> clear · <span className="kbd">Del</span> remove. Drag chips to move them. Toggle the <b>Coach</b> button to hide the left rail.
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
      <ImportModal open={routeImportOpen} onClose={closeRouteImport} onLoad={handleImport} />

      {showExport.open && (
        <div className="backdrop on" onClick={() => setShowExport({ open: false, kind: null, payload: "" })}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">{showExport.wholeRoadmap ? "Export roadmap" : `Export ${selected.size} selected item${selected.size > 1 ? "s" : ""}`}</div>
                <div className="modal-sub">
                  Format: <b style={{ textTransform: "uppercase" }}>{showExport.kind}</b>. Preview below - copy to clipboard or download as a file.
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

      <ImpactAdvisor
        open={showImpactAdvisor}
        onClose={() => setShowImpactAdvisor(false)}
        state={state}
        onApplyGuidance={applyGuidanceNotes}
      />

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
