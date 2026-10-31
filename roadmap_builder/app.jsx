/* global React, ReactDOM, SourceStore, SourceWorkspace, Icon, Logo, InfoDot, StartScreen, TemplatePicker, LibraryPage, useRoadmapFolders, RoadmapPage, ItemModal, GlossaryModal, ImportModal, StructureModal, ImpactAdvisor, HistoryPage, Landing, RoadmapHistory, AdvisorUtils, Toast, GLOSSARY, TEMPLATES, buildFromTemplate */
const LEGACY_STORAGE_KEY = "ddrm_v1";
const ROADMAPS_KEY = "ddrm_roadmaps_v1";
const TOAST_DURATION_MS = 2200;
const UNDO_LIMIT = 30;

// Who made a change: one stable id per browser (there are no user accounts).
const HISTORY_ACTOR = (() => {
  let id = null;
  try { id = localStorage.getItem("ddrm_actor_id"); if (!id) localStorage.setItem("ddrm_actor_id", id = `u_${crypto.randomUUID()}`); } catch {}
  return { id, name: id ? `Browser ${id.slice(-4)}` : null };
})();

function createRoadmapId() {
  return `rm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeRecord(state, id = createRoadmapId(), updatedAt = new Date().toISOString()) {
  return {
    id,
    title: titleOf(state),
    createdAt: updatedAt,
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
        createdAt: r.createdAt || r.updatedAt || null,
        folderId: r.folderId || null,
        pinned: !!r.pinned,
        state: isValidRoadmapState(r.state) ? { ...r.state, title: titleOf(r.state) } : r.state,
        history: Array.isArray(r.history) ? r.history : []
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

function go(path) {
  window.location.hash = path;
}

function useHashRoute() {
  const [route, setRoute] = React.useState(() => parseRoute(window.location.hash));
  React.useEffect(() => {
    let previousHash = window.location.hash;
    const onHashChange = () => {
      if (window.sourceNavigationGuard && !window.sourceNavigationGuard()) {
        history.replaceState(null, '', previousHash); return;
      }
      previousHash = window.location.hash;
      setRoute(parseRoute(window.location.hash));
    };
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

  // opts: { tone: "error", action: { label, onClick }, duration }. Text stays while the toast fades out.
  const showToast = React.useCallback((msg, opts = {}) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ on: true, msg, ...opts });
    timerRef.current = setTimeout(() => {
      setToast(t => ({ ...t, on: false }));
      timerRef.current = null;
    }, opts.duration || (opts.tone === "error" ? 5000 : durationMs));
  }, [durationMs]);

  return [toast, showToast];
}

function remapSourceIds(state, ids) {
  const pairs = Object.entries(ids || {}).filter(([from, to]) => from !== to);
  if (!pairs.length) return state;
  const remap = text => text && pairs.reduce((out, [from, to]) => out.split(from).join(to), text);
  return { ...state, items: state.items.map(item => item.notes || item.advice
    ? { ...item, notes: remap(item.notes), advice: remap(item.advice) } : item) };
}

// Saves text as a file through a temporary link.
function downloadFile(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
const fileSafe = title => titleOf({ title }).replace(/[^\w\-]+/g, "_");

const APP_TABS = [["roadmap", "Roadmap", "", "grid"], ["sources", "Sources", "/sources", "book"], ["impact", "News Impact", "/impact", "search"], ["history", "History", "/history", "clock"]];
// Desktop pages scroll inside these panes, not the window.
const APP_SCROLLERS = ".rmp, .rmp .main, .srcp .layout, .srcp .list, .srcp .detail, .nip .layout, .nip .main, .history-page, .sources-shell";

// Header on every page: where you are (breadcrumbs) and, inside a roadmap, its sections (tabs).
// Page actions never live here.
function AppBar({ record, tab, page }) {
  const base = record ? `#/roadmaps/${encodeURIComponent(record.id)}` : "";
  const current = record ? record.title : page;
  const headerRef = React.useRef(null);
  const tabsRef = React.useRef(null);
  const lastTab = React.useRef(tab);
  const [indicator, setIndicator] = React.useState(null);
  const [animate, setAnimate] = React.useState(false);
  const [hover, setHover] = React.useState(null);
  const [condensed, setCondensed] = React.useState(false);

  const measure = key => {
    const el = tabsRef.current?.querySelector(`[data-k="${key}"]`);
    return el ? { x: el.offsetLeft, w: el.offsetWidth } : null;
  };

  React.useLayoutEffect(() => { setIndicator(measure(tab)); }, [tab, !!record]);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    const remeasure = () => setIndicator(measure(tab));
    window.addEventListener("resize", remeasure);
    document.fonts?.ready.then(remeasure);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", remeasure); };
  }, [tab]);

  // Slide the new page in by tab order. Animating the mounted elements, not re-keying them, keeps News Impact's state.
  React.useLayoutEffect(() => {
    const from = APP_TABS.findIndex(t => t[0] === lastTab.current);
    const to = APP_TABS.findIndex(t => t[0] === tab);
    lastTab.current = tab;
    if (from < 0 || to < 0 || from === to) return;
    setCondensed(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dx = to > from ? 28 : -28;
    [...headerRef.current.parentElement.children]
      .filter(el => el !== headerRef.current && getComputedStyle(el).position !== "fixed")
      .forEach(el => el.animate([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: "none" }], { duration: 400, easing: "cubic-bezier(.3,.8,.2,1)" }));
  }, [tab]);

  // Only pages with tabs condense: without them nothing would be left of the bar.
  React.useEffect(() => {
    if (!record) { setCondensed(false); return undefined; }
    const onScroll = e => {
      const el = e.target === document ? document.scrollingElement : e.target;
      if (el !== document.scrollingElement && !el.matches(APP_SCROLLERS)) return;
      const top = el.scrollTop;
      setCondensed(was => (top > 24 ? true : top < 4 ? false : was)); // gap between the two stops flicker as the bar resizes the pane
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [!!record]);

  const onTabKey = e => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const [key, , path] = APP_TABS[(APP_TABS.findIndex(t => t[0] === tab) + step + APP_TABS.length) % APP_TABS.length];
    window.location.hash = `${base}${path}`;
    tabsRef.current.querySelector(`[data-k="${key}"]`).focus();
  };
  const hovered = hover && hover !== tab ? measure(hover) : null;

  return (
    <header className={`appbar${condensed ? " condensed" : ""}${record ? "" : " no-tabs"}`} ref={headerRef}>
      <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <div className="appbar-row"><div><div className="appbar-row-in">
        <a className="brand" href="#/" title="Home">
          <Logo sparks />
          <div className="brand-name">Data Driven<em>Roadmap</em></div>
        </a>
        <div className="appbar-divider" />
        <nav aria-label="Breadcrumb">
          <ol className="crumbs">
            {current
              ? <><li><a className="crumb-link" href="#/roadmaps">Roadmaps</a></li><li className="here" aria-current="page">{current}</li></>
              : <li className="here" aria-current="page">Roadmaps</li>}
          </ol>
        </nav>
      </div></div></div>
      {record && (
        <div className="appbar-row2">
          <div className="appbar-mini" aria-hidden={!condensed}><div><div className="appbar-mini-in">
            <a href="#/roadmaps" title="Back to roadmaps" tabIndex={condensed ? 0 : -1}><Logo size={22} /></a>
            <div className="appbar-mini-title" title={record.title}>{record.title}</div>
            <div className="appbar-divider" />
          </div></div></div>
          <nav className="appbar-tabs" ref={tabsRef} aria-label="Roadmap sections" onKeyDown={onTabKey} onMouseLeave={() => setHover(null)}>
            <div className={`appbar-ghost${hovered ? " show" : ""}`} style={hovered ? { transform: `translateX(${hovered.x}px)`, width: hovered.w } : undefined} />
            {indicator && <div className={`appbar-ind${animate ? " anim" : ""}`} style={{ transform: `translateX(${indicator.x}px)`, width: indicator.w }} />}
            {APP_TABS.map(([key, label, path, icon]) => (
              <a key={key} data-k={key} href={`${base}${path}`} className={tab === key ? "on" : ""} aria-label={label} aria-current={tab === key ? "page" : undefined}
                tabIndex={tab === key ? 0 : -1} onMouseEnter={() => setHover(key)}>
                <Icon name={icon} size={14} /><span>{label}</span>
              </a>
            ))}
          </nav>
          <div className="appbar-progress" key={tab}><i /></div>
        </div>
      )}
    </header>
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

  const [showCoach, setShowCoach] = React.useState(true);

  const [state, setState] = React.useState(null);
  const [stateRoadmapId, setStateRoadmapId] = React.useState(null);
  const [saveError, setSaveError] = React.useState("");
  const [folders, setFolders] = useRoadmapFolders();
  const [showImport, setShowImport] = React.useState(false);
  const [showGloss, setShowGloss] = React.useState(false);
  const [showStructure, setShowStructure] = React.useState(false);
  const [itemModal, setItemModal] = React.useState({ open: false, item: null, prefill: null });
  const [sourceFocus, setSourceFocus] = React.useState(null); // source to open when History links to Sources
  const [toast, showToast] = useToast();
  const [exported, setExported] = React.useState(false); // coach step "Export or share", this session only
  const [selected, setSelected] = React.useState(new Set());
  const [showExport, setShowExport] = React.useState({ open: false, kind: null, payload: "" });
  const [assess, setAssess] = React.useState({ id: null, ids: [] }); // sources ticked for News Impact, per roadmap

  const activeRecord = route.id ? roadmaps.find(r => r.id === route.id) : null;
  React.useEffect(() => {
    if (route.view === "empty") { document.title = "Data Driven Roadmap | Keep your technology roadmap alive"; return; }
    const page = route.view === "roadmaps" ? "Your roadmaps" : route.picker ? "Template library" : route.view === "new" ? "New roadmap"
      : activeRecord ? `${activeRecord.title} - ${route.tab === "sources" ? "Sources" : route.tab === "impact" ? "News Impact" : route.tab === "history" ? "History" : "Roadmap"}` : "Not found";
    document.title = `${page} | Data Driven Roadmap`;
  }, [route.view, route.tab, route.picker, activeRecord?.title]);
  const routeImportOpen = route.view === "builder" && route.action === "import";

  // All collection mutations route through here so persistence is never forgotten.
  // Declared before effects that depend on it to avoid TDZ on the dep-array read.
  const roadmapsRef = React.useRef(roadmaps);
  const updateRoadmaps = React.useCallback((mutate) => {
    let next;
    if (loadError) next = mutate(roadmapsRef.current);
    else {
      let storage;
      try { storage = localStorage; } catch {}
      const saved = RoadmapStorage.update(storage, ROADMAPS_KEY, roadmapsRef.current, mutate);
      next = saved.roadmaps;
      setSaveError(saved.error);
    }
    roadmapsRef.current = next;
    setRoadmaps(next);
  }, [loadError]);

  React.useEffect(() => {
    if (loadError) setSaveError("Saved roadmaps could not be read. Automatic saving is disabled to preserve the existing data. Export new work before leaving.");
  }, [loadError]);

  // Another tab saved: adopt its collection so this tab never writes stale data back.
  const externalSyncRef = React.useRef(false);
  React.useEffect(() => {
    if (loadError) return;
    const onStorage = e => {
      if (e.key !== ROADMAPS_KEY) return;
      const latest = RoadmapStorage.read(localStorage, ROADMAPS_KEY);
      if (!latest) return;
      externalSyncRef.current = true;
      roadmapsRef.current = latest;
      setRoadmaps(latest);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadError]);

  React.useEffect(() => {
    if (!saveError) return;
    const warn = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveError]);

  React.useEffect(() => {
    if (route.view === "empty" && migratedId) go(`/roadmaps/${encodeURIComponent(migratedId)}`);
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

  // The open roadmap was edited in another tab: show that version (every change here is already saved).
  const skipPersistRef = React.useRef(false);
  React.useEffect(() => {
    const mode = externalSyncRef.current;
    if (!mode) return;
    externalSyncRef.current = false;
    if (!activeRecord || route.id !== stateRoadmapId || !state) return;
    if (JSON.stringify(activeRecord.state) === JSON.stringify({ ...state, title: titleOf(state) })) return;
    skipPersistRef.current = true;
    undoStackRef.current = [];
    setState(activeRecord.state);
    if (mode !== "silent") showToast("Updated with changes from another tab");
  }, [roadmaps]);

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

  // Persist current builder state into the collection on every change, logging item changes to its history.
  // historyBaseRef holds the last persisted state: the "before" of the next history entry.
  // historyOriginRef tags the next saved change with what caused it; anything untagged is a person's edit.
  const historyBaseRef = React.useRef(null);
  const historyOriginRef = React.useRef(null);
  React.useEffect(() => {
    if (skipPersistRef.current) { skipPersistRef.current = false; historyBaseRef.current = { id: route.id, state }; return; }
    if (!RoadmapStorage.canPersist(route, stateRoadmapId, state)) return;
    // Opening a roadmap is not an edit: keep its "last edited" time until the state really changes.
    if (state === roadmapsRef.current.find(r => r.id === route.id)?.state) { historyBaseRef.current = { id: route.id, state }; return; }
    const base = historyBaseRef.current, origin = historyOriginRef.current || { origin: "user" };
    historyOriginRef.current = null;
    const entries = base?.id === route.id
      ? RoadmapHistory.diff(base.state, state, { ...origin, roadmapId: route.id, actorId: HISTORY_ACTOR.id, actorName: HISTORY_ACTOR.name })
      : [];
    historyBaseRef.current = { id: route.id, state };
    updateRoadmaps(prev => prev.map(record => record.id === route.id
      ? { ...record, title: titleOf(state), updatedAt: new Date().toISOString(), state: { ...state, title: titleOf(state) }, history: RoadmapHistory.append(record.history, entries) }
      : record
    ));
  }, [state, stateRoadmapId, route.view, route.id, updateRoadmaps]);

  // Copy unsynced history to the server's durable store. Retries on the next change or History visit;
  // the server ignores events it already has, so a repeat after a lost response is harmless.
  const historySyncRef = React.useRef(false);
  const syncHistory = React.useCallback(async () => {
    if (historySyncRef.current) return;
    const pending = roadmapsRef.current.map(r => ({ id: r.id, events: (r.history || []).filter(e => !e.synced) })).filter(r => r.events.length);
    if (!pending.length) return;
    historySyncRef.current = true;
    try {
      const done = new Set();
      for (const r of pending) {
        for (let i = 0; i < r.events.length; i += 500) {
          const batch = r.events.slice(i, i + 500);
          const res = await fetch(`${RoadmapHistory.url(r.id)}/events`, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events: batch.map(RoadmapHistory.indexed) }) });
          if (!res.ok) throw new Error(`History service answered ${res.status}`);
          batch.forEach(e => done.add(e.event_id || e.id));
        }
      }
      if (done.size) updateRoadmaps(prev => prev.map(r => r.history?.some(e => done.has(e.event_id || e.id)) ? { ...r, history: RoadmapHistory.markSynced(r.history, done) } : r));
    } catch { /* service offline: the browser copy stays unsynced and is retried later */ }
    finally { historySyncRef.current = false; }
  }, [updateRoadmaps]);
  React.useEffect(() => { syncHistory(); }, [roadmaps, syncHistory]);

  // Keyboard shortcuts: Cmd/Ctrl+A select all, Esc clear, Delete remove
  React.useEffect(() => {
    if (route.view !== "builder" || route.tab || !state || !isValidRoadmapState(state)) return;
    const handler = (e) => {
      const tag = e.target?.tagName;
      const editing = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      // Never act on the hidden roadmap behind a dialog; also stop the browser's own undo from editing fields behind it.
      if (document.querySelector('[aria-modal="true"]')) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !editing) e.preventDefault();
        return;
      }
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
        onDeleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [route.view, route.tab, state, selected, showExport.open, itemModal.open, undo]);

  const addRoadmap = (roadmapState, extra) => {
    const record = { ...makeRecord(roadmapState), ...extra };
    updateRoadmaps(prev => [record, ...prev]);
    go(`/roadmaps/${encodeURIComponent(record.id)}`);
    return record;
  };

  const openRoadmap = (id) => go(`/roadmaps/${encodeURIComponent(id)}`);
  const duplicateRoadmap = (id) => {
    const record = roadmaps.find(r => r.id === id);
    if (!record || !isValidRoadmapState(record.state)) {
      showToast("Roadmap data is invalid.", { tone: "error" });
      return;
    }
    const copyState = JSON.parse(JSON.stringify(record.state));
    copyState.title = `${titleOf(copyState)} copy`;
    const copy = { ...makeRecord(copyState), folderId: record.folderId || null };
    updateRoadmaps(prev => [copy, ...prev]);
    SourceStore.exportRoadmap(id)
      .then(library => library.sources.length ? SourceStore.importRoadmap(copy.id, library).then(ids => {
        updateRoadmaps(prev => prev.map(r => r.id === copy.id ? { ...r, state: remapSourceIds(r.state, ids) } : r));
        showToast(`Roadmap duplicated with ${library.sources.length} source${library.sources.length === 1 ? "" : "s"}`);
      }) : showToast("Roadmap duplicated"))
      .catch(e => showToast(`Roadmap duplicated, but its sources could not be copied (${e.message})`, { tone: "error" }));
  };
  // Confirmed by the library page. Sources go first so a storage failure never leaves orphaned sources behind a deleted roadmap.
  const deleteRoadmaps = async (ids) => {
    const removed = [];
    for (const id of ids) {
      const record = roadmapsRef.current.find(r => r.id === id);
      if (!record) continue;
      try { const library = await SourceStore.exportRoadmap(id); await SourceStore.removeRoadmap(id); removed.push({ record, library }); }
      catch (e) { showToast(`"${record.title}" kept: its sources could not be deleted (${e.message})`, { tone: "error" }); }
    }
    if (!removed.length) return;
    const gone = new Set(removed.map(x => x.record.id));
    updateRoadmaps(prev => prev.filter(r => !gone.has(r.id)));
    if (gone.has(route.id)) go("/roadmaps");
    if (removed.length < ids.length) return; // the error toast above stays visible
    // shortcut: the undo copy lives in memory only, so it is lost if the page closes before Undo.
    let undone = false;
    // The server copy of the change history goes too, once Undo is no longer offered.
    // shortcut: if the page closes or the service is offline within these 10 s, that history stays on the server.
    setTimeout(() => { if (!undone) removed.forEach(({ record }) => fetch(RoadmapHistory.url(record.id), { method: "DELETE" }).catch(() => {})); }, 10500);
    showToast(removed.length === 1 ? `Deleted "${removed[0].record.title}"` : `Deleted ${removed.length} roadmaps`, { duration: 10000, action: { label: "Undo", onClick: async () => {
      undone = true;
      try {
        for (const { record, library } of removed) await SourceStore.importRoadmap(record.id, library, { keepIds: true });
        updateRoadmaps(prev => [...removed.map(x => x.record).filter(r => !prev.some(p => p.id === r.id)), ...prev]);
        showToast(removed.length === 1 ? "Roadmap restored" : `${removed.length} roadmaps restored`);
      } catch (e) { showToast(`Could not restore (${e.message})`, { tone: "error" }); }
    } } });
  };
  const patchRoadmaps = (ids, change) => updateRoadmaps(prev => prev.map(r => ids.includes(r.id) ? { ...r, ...(typeof change === "function" ? change(r) : change) } : r));
  // Library backup: the roadmap with its sources, in the format Import reads.
  const exportRoadmapFile = async (id) => {
    const record = roadmapsRef.current.find(r => r.id === id);
    if (!record || !isValidRoadmapState(record.state)) { showToast("Roadmap data is invalid.", { tone: "error" }); return; }
    try {
      const ddrmSources = await SourceStore.exportRoadmap(id);
      const withSources = ddrmSources.sources.length > 0;
      downloadFile(`${fileSafe(record.title)}${withSources ? "_with_sources" : ""}.json`, JSON.stringify(withSources ? { ...record.state, ddrmSources } : record.state, null, 2), "application/json");
      showToast(withSources ? `Downloaded with ${ddrmSources.sources.length} source${ddrmSources.sources.length === 1 ? "" : "s"}` : "Downloaded");
    } catch (e) { showToast(`Could not export the sources (${e.message})`, { tone: "error" }); }
  };

  const handleStart = (kind) => {
    if (kind === "templates") go("/roadmaps/new/templates");
    else if (kind === "blank") {
      addRoadmap(buildFromTemplate("blank"));
      showToast("Blank roadmap created");
    }
  };

  const handlePickTemplate = (id, { title, folderId } = {}) => {
    const record = addRoadmap({ ...buildFromTemplate(id), ...(title && { title }) }, { folderId: folderId || null });
    const tpl = TEMPLATES.find(t => t.id === id);
    showToast(`Loaded "${tpl.name}" - ${record.state.items.length || 0} items pre-filled`);
  };

  const handleImport = (data) => {
    // No object-rest syntax: in-browser Babel emits a global helper name that collides across scripts.
    const ddrmSources = data.ddrmSources, roadmapState = { ...data, ddrmSources: undefined };
    const record = addRoadmap({ ...roadmapState, templateId: roadmapState.templateId || "imported" });
    setShowImport(false);
    if (!ddrmSources) { showToast("Roadmap imported"); return; }
    SourceStore.importRoadmap(record.id, ddrmSources)
      .then(ids => {
        externalSyncRef.current = "silent"; // the open builder must pick up the remapped notes
        updateRoadmaps(prev => prev.map(r => r.id === record.id ? { ...r, state: remapSourceIds(r.state, ids) } : r));
        showToast(`Roadmap imported with ${ddrmSources.sources.length} source${ddrmSources.sources.length === 1 ? "" : "s"}`);
      })
      .catch(e => showToast(`Roadmap imported without its sources: ${e.message}`, { tone: "error" }));
  };

  const closeRouteImport = () => {
    if (route.id) go(`/roadmaps/${encodeURIComponent(route.id)}`);
  };

  // Builder handlers

  const onAddItem = (catId, bandId) => setItemModal({ open: true, item: null, prefill: catId ? { catId, bandId } : null });
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
  // Moving keeps how many bands the item covers; the page works out which ones.
  const onMoveItem = (id, catId, bands) => {
    setState(s => ({
      ...s,
      items: s.items.map(i => i.id === id ? { ...i, catId, bands } : i)
    }));
    showToast("Item moved", { action: { label: "Undo", onClick: undo } });
  };

  const onToggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const onDeleteSelected = async () => {
    if (!selected.size) return;
    const label = `${selected.size} item${selected.size > 1 ? "s" : ""}`;
    if (!await confirmDeletion({ title: `Delete ${label}?`, body: "This removes them from the roadmap. You can undo it with Ctrl+Z.",
      names: state.items.filter(i => selected.has(i.id)).map(i => i.name), confirmLabel: `Delete ${label}` })) return;
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

  const saveFile = (content, mime, suffix, ext) => {
    downloadFile(`${fileSafe(state.title)}${suffix}.${ext}`, content, mime);
    setExported(true);
    showToast("Downloaded");
  };
  const downloadExport = () => {
    const format = EXPORT_FORMATS[showExport.kind];
    if (format) saveFile(showExport.payload, format.mime, showExport.wholeRoadmap ? "" : "_selection", format.ext);
  };
  const downloadWithSources = async () => {
    try { saveFile(JSON.stringify({ ...state, ddrmSources: await SourceStore.exportRoadmap(route.id) }), "application/json", "_with_sources", "json"); }
    catch (e) { showToast(`Could not export the sources (${e.message})`, { tone: "error" }); }
  };
  const copyExport = () => {
    navigator.clipboard.writeText(showExport.payload).then(
      () => { setExported(true); showToast("Copied to clipboard"); },
      () => showToast("Couldn't copy - select the text and press Ctrl+C", { tone: "error" })
    );
  };

  const onSaveStructure = (cats, bands) => {
    const removed = state.items.length - state.items.filter(i => cats.some(c => c.id === i.catId) && i.bands.some(b => bands.some(bb => bb.id === b))).length;
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
    showToast(removed ? `Structure updated · ${removed} item${removed === 1 ? "" : "s"} deleted` : "Structure updated",
      removed ? { duration: 8000, action: { label: "Undo", onClick: undo } } : {});
  };

  const onJump = (stepId) => {
    const firstEmpty = state.categories.find(c => !state.items.some(i => i.catId === c.id)) || state.categories[0];
    if (stepId === "name") document.getElementById("roadmap-title")?.focus();
    else if (stepId === "structure") setShowStructure(true);
    else if (["first-item", "all-layers", "span"].includes(stepId) && firstEmpty && state.bands[0]) setItemModal({ open: true, item: null, prefill: { catId: firstEmpty.id, bandId: state.bands[0].id } });
    else if (stepId === "tag") { const it = state.items.find(i => !(i.pestle || []).length); if (it) onEditItem(it.id); }
    else if (stepId === "export") doExport();
  };

  const printRoadmap = () => { setExported(true); setTimeout(() => window.print(), 50); };
  const copyRoadmapText = () => {
    const text = [state.title, "", ...state.categories.map(c => [c.label.toUpperCase(), ...state.items.filter(i => i.catId === c.id).map(i => {
      const labels = i.bands.map(id => state.bands.find(b => b.id === id)?.label).filter(Boolean);
      return `  • ${i.name}${labels.length ? ` (${labels.length > 1 ? `${labels[0]} – ${labels[labels.length - 1]}` : labels[0]})` : ""}`;
    })].join("\n"))].join("\n\n");
    navigator.clipboard.writeText(text).then(() => { setExported(true); showToast("Roadmap copied as text"); },
      () => showToast("Couldn't copy. Use Export, then Copy.", { tone: "error" }));
  };

  const doExport = () => {
    setShowExport({ open: true, kind: "json", payload: JSON.stringify(state, null, 2), wholeRoadmap: true });
  };

  const applyGuidanceNotes = (items, result) => {
    if (!items.length) return;
    historyOriginRef.current = { origin: "advisor", run: result };
    const byId = Object.fromEntries(items.map(item => [item.item_id, item]));
    const verdict = result?.verdict || "Review";
    const noteFor = (entry) => SourceLogic.attribution(result, entry) + formatGuidanceNote(entry, verdict);
    // Same run + source revision + advice is already on the item: adding it again would only duplicate it.
    const isNew = item => byId[item.id] && !`${item.advice || ""}\n${item.notes || ""}`.includes(noteFor(byId[item.id]));
    const added = state.items.filter(isNew).length;
    if (!added) { showToast("This advice is already on the selected items"); return; }
    setState(s => ({
      ...s,
      items: s.items.map(item => {
        if (!isNew(item)) return item;
        const note = noteFor(byId[item.id]);
        // Legacy items keep old advice in their notes: separate it before appending.
        const text = item.advice == null ? AdvisorUtils.splitLegacyNotes(item.notes) : { notes: item.notes, advice: item.advice };
        const existing = text.advice || "";
        return {
          ...item,
          reviewNeeded: true,
          lastImpactVerdict: verdict,
          notes: text.notes,
          advice: existing ? `${existing}\n\n${note}` : note
        };
      })
    }));
    showToast(`Added advice to ${added} item${added === 1 ? "" : "s"}${added < items.length ? ` (${items.length - added} already had it)` : ""}`, {
      duration: 6000, action: { label: "Open roadmap", onClick: () => go(`/roadmaps/${encodeURIComponent(route.id)}`) } });
  };

  if (route.view === "empty") {
    return (
      <>
        <Landing savedCount={roadmaps.length} />
        <Toast on={toast.on} message={toast.msg} tone={toast.tone} action={toast.action} />
      </>
    );
  }

  if (route.view === "roadmaps" || route.view === "new") {
    return (
      <div className="page-shell">
        {saveError && <p role="alert" className="storage-warning">{saveError}</p>}
        <AppBar page={route.view === "roadmaps" ? undefined : route.picker ? "Template library" : "New roadmap"} />
        {route.view === "roadmaps"
          ? <LibraryPage roadmaps={roadmaps} folders={folders} setFolders={setFolders} loadError={loadError} storageKey={ROADMAPS_KEY}
              onOpen={openRoadmap} onNew={() => go("/roadmaps/new")} onImport={() => setShowImport(true)} onDuplicate={duplicateRoadmap}
              onDelete={deleteRoadmaps} onExport={exportRoadmapFile} onPatch={patchRoadmaps} showToast={showToast} />
          : <StartScreen onStart={handleStart} onImport={() => setShowImport(true)} />}
        <TemplatePicker open={!!route.picker} onClose={() => go("/roadmaps/new")} onPick={handlePickTemplate} folders={folders} roadmaps={roadmaps} />
        <ImportModal open={showImport} onClose={() => setShowImport(false)} onLoad={handleImport} />
        <Toast on={toast.on} message={toast.msg} tone={toast.tone} action={toast.action} />
      </div>
    );
  }

  if (route.view !== "builder" || !route.id || !activeRecord) {
    return (
      <>
        <AppBar page="Not found" />
        <RouteError
          title="Roadmap not found"
          body="This route does not match a saved roadmap."
          onAction={() => go("/roadmaps")}
        />
        <Toast on={toast.on} message={toast.msg} tone={toast.tone} action={toast.action} />
      </>
    );
  }

  if (!state || !isValidRoadmapState(state)) {
    return (
      <>
        <AppBar page="Invalid roadmap" />
        <RouteError
          title="Roadmap data is invalid"
          body="This saved roadmap is missing required layers, bands, or items."
          onAction={() => go("/roadmaps")}
        />
        <Toast on={toast.on} message={toast.msg} tone={toast.tone} action={toast.action} />
      </>
    );
  }

  const tab = route.tab || "roadmap";
  const base = `/roadmaps/${encodeURIComponent(route.id)}`;
  const assessIds = assess.id === route.id ? assess.ids : [];

  return (
    <div className="page-shell">
      {saveError && <p role="alert" className="storage-warning">{saveError}</p>}
      <AppBar record={activeRecord} tab={tab} />
      {tab === "sources" && <SourceWorkspace key={`sources-${route.id}`} roadmapId={route.id} focusId={sourceFocus} onFocused={() => setSourceFocus(null)}
        onAssess={ids => { setAssess({ id: route.id, ids }); go(`${base}/impact`); }} />}
      <ImpactAdvisor key={`impact-${route.id}`} open={tab === "impact"} roadmapId={route.id} state={state} onApplyGuidance={applyGuidanceNotes}
        sourceIds={assessIds} onSourceIds={ids => setAssess({ id: route.id, ids })} onManageSources={() => go(`${base}/sources`)} />
      {tab === "history" && <HistoryPage roadmapId={route.id} title={state.title} history={activeRecord.history || []} items={state.items}
        actorId={HISTORY_ACTOR.id} onSync={syncHistory}
        onOpenItem={id => { const it = state.items.find(i => i.id === id); if (it) { go(base); setItemModal({ open: true, item: it, prefill: null }); } }}
        onOpenSource={id => { setSourceFocus(id); go(`${base}/sources`); }} />}
      {tab === "roadmap" && <>
      <RoadmapPage state={state} setState={setState} selected={selected} setSelected={setSelected}
        showCoach={showCoach} setShowCoach={setShowCoach} exported={exported} onJump={onJump}
        onShowGlossary={() => setShowGloss(true)} onImport={() => go(`${base}/import`)} onExport={doExport} onPrint={printRoadmap} onCopyText={copyRoadmapText}
        onStructure={() => setShowStructure(true)} undo={undo} canUndo={canUndo} onAddItem={onAddItem} onEditItem={onEditItem} onMoveItem={onMoveItem}
        onDeleteSelected={onDeleteSelected} onExportSelected={onExportSelected} showToast={showToast} />

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
        <Dialog onClose={() => setShowExport({ open: false, kind: null, payload: "" })} label="Export" className="modal-lg">
            <div className="modal-head">
              <div>
                <div className="modal-title">{showExport.wholeRoadmap ? "Export roadmap" : `Export ${selected.size} selected item${selected.size > 1 ? "s" : ""}`}</div>
                <div className="modal-sub">
                  Format: <b style={{ textTransform: "uppercase" }}>{showExport.kind}</b>. Preview below - copy to clipboard or download as a file.
                  {showExport.wholeRoadmap && <> To back up or move the Sources library too, use <b>Download with sources</b> and import that file on the other browser.</>}
                </div>
              </div>
              <button className="modal-close" aria-label="Close" onClick={() => setShowExport({ open: false, kind: null, payload: "" })}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="modal-body">
              <pre style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                padding: 14,
                fontFamily: "'DM Mono', monospace",
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
              {showExport.wholeRoadmap && <button className="btn" onClick={downloadWithSources}>
                <Icon name="download" size={13} /> Download with sources
              </button>}
              <button className="btn btn-accent" onClick={downloadExport}>
                <Icon name="download" size={13} /> Download .{showExport.kind === "json" ? "json" : showExport.kind === "csv" ? "csv" : "txt"}
              </button>
            </div>
        </Dialog>
      )}

      </>}
      {/* Outside the tab fragment so Sources and News Impact show toasts too. */}
      <Toast on={toast.on} message={toast.msg} tone={toast.tone} action={toast.action} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
