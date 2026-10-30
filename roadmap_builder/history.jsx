/* global React, Icon, InfoDot, Select, RoadmapHistory, AdviceEntry, AdvisorUtils, SourceStore */
const H = RoadmapHistory;
const HISTORY_PAGE = 50;
const HISTORY_VIEWS_KEY = "ddrm_history_views";
const ORIGIN_ICON = { user: "pencil", advisor: "lightbulb-lucide", source_import: "import", automation: "settings", unknown: "help" };
const NO_FILTERS = { q: "", item_id: "", event_type: "", origin_type: "", actor_id: "", field: "", important: false, from: "", to: "", sort: "desc" };

const HISTORY_HELP = <ul className="popover-list">
  <li><b>What is listed:</b> <span>every time a roadmap item is added, edited, moved or deleted, and every Advisor Expert recommendation added from News Impact.</span></li>
  <li><b>Who made it:</b> <span>"You" is your own edit. "Advisor Expert" is advice from News Impact. "Not recorded" marks older entries saved before this was tracked.</span></li>
  <li><b>Important:</b> <span>red for deleted items, amber for changes worth a second look, like cleared notes or shorter time bands.</span></li>
  <li><b>Details:</b> <span>click a row to see before and after. Removed words are red, added words are green.</span></li>
  <li><b>Kept safe:</b> <span>saved on this computer by the analysis service, so clearing the browser does not lose it.</span></li>
</ul>;

