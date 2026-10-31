/* global React, Icon, Dialog, Select, RoadmapLibrary, SourceStore */
// library.jsx — the library pages' footer, roadmap folders, and "Your roadmaps"
// (folders, pin, multi-select, drag onto a folder to move). Roadmap folders are separate from the
// folders inside a roadmap's Sources library.

const LIB_FOLDERS_KEY = "ddrm_roadmap_folders_v1";
const LIB_PREFS_KEY = "ddrm_library_prefs";
const LIB_FOLDER_COLORS = ["var(--c-blue)", "var(--c-violet)", "var(--c-teal)", "var(--c-amber)", "var(--c-green)", "var(--c-slate)", "var(--c-red)"];
const LIB_MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘" : "Ctrl";
const libCount = n => `${n} roadmap${n === 1 ? "" : "s"}`;

function libReadFolders() {
  try {
    const list = JSON.parse(localStorage.getItem(LIB_FOLDERS_KEY));
    return Array.isArray(list) ? list.filter(f => f && f.id && typeof f.name === "string") : [];
  } catch { return []; }
}

// Folder list in localStorage; each roadmap record keeps its own folderId. Another tab's edits are adopted.
function useRoadmapFolders() {
  const [folders, setState] = React.useState(libReadFolders);
  const ref = React.useRef(folders);
  React.useEffect(() => {
    const onStorage = e => { if (e.key === LIB_FOLDERS_KEY) setState(ref.current = libReadFolders()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setFolders = React.useCallback(mutate => {
    const next = mutate(ref.current);
    ref.current = next;
    setState(next);
    // shortcut: a failed write (storage full or blocked) keeps folders for this page only; surface it if users hit it.
    try { localStorage.setItem(LIB_FOLDERS_KEY, JSON.stringify(next)); } catch {}
  }, []);
  return [folders, setFolders];
}

function libPrefs() {
  try { return JSON.parse(localStorage.getItem(LIB_PREFS_KEY)) || {}; } catch { return {}; }
}

function LibraryFooter() {
  return <footer className="lib-foot"><span>Data Driven Roadmap · local roadmaps</span><span>Saved in this browser</span></footer>;
}

// Miniature roadmap: up to 3 layers x 3 bands from RoadmapLibrary.thumb.
function LibThumb({ rows, size = "", idx = 0 }) {
  return (
    <div className={`lib-thumb ${size}`} aria-hidden="true" style={{ "--i": idx }}>
      {rows.map((row, r) => (
        <React.Fragment key={r}>
          <div className="lbl" style={{ borderLeftColor: row.color }} />
          {[0, 1, 2].map(c => {
            const n = row.cells[c] || 0;
            return <div key={c}>{n > 0 && <>
              <i style={{ background: row.color, "--d": `${(r * 3 + c) * 55 + 120}ms` }} />
              {n > 1 && <i className="f" style={{ background: row.color, width: "60%", "--d": `${(r * 3 + c) * 55 + 260}ms` }} />}
            </>}</div>;
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

// Closes a popover on Escape (without closing what is behind it) or a press outside `ref`.
function useDismiss(open, ref, close) {
  React.useEffect(() => {
    if (!open) return;
    const down = e => { if (!ref.current?.contains(e.target)) close(); };
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key, true); };
  }, [open]);
}

function LibMoveMenu({ ids, roadmaps, folders, onMove, onNewFolder }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  useDismiss(open, ref, () => setOpen(false));
  const picked = roadmaps.filter(r => ids.includes(r.id));
  return (
    <div className={`lib-mv ${open ? "open" : ""}`} ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <Icon name="move" size={13} />Move to<Icon name="chevron-down" size={11} className="chev" />
      </button>
      {open && (
        <div className="lib-mvpop" role="menu">
          <div className="mh">Move {libCount(ids.length)} to</div>
          {folders.map(f => {
            const n = roadmaps.filter(r => r.folderId === f.id).length, here = picked.every(r => r.folderId === f.id);
            return (
              <button key={f.id} type="button" role="menuitem" className={here ? "cur" : ""} style={{ "--fc": f.color }} aria-disabled={here}
                onClick={() => { if (!here) { onMove(f.id); setOpen(false); } }}>
                <span className="fi"><Icon name="folder" size={14} /></span>
                <span className="fn"><b>{f.name}</b><span>{libCount(n)}</span></span>
                {here ? <span className="here"><Icon name="check" size={11} strokeWidth={2.6} />Here</span> : <span className="go"><Icon name="arrow-right" size={13} /></span>}
              </button>
            );
          })}
          {picked.some(r => r.folderId) && (
            <button type="button" role="menuitem" style={{ "--fc": "var(--ink-muted)" }} onClick={() => { onMove(null); setOpen(false); }}>
              <span className="fi"><Icon name="inbox" size={14} /></span><span className="fn"><b>Unfiled</b><span>Remove from folder</span></span><span className="go"><Icon name="arrow-right" size={13} /></span>
            </button>
          )}
          {folders.length > 0 && <hr />}
          <button type="button" role="menuitem" className="nf" onClick={() => { setOpen(false); onNewFolder(); }}>
            <span className="fi"><Icon name="plus" size={13} /></span><span className="fn"><b>New folder…</b></span><span />
          </button>
        </div>
      )}
    </div>
  );
}

// Name a new folder or rename one.
function LibFolderDialog({ title, initial = "", action, onSave, onClose }) {
  const [name, setName] = React.useState(initial);
  const clean = name.trim();
  return (
    <Dialog onClose={onClose} label={title} className="lib-small">
      <form onSubmit={e => { e.preventDefault(); if (clean) onSave(clean); }}>
        <div className="modal-head"><div className="modal-title">{title}</div></div>
        <div className="modal-body">
          <label className="field">
            <span className="field-label">Folder name</span>
            <input className="field-input" autoFocus value={name} maxLength={60} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()} />
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-accent" disabled={!clean}>{action}</button>
        </div>
      </form>
    </Dialog>
  );
}

function LibraryPage({ roadmaps, folders, setFolders, loadError, storageKey, onOpen, onNew, onImport, onDuplicate, onDelete, onExport, onPatch, showToast }) {
  const L = RoadmapLibrary;
  const prefs = React.useMemo(libPrefs, []);
  const [folder, setFolder] = React.useState("all");
  const [view, setView] = React.useState(prefs.view === "list" ? "list" : "grid");
  const [sortKey, setSortKey] = React.useState(prefs.sort || "edited");
  const [q, setQ] = React.useState("");
  const [menu, setMenu] = React.useState(null);        // roadmap id whose ⋯ menu is open
  const [folderMenu, setFolderMenu] = React.useState(null);
  const [sel, setSel] = React.useState(() => new Set());
  const [drag, setDrag] = React.useState(null);        // ids being dragged
  const [over, setOver] = React.useState(null);        // folder under the pointer
  const [dialog, setDialog] = React.useState(null);    // { kind: "delete" | "folder-new" | "folder-rename" | "folder-delete", ... }
  const [sources, setSources] = React.useState({});    // roadmap id -> source count (null when unreadable)
  const last = React.useRef(null), ghost = React.useRef(null), menuRef = React.useRef(null), folderMenuRef = React.useRef(null);

  React.useEffect(() => { try { localStorage.setItem(LIB_PREFS_KEY, JSON.stringify({ view, sort: sortKey })); } catch {} }, [view, sortKey]);
  useDismiss(menu !== null, menuRef, () => setMenu(null));
  useDismiss(folderMenu !== null, folderMenuRef, () => setFolderMenu(null));

  const idKey = roadmaps.map(r => r.id).join();
  React.useEffect(() => {
    let live = true;
    Promise.all(roadmaps.map(r => SourceStore.list(r.id).then(d => [r.id, d.sources.length], () => [r.id, null])))
      .then(pairs => { if (live) setSources(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [idKey]);

  // A folder that no longer exists (deleted in another tab) shows everything.
  const folderObj = folders.find(f => f.id === folder);
  const current = folder === "all" || folder === "pinned" || folderObj ? folder : "all";
  const rows = L.sort(L.filter(roadmaps, current, q), sortKey);
  const visible = new Set(rows.map(r => r.id));
  const selIds = [...sel].filter(id => visible.has(id)); // hidden roadmaps are never acted on
  const count = id => L.filter(roadmaps, id).length;
  const label = current === "all" ? "All roadmaps" : current === "pinned" ? "Pinned" : folderObj.name;
  const folderName = id => folders.find(f => f.id === id)?.name;
  const totalSources = Object.values(sources).reduce((a, n) => a + (n || 0), 0);
  const recent = [...roadmaps].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const lastWhen = recent[0] && L.relTime(recent[0].updatedAt);
  let usedChars = 0;
  try { usedChars = (localStorage.getItem(storageKey) || "").length + (localStorage.getItem(LIB_FOLDERS_KEY) || "").length; } catch {}
  // shortcut: ~5 million characters is the usual per-site localStorage limit; read the real quota if a browser differs.
  const usedMb = usedChars / 1e6;
  // Source files live in IndexedDB, which this meter must include; the browser reports usage and quota for both.
  const [est, setEst] = React.useState(null);
  React.useEffect(() => { navigator.storage?.estimate?.().then(setEst, () => {}); }, [roadmaps.length, totalSources]);
  const fmt = b => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(b < 1e5 ? 2 : 1)} MB`;
  const usedPct = Math.min(100, Math.max(usedMb / 5 * 100, est?.quota ? est.usage / est.quota * 100 : 0));

  const anyDialog = () => !!document.querySelector('[aria-modal="true"]');
  React.useEffect(() => {
    const onKey = e => {
      if (anyDialog() || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key === "Escape" && sel.size) setSel(new Set());
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && rows.length) { e.preventDefault(); setSel(new Set(rows.map(r => r.id))); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggle = (id, range) => setSel(s => {
    const next = new Set(s);
    if (range && last.current) {
      const ids = rows.map(r => r.id), a = ids.indexOf(last.current), b = ids.indexOf(id);
      if (a > -1 && b > -1) { ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => next.add(x)); last.current = id; return next; }
    }
    next.has(id) ? next.delete(id) : next.add(id);
    last.current = id;
    return next;
  });

  // Folder and pin changes are undoable from the toast.
  const patch = (ids, change, msg) => {
    const before = Object.fromEntries(roadmaps.filter(r => ids.includes(r.id)).map(r => [r.id, { folderId: r.folderId || null, pinned: !!r.pinned }]));
    onPatch(ids, change);
    setSel(new Set());
    showToast(msg, { duration: 6000, action: { label: "Undo", onClick: () => { onPatch(Object.keys(before), r => before[r.id]); showToast("Undone"); } } });
  };
  const moveTo = (ids, fid) => {
    if (fid === "pinned") return patch(ids, { pinned: true }, `Pinned ${libCount(ids.length)}`);
    patch(ids, { folderId: fid }, fid ? `Moved ${libCount(ids.length)} to ${folderName(fid)}` : `Moved ${libCount(ids.length)} out of folders`);
  };
  const setPinned = (ids, pinned) => patch(ids, { pinned }, `${pinned ? "Pinned" : "Unpinned"} ${libCount(ids.length)}`);
  const askDelete = ids => setDialog({ kind: "delete", ids });

  const newFolder = (moveIds = []) => setDialog({ kind: "folder-new", moveIds });
  const saveNewFolder = (name, moveIds) => {
    const f = { id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, color: LIB_FOLDER_COLORS[folders.length % LIB_FOLDER_COLORS.length] };
    setFolders(prev => [...prev, f]);
    setDialog(null);
    if (moveIds.length) { onPatch(moveIds, { folderId: f.id }); setSel(new Set()); showToast(`Created "${name}" and moved ${libCount(moveIds.length)}`); }
    else showToast(`Created folder "${name}"`);
  };
  const deleteFolder = f => {
    const members = roadmaps.filter(r => r.folderId === f.id).map(r => r.id), at = folders.indexOf(f);
    setFolders(prev => prev.filter(x => x.id !== f.id));
    if (members.length) onPatch(members, { folderId: null });
    if (folder === f.id) setFolder("all");
    showToast(`Deleted folder "${f.name}"`, { duration: 6000, action: { label: "Undo", onClick: () => {
      setFolders(prev => prev.some(x => x.id === f.id) ? prev : [...prev.slice(0, at), f, ...prev.slice(at)]);
      if (members.length) onPatch(members, { folderId: f.id });
      showToast("Folder restored");
    } } });
  };

  const dnd = {
    start: (e, id) => {
      const ids = sel.has(id) ? selIds : [id];
      setDrag(ids);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", ids.join(","));
      if (ghost.current) { ghost.current.textContent = ids.length > 1 ? `Move ${ids.length} roadmaps` : "Move roadmap"; e.dataTransfer.setDragImage(ghost.current, 14, 14); }
    },
    end: () => { setDrag(null); setOver(null); },
    // While selecting, a click on a card toggles it; Ctrl/Cmd or Shift click selects without opening.
    click: (e, id) => {
      if (e.target.closest(".lib-ck, .lib-cfoot, .lib-menu, .lib-ract")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || sel.size) { e.preventDefault(); e.stopPropagation(); toggle(id, e.shiftKey); }
    }
  };
  const dropProps = id => ({
    onDragOver: e => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== id) setOver(id); },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(o => o === id ? null : o); },
    onDrop: e => { e.preventDefault(); if (drag) moveTo(drag, id); setDrag(null); setOver(null); }
  });

  const allOn = rows.length > 0 && selIds.length === rows.length, someOn = selIds.length > 0;
  const selPinned = selIds.length > 0 && selIds.every(id => roadmaps.find(r => r.id === id)?.pinned);
  const folderOptions = [["all", "All roadmaps"], ["pinned", "Pinned"], ...folders.map(f => [f.id, f.name])];

  const card = (r, i) => {
    const s = r.state || {}, on = sel.has(r.id), impact = L.impact(r, sources[r.id] ?? null);
    const open = () => onOpen(r.id);
    return (
      <article key={r.id} className={`lib-card ${on ? "sel" : ""} ${drag?.includes(r.id) ? "dragging" : ""}`} style={{ "--i": Math.min(i, 8) }}
        draggable="true" onDragStart={e => dnd.start(e, r.id)} onDragEnd={dnd.end} onClickCapture={e => dnd.click(e, r.id)}>
        <button type="button" className={`lib-ck ${on ? "on" : ""}`} role="checkbox" aria-checked={on} aria-label={`Select ${r.title}`}
          onClick={e => { e.stopPropagation(); toggle(r.id, e.shiftKey); }}>{on && <Icon name="check" size={12} strokeWidth={3} />}</button>
        <div className="lib-cthumb" onClick={open}><LibThumb rows={L.thumb(s)} idx={Math.min(i, 8)} /></div>
        <div className="lib-cbody">
          <div className="lib-ctitle">
            <h3><button type="button" onClick={open}>{r.title || "Untitled Roadmap"}</button></h3>
            {r.pinned && <span className="pin" title="Pinned"><Icon name="star" size={13} /></span>}
          </div>
          <div className="lib-stats">
            <span><Icon name="item" size={12} /><b>{s.items?.length || 0}</b> {s.items?.length === 1 ? "item" : "items"}</span>
            <span><Icon name="layers" size={12} /><b>{s.categories?.length || 0}</b> {s.categories?.length === 1 ? "layer" : "layers"}</span>
            <span><Icon name="cols" size={12} /><b>{s.bands?.length || 0}</b> bands</span>
            <span><Icon name="book" size={12} /><b>{sources[r.id] ?? "–"}</b> sources</span>
          </div>
          <dl className="lib-cmeta">
            <dt>Timeline</dt><dd>{L.timeline(s)}</dd>
            <dt>News impact</dt><dd><span className={`dot ${impact.tone}`} />{impact.label}</dd>
            {current !== r.folderId && folderName(r.folderId) && <><dt>Folder</dt><dd>{folderName(r.folderId)}</dd></>}
          </dl>
        </div>
        <div className="lib-cfoot">
          <span className="when"><Icon name="clock" size={12} /><b>Edited {L.relTime(r.updatedAt).replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase())}</b></span>
          <button type="button" className="btn btn-sm" onClick={open}><Icon name="open" size={12} />Open</button>
          <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label={`More actions for ${r.title}`} aria-haspopup="menu" aria-expanded={menu === r.id}
            onMouseDown={e => { if (menu === r.id) e.stopPropagation(); }} onClick={() => setMenu(menu === r.id ? null : r.id)}><Icon name="more" size={16} /></button>
        </div>
        {menu === r.id && (
          <div className="lib-menu" role="menu" ref={menuRef}>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); setPinned([r.id], !r.pinned); }}><Icon name="star" size={14} />{r.pinned ? "Unpin" : "Pin to top"}</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onDuplicate(r.id); }}><Icon name="copy" size={14} />Duplicate</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); toggle(r.id); }}><Icon name="move" size={14} />Select to move…</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onExport(r.id); }}><Icon name="download" size={14} />Export JSON</button>
            <hr />
            <button type="button" role="menuitem" className="del" onClick={() => { setMenu(null); askDelete([r.id]); }}><Icon name="trash" size={14} />Delete</button>
          </div>
        )}
      </article>
    );
  };

  const listRow = r => {
    const s = r.state || {}, on = sel.has(r.id), impact = L.impact(r, sources[r.id] ?? null);
    return (
      <div key={r.id} className={`lib-trow ${on ? "sel" : ""} ${drag?.includes(r.id) ? "dragging" : ""}`} draggable="true"
        onDragStart={e => dnd.start(e, r.id)} onDragEnd={dnd.end} onClickCapture={e => dnd.click(e, r.id)}>
        <button type="button" className={`lib-ck inl ${on ? "on" : ""}`} role="checkbox" aria-checked={on} aria-label={`Select ${r.title}`}
          onClick={e => { e.stopPropagation(); toggle(r.id, e.shiftKey); }}>{on && <Icon name="check" size={11} strokeWidth={3} />}</button>
        <div className="tname">
          <div className="ic"><Icon name="grid" size={15} /></div>
          <div><button type="button" className="tlink" onClick={() => onOpen(r.id)}>{r.title || "Untitled Roadmap"}</button>{r.pinned && <span className="pin" title="Pinned"><Icon name="star" size={11} /></span>}
            <span>{s.categories?.length || 0} layers · {s.bands?.length || 0} bands · {L.timeline(s)}</span></div>
        </div>
        <div className="fcell"><Icon name="folder" size={13} /><span>{folderName(r.folderId) || "Unfiled"}</span></div>
        <span className="num">{s.items?.length || 0} <span className="muted">· {sources[r.id] ?? "–"} src</span></span>
        <span><span className={`tag ${impact.tone}`}>{impact.label}</span></span>
        <span><b>{L.relTime(r.updatedAt)}</b><br /><span className="muted abs">{new Date(r.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span></span>
        <div className="lib-ract">
          <button type="button" className="btn btn-sm btn-ghost btn-icon" title="Duplicate" aria-label={`Duplicate ${r.title}`} onClick={() => onDuplicate(r.id)}><Icon name="copy" size={13} /></button>
          <button type="button" className="btn btn-sm btn-ghost btn-icon danger" title="Delete" aria-label={`Delete ${r.title}`} onClick={() => askDelete([r.id])}><Icon name="trash" size={13} /></button>
          <button type="button" className="btn btn-sm btn-ghost btn-icon" title="Open" aria-label={`Open ${r.title}`} onClick={() => onOpen(r.id)}><Icon name="arrow-right" size={13} /></button>
        </div>
      </div>
    );
  };

  const delNames = dialog?.kind === "delete" ? roadmaps.filter(r => dialog.ids.includes(r.id)).map(r => r.title) : [];

  return (
    <div className="lib-page">
      <div className="lib-layout">
        <aside className={`lib-rail ${drag ? "dragging" : ""}`} aria-label="Folders">
          <div className="eyebrow">Library</div>
          <button type="button" className={`lib-folder ${current === "all" ? "on" : ""}`} aria-pressed={current === "all"} onClick={() => setFolder("all")}>
            <Icon name="grid" size={14} /><span className="nm">All roadmaps</span><span className="n">{count("all")}</span></button>
          <button type="button" className={`lib-folder target ${current === "pinned" ? "on" : ""} ${over === "pinned" ? "drop" : ""}`} aria-pressed={current === "pinned"}
            onClick={() => setFolder("pinned")} {...dropProps("pinned")}><Icon name="star" size={14} /><span className="nm">Pinned</span><span className="n">{count("pinned")}</span></button>
          <div className="eyebrow">Folders</div>
          {folders.map(f => (
            <div key={f.id} className={`lib-frow target ${current === f.id ? "on" : ""} ${over === f.id ? "drop" : ""}`} {...dropProps(f.id)}>
              <button type="button" className={`lib-folder ${current === f.id ? "on" : ""}`} aria-pressed={current === f.id} onClick={() => setFolder(f.id)} style={{ "--fc": f.color }}>
                <Icon name="folder" size={14} /><span className="nm">{f.name}</span><span className="n">{count(f.id)}</span></button>
              <button type="button" className="fmore" aria-label={`Options for ${f.name}`} aria-haspopup="menu" aria-expanded={folderMenu === f.id}
                onMouseDown={e => { if (folderMenu === f.id) e.stopPropagation(); }} onClick={() => setFolderMenu(folderMenu === f.id ? null : f.id)}><Icon name="more" size={14} /></button>
              {folderMenu === f.id && (
                <div className="lib-menu lib-fmenu" role="menu" ref={folderMenuRef}>
                  <button type="button" role="menuitem" onClick={() => { setFolderMenu(null); setDialog({ kind: "folder-rename", folder: f }); }}><Icon name="pencil" size={14} />Rename</button>
                  <button type="button" role="menuitem" className="del" onClick={() => { setFolderMenu(null); setDialog({ kind: "folder-delete", folder: f }); }}><Icon name="trash" size={14} />Delete folder</button>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="lib-folder muted" onClick={() => newFolder()}><Icon name="plus" size={14} /><span className="nm">New folder</span></button>
          <div className="lib-storage">
            <div className="row"><Icon name="db" size={12} /> Browser storage</div>
            <div><b>{fmt(Math.max(est?.usage || 0, usedChars))}</b>{est?.quota ? `of ${fmt(est.quota)} used` : "used"}</div>
            <div className="sbar" role="img" aria-label={`${Math.round(usedPct)}% of browser storage used`}><i style={{ width: `${usedPct}%` }} /></div>
            <span>Roadmaps {fmt(usedChars)} of ~5 MB · sources and files {est ? fmt(Math.max(0, est.usage - usedChars)) : "…"}</span>
            <span>{libCount(roadmaps.length)} · {totalSources} source{totalSources === 1 ? "" : "s"}. Export JSON to back up.</span>
          </div>
        </aside>

        <main className="lib-main" id="main" tabIndex={-1}>
          <div className="lib-in">
            <div className="lib-head">
              <div>
                <div className="eyebrow">Roadmaps</div>
                <h1>Your roadmaps</h1>
                <p>{roadmaps.length ? `${roadmaps.length} saved in this browser · last edited ${/ago$|^Just now$|^Yesterday$/.test(lastWhen) ? lastWhen.toLowerCase() : `on ${lastWhen}`}` : "Saved in this browser."}</p>
              </div>
              <div className="lib-toolbar">
                <button type="button" className="btn" onClick={onImport}><Icon name="import" size={14} />Import roadmap</button>
                <button type="button" className="btn btn-accent" onClick={onNew}><Icon name="plus" size={14} />New roadmap</button>
              </div>
            </div>

            {loadError && <div className="bad-bar" role="alert"><Icon name="info" size={16} /><p>Saved roadmaps could not be loaded.</p></div>}

            {roadmaps.length === 0 ? (
              <div className="lib-empty">
                <Icon name="grid" size={30} />
                <h2>No roadmaps yet</h2>
                <p>Create one from a template, a blank canvas or an exported JSON file.</p>
                <button type="button" className="btn btn-accent" onClick={onNew}><Icon name="plus" size={14} />New roadmap</button>
              </div>
            ) : <>
              {current === "all" && !q && roadmaps.length > 3 && <>
                <div className="lib-sec recent"><h2><Icon name="history" size={14} />Continue where you left off</h2></div>
                <div className="lib-recent">
                  {recent.slice(0, 3).map((r, i) => (
                    <button key={r.id} type="button" className="lib-rcard" style={{ "--i": i }} onClick={() => onOpen(r.id)}>
                      <div className="ic"><Icon name="grid" size={16} /></div>
                      <div><b>{r.title}</b><span>{L.relTime(r.updatedAt)} · {r.state?.items?.length || 0} {r.state?.items?.length === 1 ? "item" : "items"}</span></div>
                    </button>
                  ))}
                </div>
              </>}

              <div className="lib-toolbar">
                <div className="lib-search"><Icon name="search" size={13} /><input className="field-input" type="search" placeholder="Search roadmaps by name" aria-label="Search roadmaps by name" value={q} onChange={e => setQ(e.target.value)} /></div>
                <Select className="lib-mfolder" value={current} options={folderOptions} onChange={setFolder} aria-label="Folder" />
                <Select className="lib-sort" value={sortKey} onChange={setSortKey} aria-label="Sort roadmaps"
                  options={[["edited", "Sort: Last edited"], ["name", "Sort: Name A–Z"], ["created", "Sort: Created"], ["items", "Sort: Most items"]]} />
                <div className="segmented" role="group" aria-label="View">
                  <button type="button" className={view === "grid" ? "on" : ""} aria-pressed={view === "grid"} onClick={() => setView("grid")}><Icon name="grid" size={12} />Grid</button>
                  <button type="button" className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}><Icon name="list" size={12} />List</button>
                </div>
              </div>

              <div className="lib-sec">
                <h2>{label}<small>{libCount(rows.length)}</small></h2>
                <span className="hint">Drag onto a folder to move · <kbd>{LIB_MOD_KEY}</kbd> or <kbd>Shift</kbd> click to select several</span>
              </div>

              {selIds.length > 0 && (
                <div className="lib-selbar" role="toolbar" aria-label="Selected roadmaps">
                  <b>{selIds.length} selected</b>
                  <LibMoveMenu ids={selIds} roadmaps={roadmaps} folders={folders} onMove={fid => moveTo(selIds, fid)} onNewFolder={() => newFolder(selIds)} />
                  <button type="button" onClick={() => setPinned(selIds, !selPinned)}><Icon name="star" size={12} />{selPinned ? "Unpin" : "Pin"}</button>
                  {!allOn && <button type="button" onClick={() => setSel(new Set(rows.map(r => r.id)))}>Select all</button>}
                  <button type="button" className="del" onClick={() => askDelete(selIds)}><Icon name="trash" size={12} />Delete</button>
                  <button type="button" aria-label="Clear selection" onClick={() => setSel(new Set())}><Icon name="x" size={12} /></button>
                </div>
              )}

              {rows.length === 0 ? (
                <div className="lib-empty small">
                  {q ? <p>No roadmaps match "{q}".</p>
                    : current === "pinned" ? <p>Nothing pinned yet. Use <b>Pin to top</b> in a roadmap's ⋯ menu, or drag a roadmap onto Pinned.</p>
                    : <p>This folder is empty. Drag roadmaps onto it, or select some and use <b>Move to</b>.</p>}
                </div>
              ) : view === "grid" ? (
                <div className={`lib-grid ${sel.size ? "selecting" : ""}`} key={current + q}>{rows.map(card)}</div>
              ) : (
                <div className="lib-table" key={current + q + "l"} role="list">
                  <div className="lib-trow th">
                    <button type="button" className={`lib-ck inl ${allOn ? "on" : someOn ? "part" : ""}`} role="checkbox" aria-checked={allOn ? true : someOn ? "mixed" : false}
                      aria-label="Select all" onClick={() => setSel(allOn ? new Set() : new Set(rows.map(r => r.id)))}>
                      {allOn ? <Icon name="check" size={11} strokeWidth={3} /> : someOn ? <Icon name="minus" size={11} strokeWidth={3} /> : null}</button>
                    <span>Name</span><span>Folder</span><span>Items</span><span>News impact</span><span>Last edited</span><span />
                  </div>
                  {rows.map(listRow)}
                </div>
              )}
            </>}
          </div>
        </main>
      </div>
      <LibraryFooter />
      <div ref={ghost} className="lib-dghost" aria-hidden="true">Move roadmap</div>

      {dialog?.kind === "delete" && (
        <LibConfirm title={`Delete ${delNames.length === 1 ? "this roadmap" : `${delNames.length} roadmaps`}?`}
          body={`${delNames.length === 1 ? "It" : "They"} will be removed from this browser, including items, linked sources and change history. Export first if you need a backup.`}
          names={delNames} confirmLabel={`Delete ${delNames.length === 1 ? "roadmap" : `${delNames.length} roadmaps`}`}
          onClose={() => setDialog(null)} onConfirm={() => { setSel(new Set()); onDelete(dialog.ids); }} />
      )}
      {dialog?.kind === "folder-delete" && (
        <LibConfirm title={`Delete folder "${dialog.folder.name}"?`}
          body="Roadmaps in it are kept and move to Unfiled. You can still find them under All roadmaps."
          names={[]} confirmLabel="Delete folder" onClose={() => setDialog(null)} onConfirm={() => deleteFolder(dialog.folder)} />
      )}
      {dialog?.kind === "folder-new" && (
        <LibFolderDialog title={dialog.moveIds.length ? `New folder for ${libCount(dialog.moveIds.length)}` : "New folder"} initial="New folder" action="Create folder"
          onClose={() => setDialog(null)} onSave={name => saveNewFolder(name, dialog.moveIds)} />
      )}
      {dialog?.kind === "folder-rename" && (
        <LibFolderDialog title="Rename folder" initial={dialog.folder.name} action="Rename"
          onClose={() => setDialog(null)} onSave={name => { setFolders(prev => prev.map(f => f.id === dialog.folder.id ? { ...f, name } : f)); setDialog(null); showToast("Folder renamed"); }} />
      )}
    </div>
  );
}

Object.assign(window, { LibraryFooter, LibThumb, LibraryPage, useRoadmapFolders });