// Local calendar day as YYYY-MM-DD, the format <input type="date"> uses.
const dayKey = at => new Date(at).toLocaleDateString("en-CA");
const clock = at => new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function dayLabel(key) {
  const today = dayKey(Date.now()), yesterday = dayKey(Date.now() - 864e5);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(`${key}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// UI filters to query filters: local From/To days become UTC instants, matching the stored ISO timestamps.
function queryFilters(f) {
  const until = f.to && new Date(`${f.to}T00:00`);
  if (until) until.setDate(until.getDate() + 1);
  return { q: f.q.trim(), item_id: f.item_id, event_type: f.event_type, origin_type: f.origin_type, actor_id: f.actor_id, field: f.field,
    important: f.important, since: f.from ? new Date(`${f.from}T00:00`).toISOString() : "", until: until ? until.toISOString() : "", sort: f.sort };
}

async function fetchHistory(roadmapId, f, offset, limit) {
  const params = new URLSearchParams(Object.entries(queryFilters(f)).filter(([, v]) => v !== "" && v !== false).map(([k, v]) => [k, String(v)]));
  params.set("offset", offset); params.set("limit", limit);
  const res = await fetch(`${H.url(roadmapId)}?${params}`);
  if (!res.ok) throw new Error(`History service answered ${res.status}`);
  return res.json();
}

// The browser's own copy, queried the same way, for when the history service is not running.
function localHistory(history, f, offset, limit) {
  const all = history.map(H.normalize);
  const events = all.filter(e => H.matches(e, queryFilters(f)));
  const groups = H.group(events, f.sort);
  const items = new Map(), actors = new Map();
  all.forEach(e => { if (!items.has(e.item_id)) items.set(e.item_id, e.item_name_snapshot); if (e.actor_id) actors.set(e.actor_id, e.actor_display_name); });
  return { total_events: events.length, total_groups: groups.length, groups: limit ? groups.slice(offset, offset + limit) : groups,
    items: [...items].sort((a, b) => String(a[1]).localeCompare(String(b[1]))), actors: [...actors] };
}

function readViews() {
  try { const v = JSON.parse(localStorage.getItem(HISTORY_VIEWS_KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}

// Long unchanged stretches between edits shrink to their edges so the edits stay in view.
function Unchanged({ text, first, last }) {
  const tokens = text.split(/(\s+)/);
  if (tokens.length <= 60) return text;
  const head = first ? "" : tokens.slice(0, 24).join(""), tail = last ? "" : tokens.slice(-24).join("");
  return <>{head}<span className="history-skip">…</span>{tail}</>;
}

function TextChange({ before, after }) {
  const parts = H.wordDiff(before, after);
  if (!parts) return <div className="history-ba"><span className="label">Before</span><p className="del">{before || "None"}</p><span className="label">After</span><p className="ins">{after || "None"}</p></div>;
  return <p className="history-words">{parts.map((p, i) => p.op === "same"
    ? <Unchanged key={i} text={p.text} first={i === 0} last={i === parts.length - 1} />
    : p.op === "add" ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>)}</p>;
}

function ChangeComparison({ change: c, event: e }) {
  const before = H.shown(c, "before"), after = H.shown(c, "after");
  if (c.field === "pestle") {
    const added = after.filter(v => !before.includes(v)), removed = before.filter(v => !after.includes(v));
    return <div className="history-ba">
      {added.length > 0 && <><span className="label">Added</span><p className="ins">{added.join(", ")}</p></>}
      {removed.length > 0 && <><span className="label">Removed</span><p className="del">{removed.join(", ")}</p></>}
      {!added.length && !removed.length && <p>Order changed only</p>}
    </div>;
  }
  if (c.field === "advice") {
    const added = H.addedRecs(c), cleared = !after && AdvisorUtils.parseAdvice(before).length;
    return <>
      {cleared > 0 && <p className="history-note">{plural(cleared, "recommendation")} cleared. Their full text is under Show full text.</p>}
      {added.length > 0 && <div className="rec-list eim">{added.map((rec, i) => <AdviceEntry key={i} rec={rec} />)}</div>}
      {!cleared && !added.length && <TextChange before={before} after={after} />}
    </>;
  }
  if (c.field === "description" || c.field === "notes") return <TextChange before={before} after={after} />;
  const text = v => (Array.isArray(v) ? v.join(", ") : v) || "None";
  return <div className="history-ba"><span className="label">Before</span><p className="del">{text(before)}</p><span className="label">After</span><p className="ins">{text(after)}</p></div>;
}

function OriginTag({ e, actorId }) {
  const label = e.origin_type === "user" && e.actor_id && e.actor_id === actorId ? "You" : H.ORIGINS[e.origin_type] || H.ORIGINS.unknown;
  return <span className={`history-origin ${e.origin_type}`}><Icon name={ORIGIN_ICON[e.origin_type] || "help"} size={12} aria-hidden="true" />{label}</span>;
}

function HistoryEvent({ e, ctx }) {
  const [open, setOpen] = React.useState(false);
  const importance = H.importance(e);
  const live = ctx.itemIds.has(e.item_id);
  return (
    <details className="history-entry" onToggle={ev => setOpen(ev.currentTarget.open)}>
      <summary>
        <time dateTime={e.timestamp}>{clock(e.timestamp)}</time>
        <OriginTag e={e} actorId={ctx.actorId} />
        <span className="history-item">{e.item_name_snapshot}</span>
        <span className="history-summary">{H.summary(e)}</span>
        {importance ? <span className={`history-flag ${importance}`} title={H.importanceReason(e)}>
          <Icon name="alert-triangle" size={13} aria-hidden="true" />Important
        </span> : <span className="history-flag" />}
        <Icon name="chevron-down" size={14} className="history-chevron" aria-hidden="true" />
      </summary>
      {open && <div className="history-body">
        <p className="history-meta">
          {new Date(e.timestamp).toLocaleString()} · {e.origin_type === "user" ? `Edited by ${H.actorName(e, ctx.actorId) === "You" ? "you" : H.actorName(e, ctx.actorId)}` : H.ORIGINS[e.origin_type] || H.ORIGINS.unknown}
          {importance && <span className={`history-flag-text ${importance}`}>{H.importanceReason(e)}</span>}
          <span className="spacer" />
          {live && e.event_type !== "deleted" ? <button type="button" className="history-link" onClick={() => ctx.onOpenItem(e.item_id)}>Open item</button>
            : <span className="history-gone">{e.event_type === "deleted" ? "Deleted item" : "No longer on the roadmap"}</span>}
          {e.source_id && (ctx.sourceIds?.has(e.source_id)
            ? <button type="button" className="history-link" onClick={() => ctx.onOpenSource(e.source_id)}>Open source</button>
            : <span className="history-gone">Source unavailable</span>)}
        </p>
        <dl className="history-changes">
          {e.field_changes.map(c => <React.Fragment key={c.field}><dt>{H.LABEL[c.field] || c.field}</dt><dd><ChangeComparison change={c} event={e} /></dd></React.Fragment>)}
        </dl>
        <details className="history-raw">
          <summary>Show full text and record IDs</summary>
          {e.field_changes.map(c => <div key={c.field}>
            <b>{H.LABEL[c.field] || c.field}</b>
            <pre>Before: {[].concat(H.shown(c, "before")).join(", ") || "None"}{"\n"}After: {[].concat(H.shown(c, "after")).join(", ") || "None"}</pre>
          </div>)}
          <p className="mono">Event {e.event_id}{e.operation_id ? ` · operation ${e.operation_id}` : ""}{e.schema_version === 1 ? " · recorded before origins were tracked" : ""}</p>
        </details>
      </div>}
    </details>
  );
}

// One Advisor Expert run: a parent row; each affected item stays its own expandable row inside.
function HistoryGroup({ group, ctx }) {
  const events = group.events, first = events[0];
  const items = new Set(events.map(e => e.item_id)).size;
  const sources = [...new Map(events.filter(e => e.source_id).map(e => [`${e.source_id}@${e.source_revision}`, e])).values()];
  const ranAt = events.find(e => e.advisor_run?.ran_at)?.advisor_run.ran_at;
  const verdict = events.find(e => e.advisor_run?.verdict)?.advisor_run.verdict;
  return (
    <details className="history-entry history-group">
      <summary>
        <time dateTime={first.timestamp}>{clock(first.timestamp)}</time>
        <OriginTag e={first} actorId={ctx.actorId} />
        <span className="history-item">Advisor Expert review</span>
        <span className="history-summary">Added recommendations to {plural(items, "item")}{events.length !== items ? ` (${plural(events.length, "change")})` : ""}. Click to see each one.</span>
        <span className="history-flag" />
        <Icon name="chevron-down" size={14} className="history-chevron" aria-hidden="true" />
      </summary>
      <div className="history-body">
        <p className="history-meta">
          {ranAt ? `Review ran ${new Date(ranAt).toLocaleString()}` : "Review time not recorded"}
          {verdict && ` · Verdict: ${verdict}`}
          {sources.map(e => <span key={e.source_id + e.source_revision}> · {e.source_name || "Source"}, revision {e.source_revision}</span>)}
        </p>
        <p className="history-note">These are suggestions saved in each item's Advisor Expert notes. The review did not move, rename or delete anything on the roadmap.</p>
      </div>
      <ol className="history-children">{events.map(e => <li key={e.event_id}><HistoryEvent e={e} ctx={ctx} /></li>)}</ol>
    </details>
  );
}

function HistoryPage({ roadmapId, title, history, items, actorId, onSync, onOpenItem, onOpenSource }) {
  const [f, setF] = React.useState(NO_FILTERS);
  const [view, setView] = React.useState("all");
  const [views, setViews] = React.useState(readViews);
  const [advanced, setAdvanced] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [more, setMore] = React.useState(false);
  const [sourceIds, setSourceIds] = React.useState(null);

  React.useEffect(() => {
    SourceStore.list(roadmapId).then(d => setSourceIds(new Set(d.sources.map(s => s.id))), () => setSourceIds(new Set()));
  }, [roadmapId]);

  const load = async (offset, limit = HISTORY_PAGE) => {
    try { await onSync(); return { ...await fetchHistory(roadmapId, f, offset, limit), offline: false }; }
    catch { return { ...localHistory(history, f, offset, limit), offline: true }; }
  };
  const key = JSON.stringify(f);
  React.useEffect(() => {
    let stale = false;
    const t = setTimeout(() => load(0).then(page => { if (!stale) setData(page); }), f.q ? 250 : 0);
    return () => { stale = true; clearTimeout(t); };
  }, [key, history]);
  const loadMore = async () => {
    setMore(true);
    const page = await load(data.groups.length);
    setData(d => ({ ...page, groups: [...d.groups, ...page.groups] }));
    setMore(false);
  };

  const presets = [["all", "All changes", {}], ["mine", "My edits", { actor_id: actorId || "" }], ["advisor", "Advisor Expert changes", { origin_type: "advisor" }],
    ["important", "Important changes", { important: true }], ["deleted", "Deleted items", { event_type: "deleted" }],
    ...views.map(v => [v.id, v.name, v.filters])];
  const custom = views.find(v => v.id === view);
  const pickView = id => { const p = presets.find(x => x[0] === id); if (p) { setF({ ...NO_FILTERS, ...p[2] }); setView(id); } };
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setView(""); };
  const storeViews = next => { setViews(next); try { localStorage.setItem(HISTORY_VIEWS_KEY, JSON.stringify(next)); } catch {} };
  const saveView = () => {
    const name = prompt("Name these filters so you can pick them again from the Show menu")?.trim();
    if (!name) return;
    const v = { id: `view_${Date.now()}`, name, filters: f };
    storeViews([...views, v]); setView(v.id);
  };
  const renameView = () => { const name = prompt("Rename these saved filters", custom.name)?.trim(); if (name) storeViews(views.map(v => v.id === custom.id ? { ...v, name } : v)); };
  const removeView = async () => { if (await confirmDeletion({ title: `Remove the saved filters "${custom.name}"?`, body: "Your history is not affected.", confirmLabel: "Remove" })) { storeViews(views.filter(v => v.id !== custom.id)); setView(""); } };

  const itemNames = new Map(data?.items || []);
  const actorOptions = new Map((data?.actors || []).map(([id, name]) => [id, id === actorId ? "You" : name || id]));
  if (actorId) actorOptions.set(actorId, "You");
  const chips = [
    f.q.trim() && ["q", `Search: ${f.q.trim()}`, ""], f.item_id && ["item_id", `Item: ${itemNames.get(f.item_id) || f.item_id}`, ""],
    f.event_type && ["event_type", `Type: ${H.ACTIONS[f.event_type]}`, ""], f.origin_type && ["origin_type", `Made by: ${H.ORIGINS[f.origin_type]}`, ""],
    f.actor_id && ["actor_id", `Browser: ${actorOptions.get(f.actor_id) || f.actor_id}`, ""], f.field && ["field", `Field: ${H.LABEL[f.field]}`, ""],
    f.important && ["important", "Important only", false], f.from && ["from", `From ${f.from}`, ""], f.to && ["to", `To ${f.to}`, ""],
    f.sort === "asc" && ["sort", "Oldest first", "desc"]
  ].filter(Boolean);

  const exportAs = async kind => {
    const page = await load(0, 0);
    const events = page.groups.flatMap(g => g.events);
    const content = kind === "csv" ? "﻿" + H.toCsv(events, actorId) : H.toJson(events, roadmapId);
    const url = URL.createObjectURL(new Blob([content], { type: kind === "csv" ? "text/csv;charset=utf-8" : "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${String(title || "roadmap").replace(/[^\w\-]+/g, "_")}_history_${dayKey(Date.now())}.${kind}`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const ctx = { itemIds: new Set(items.map(i => i.id)), sourceIds, actorId, onOpenItem, onOpenSource };
  const days = [];
  (data?.groups || []).forEach(g => {
    const k = dayKey(g.events[0].timestamp);
    if (days[days.length - 1]?.key !== k) days.push({ key: k, groups: [] });
    days[days.length - 1].groups.push(g);
  });
  const total = data?.total_events ?? 0;

  return (
    <main className="history-page" id="main" tabIndex={-1}>
      <div className="history-inner">
        <div className="history-head">
          <h1>History <InfoDot label="How History works" title="How History works" tip={HISTORY_HELP} /></h1>
          <p>A record of every change to this roadmap's items: what changed, when, and who or what made it. Click any row to see the details.</p>
        </div>

        <div className="history-filters" role="search" aria-label="Filter history">
          <label className="history-search">
            <span className="visually-hidden">Search history</span>
            <Icon name="search" size={14} aria-hidden="true" />
            <input type="search" placeholder="Search items and changes" value={f.q} onChange={e => set("q", e.target.value)} />
          </label>
          <label className="history-show">Show<Select aria-label="Show" value={view} onChange={pickView} options={[...(view ? [] : [["", "Custom filters"]]), ...presets.map(([id, name]) => [id, name])]} /></label>
          <Select aria-label="Filter by item" value={f.item_id} onChange={v => set("item_id", v)} options={[["", "All items"], ...(data?.items || [])]} />
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}><Icon name="sliders-horizontal" size={12} /> {advanced ? "Fewer filters" : "More filters"}</button>
          <details className="history-export">
            <summary className="btn btn-ghost btn-sm"><Icon name="download" size={12} /> Export</summary>
            <div role="group" aria-label="Download the changes shown">
              <button type="button" onClick={() => exportAs("csv")}>Spreadsheet (.csv)</button>
              <button type="button" onClick={() => exportAs("json")}>Full data (.json)</button>
            </div>
          </details>
          {advanced && <div className="history-advanced">
            <Select aria-label="Filter by type of change" value={f.event_type} onChange={v => set("event_type", v)} options={[["", "Any type of change"], ...Object.entries(H.ACTIONS)]} />
            <Select aria-label="Filter by who made it" value={f.origin_type} onChange={v => set("origin_type", v)} options={[["", "Made by anyone"], ...Object.entries(H.ORIGINS)]} />
            <Select aria-label="Filter by browser" value={f.actor_id} onChange={v => set("actor_id", v)} options={[["", "Any browser"], ...actorOptions]} />
            <Select aria-label="Filter by changed field" value={f.field} onChange={v => set("field", v)} options={[["", "Any field"], ...H.FIELDS]} />
            <label className="history-date">From<input type="date" value={f.from} max={f.to || undefined} onChange={e => set("from", e.target.value)} /></label>
            <label className="history-date">To<input type="date" value={f.to} min={f.from || undefined} onChange={e => set("to", e.target.value)} /></label>
            <Select aria-label="Sort order" value={f.sort} onChange={v => set("sort", v)} options={[["desc", "Newest first"], ["asc", "Oldest first"]]} />
            <label className="history-check"><input type="checkbox" checked={f.important} onChange={e => set("important", e.target.checked)} />Important only</label>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={saveView}><Icon name="save" size={12} /> Save these filters</button>
            {custom && <button type="button" className="btn btn-ghost btn-sm" onClick={renameView}><Icon name="pencil" size={12} /> Rename</button>}
            {custom && <button type="button" className="btn btn-ghost btn-sm danger" onClick={removeView}><Icon name="trash" size={12} /> Remove</button>}
          </div>}
        </div>

        <div className="history-status">
          <p className="history-count" role="status">{data ? `${plural(total, "matching change")}` : "Loading…"}</p>
          {chips.map(([k, text, reset]) => <button key={k} type="button" className="history-chip" aria-label={`Remove filter ${text}`} onClick={() => set(k, reset)}>{text}<Icon name="x" size={11} aria-hidden="true" /></button>)}
          {chips.length > 0 && <button type="button" className="history-link" onClick={() => { setF(NO_FILTERS); setView("all"); }}>Clear filters</button>}
        </div>
        {data?.offline && <p className="history-offline" role="note">The analysis service is not running, so you are seeing only the changes saved in this browser. Start Roadmap Review to see the full history; nothing is lost in the meantime.</p>}

        {data && !data.groups.length ? (
          <div className="history-empty">
            <Icon name={chips.length ? "filter" : "clock"} size={22} />
            <strong>{chips.length ? "No changes match" : "No changes yet"}</strong>
            <p>{chips.length ? "Change the search or filters." : "Adding, editing, moving or deleting items, and Advisor Expert recommendations applied from News Impact, will appear here."}</p>
          </div>
        ) : days.map(day => (
          <section key={day.key} className="history-day" aria-label={dayLabel(day.key)}>
            <h2>{dayLabel(day.key)}</h2>
            <ol>
              {day.groups.map(g => <li key={g.key}>
                {g.key === g.events[0].event_id && g.events.length === 1 ? <HistoryEvent e={g.events[0]} ctx={ctx} /> : <HistoryGroup group={g} ctx={ctx} />}
              </li>)}
            </ol>
          </section>
        ))}
        {data && data.groups.length < data.total_groups && <button type="button" className="btn history-more" disabled={more} onClick={loadMore}>
          {more ? "Loading…" : `Show more (${data.total_groups - data.groups.length} left)`}
        </button>}
      </div>
    </main>
  );
}

Object.assign(window, { HistoryPage });
