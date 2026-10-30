// Audit log for one roadmap. Recording: events come from diffing items before and after each saved change,
// tagged with what caused it. Querying: summaries, importance, word diffs, grouping, filters and exports are
// all derived from the stored change data, never stored text. Shared by the browser and Vitest.
(() => {
const SCHEMA_VERSION = 2;
const LOCAL_LIMIT = 500;   // synced events kept in the browser as an offline cache; unsynced ones are never dropped
const VALUE_LIMIT = 2000;  // synced events' long text is cut in the browser copy only; the server keeps it whole
const FIELDS = [
  ["name", "Name"], ["catId", "Layer"], ["bands", "Time bands"], ["pestle", "PESTLE tags"],
  ["description", "Description"], ["notes", "My Notes"], ["advice", "Advisor Expert"]
];
const LABEL = Object.fromEntries(FIELDS);
const LEGACY_FIELD = { Name: "name", Layer: "catId", "Time bands": "bands", PESTLE: "pestle", Description: "description", Notes: "notes", "Advisor Expert": "advice" };
const LISTS = new Set(["bands", "pestle"]);
const TEXTS = new Set(["description", "notes", "advice"]);
const NOTE_FIELDS = new Set(["notes", "advice"]);
const SIGNIFICANT = new Set(["name", "catId", "bands", "pestle", "description"]);
// Mirrors PESTLE in data.jsx, which this plain script cannot see.
const PESTLE_NAMES = { P: "Political", E: "Economic", S: "Social", T: "Technological", L: "Legal", En: "Environmental" };
const ORIGINS = { user: "Manual edit", advisor: "Advisor Expert", source_import: "Source import", automation: "Automatic", unknown: "Not recorded" };
const ACTIONS = { created: "Created", edited: "Edited", deleted: "Deleted", notes: "Notes & advice" };

const value = (item, f) => LISTS.has(f) ? [...(item[f] || [])] : String(item[f] ?? "");
const same = (f, a, b) => LISTS.has(f) ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) : a === b;
function label(state, f, v) {
  if (f === "catId") return state.categories.find(c => c.id === v)?.label || v;
  if (f === "bands") return v.map(id => state.bands.find(b => b.id === id)?.label || id);
  if (f === "pestle") return v.map(k => PESTLE_NAMES[k] || k);
  return undefined; // text fields display as stored
}
const change = (f, before, after, prev, next) => ({
  field: f, before, after,
  ...(before !== undefined && !TEXTS.has(f) && f !== "name" && { before_display: label(prev, f, before) }),
  ...(after !== undefined && !TEXTS.has(f) && f !== "name" && { after_display: label(next, f, after) })
});

// What a change shows on one side: labels for ids, the text itself otherwise. Legacy events only have strings.
function shown(c, side) {
  const v = c[`${side}_display`] !== undefined ? c[`${side}_display`] : c[side];
  if (!LISTS.has(c.field)) return v == null ? "" : String(v);
  const list = Array.isArray(v) ? v : v ? String(v).split(", ") : [];
  return c.field === "pestle" ? list.map(k => PESTLE_NAMES[k] || k) : list;
}
const isEmpty = v => Array.isArray(v) ? !v.length : !v;
const andList = list => list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

// Recommendations present after a change but not before (a multiset, so a re-applied recommendation still counts).
function addedRecs(c) {
  const parse = s => (globalThis.AdvisorUtils?.parseAdvice(s) || []).filter(r => !r.raw);
  const key = r => JSON.stringify([r.action, r.text, r.source?.id, r.source?.revision]);
  const left = new Map();
  parse(shown(c, "before")).forEach(r => left.set(key(r), (left.get(key(r)) || 0) + 1));
  return parse(shown(c, "after")).filter(r => { const n = left.get(key(r)); if (n) { left.set(key(r), n - 1); return false; } return true; });
}
const recCount = s => (globalThis.AdvisorUtils?.parseAdvice(s) || []).length;

function wordDiff(a, b) {
  const x = String(a || "").split(/(\s+)/).filter(Boolean), y = String(b || "").split(/(\s+)/).filter(Boolean);
  // shortcut: quadratic LCS; above ~4M cells callers show plain before/after. Switch to Myers diff if notes get that long.
  if (x.length * y.length > 4e6) return null;
  const L = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--)
    L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  const push = (op, text) => out.length && out[out.length - 1].op === op ? out[out.length - 1].text += text : out.push({ op, text });
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { push("same", x[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push("del", x[i++]);
    else push("add", y[j++]);
  }
  while (i < x.length) push("del", x[i++]);
  while (j < y.length) push("add", y[j++]);
  return out;
}

function summarizeChange(e, c) {
  const before = shown(c, "before"), after = shown(c, "after"), name = LABEL[c.field] || c.field;
  if (c.field === "bands" || c.field === "catId" || c.field === "name") {
    const text = v => Array.isArray(v) ? andList(v) || "none" : v || "none";
    const quote = v => c.field === "name" ? `"${text(v)}"` : text(v);
    return `${c.field === "name" ? "Renamed" : `${name} changed`} from ${quote(before)} to ${quote(after)}`;
  }
  if (c.field === "pestle") {
    const added = after.filter(v => !before.includes(v)), removed = before.filter(v => !after.includes(v));
    const parts = [added.length && `added ${andList(added)}`, removed.length && `removed ${andList(removed)}`].filter(Boolean);
    return parts.length ? parts.join("; ").replace(/^./, s => s.toUpperCase()) : "PESTLE tags reordered";
  }
  if (c.field === "advice") {
    if (!after) return "Advisor Expert recommendations cleared";
    const recs = addedRecs(c);
    if (recs.length === 1) return `Advisor Expert added ${/^[AEIOU]/.test(recs[0].action) ? "an" : "a"} ${recs[0].action} recommendation`;
    if (recs.length > 1) return `Advisor Expert added ${recs.length} recommendations (${[...new Set(recs.map(r => r.action))].join(", ")})`;
    return "Advisor Expert recommendations updated";
  }
  return `${name} ${!before ? "added" : !after ? "cleared" : "updated"}`;
}

const History = {
  SCHEMA_VERSION, LOCAL_LIMIT, FIELDS, LABEL, ORIGINS, ACTIONS, PESTLE_NAMES,
  shown, wordDiff, addedRecs,

  // Events describing how `next.items` differs from `prev.items` (both whole roadmap states, for labels).
  // ctx says who and what caused it: { origin, actorId, actorName, roadmapId, operationId, run } where run is
  // the Advisor Expert result being applied ({ run_id, ran_at, verdict, source_ref }).
  diff(prev, next, ctx = {}) {
    const at = ctx.at || new Date().toISOString();
    const operationId = ctx.operationId || `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const before = new Map(prev.items.map(i => [i.id, i])), after = new Set(next.items.map(i => i.id));
    const run = ctx.run, src = run?.source_ref;
    const events = [];
    const event = (type, item, changes) => {
      const e = {
        schema_version: SCHEMA_VERSION,
        event_id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${events.length}`,
        roadmap_id: ctx.roadmapId || null, item_id: item.id, item_name_snapshot: item.name || "Untitled item",
        event_type: type, origin_type: ctx.origin || "user", actor_id: ctx.actorId || null, actor_display_name: ctx.actorName || null,
        timestamp: at, operation_id: operationId, field_changes: changes
      };
      if (run && changes.some(c => c.field === "advice")) {
        const refs = [...new Set(changes.filter(c => c.field === "advice").flatMap(c => addedRecs(c).flatMap(r => r.references)))];
        Object.assign(e, {
          advisor_run_id: run.run_id || null, advisor_run: { ran_at: run.ran_at || null, verdict: run.verdict || null },
          ...(src && { source_id: src.id, source_name: src.name, source_revision: src.revision }), evidence_refs: refs
        });
      }
      events.push(e);
    };
    for (const item of next.items) {
      const old = before.get(item.id);
      if (!old) {
        event("created", item, FIELDS.map(([f]) => change(f, LISTS.has(f) ? [] : "", value(item, f), prev, next)).filter(c => !isEmpty(c.after)));
        continue;
      }
      const changes = FIELDS.filter(([f]) => !same(f, value(old, f), value(item, f))).map(([f]) => change(f, value(old, f), value(item, f), prev, next));
      if (changes.length) event(changes.every(c => NOTE_FIELDS.has(c.field)) ? "notes" : "edited", item, changes);
    }
    for (const old of prev.items) {
      if (!after.has(old.id)) event("deleted", old, FIELDS.map(([f]) => change(f, value(old, f), LISTS.has(f) ? [] : "", prev, next)).filter(c => !isEmpty(c.before)));
    }
    return events;
  },

  // Entries logged before origins were recorded: same shape, origin Unknown, display strings only.
  normalize(e) {
    if (e.schema_version) return e;
    return {
      schema_version: 1, event_id: e.id, roadmap_id: null, item_id: e.itemId, item_name_snapshot: e.itemName,
      event_type: e.action, origin_type: "unknown", actor_id: null, actor_display_name: null, timestamp: e.at, operation_id: null,
      field_changes: (e.changes || []).map(c => ({ field: LEGACY_FIELD[c.field] || c.field, before_display: c.before, after_display: c.after })),
      ...(e.synced && { synced: true })
    };
  },

  summary(e) {
    if (e.event_type === "created") {
      const layer = e.field_changes.find(c => c.field === "catId"), bands = e.field_changes.find(c => c.field === "bands");
      return `Roadmap item added${layer ? ` to ${shown(layer, "after")}` : ""}${bands ? ` in ${andList(shown(bands, "after"))}` : ""}`;
    }
    if (e.event_type === "deleted") return "Roadmap item deleted";
    return e.field_changes.map(c => summarizeChange(e, c)).join("; ") || "No recorded field changes";
  },

  // "high" (red) for deletions, "medium" (amber) for changes worth a second look, null for routine edits.
  importance(e) {
    if (e.event_type === "deleted") return "high";
    if (e.event_type === "created") return null;
    const changes = e.field_changes;
    const cleared = f => changes.some(c => c.field === f && shown(c, "before") && !shown(c, "after"));
    const bands = changes.find(c => c.field === "bands");
    const shortened = bands && shown(bands, "before").some(b => !shown(bands, "after").includes(b));
    const significant = changes.filter(c => SIGNIFICANT.has(c.field)).length;
    return cleared("notes") || cleared("advice") || shortened || changes.some(c => c.field === "catId") || significant > 1 ? "medium" : null;
  },

  importanceReason(e) {
    if (e.event_type === "deleted") return "Item deleted";
    const changes = e.field_changes, has = f => changes.find(c => c.field === f);
    if (has("notes") && !shown(has("notes"), "after")) return "My Notes cleared";
    if (has("advice") && !shown(has("advice"), "after")) return "Advisor Expert recommendations cleared";
    if (has("bands") && shown(has("bands"), "before").some(b => !shown(has("bands"), "after").includes(b))) return "Time bands removed or shortened";
    if (has("catId")) return "Layer changed";
    return "Several properties changed together";
  },

  // Advisor Expert events group by their recorded run (or apply operation); everything else stands alone.
  // Mirrors history_store.group_key on the server.
  groupKey: e => e.origin_type === "advisor" ? e.advisor_run_id || e.operation_id || e.event_id : e.event_id,
  group(events, sort = "desc") {
    const map = new Map();
    for (const e of events) { const k = History.groupKey(e); if (!map.has(k)) map.set(k, []); map.get(k).push(e); }
    const edge = g => g.events.reduce((t, e) => (sort === "asc" ? e.timestamp < t : e.timestamp > t) ? e.timestamp : t, g.events[0].timestamp);
    const groups = [...map].map(([key, list]) => ({ key, events: list.sort((a, b) => sort === "asc" ? a.timestamp.localeCompare(b.timestamp) : b.timestamp.localeCompare(a.timestamp)) }));
    return groups.sort((a, b) => sort === "asc" ? edge(a).localeCompare(edge(b)) : edge(b).localeCompare(edge(a)));
  },

  fields: e => e.field_changes.map(c => c.field),
  searchText(e) {
    const values = e.field_changes.flatMap(c => [shown(c, "before"), shown(c, "after")]).flat();
    return [e.item_name_snapshot, History.summary(e), ORIGINS[e.origin_type], e.actor_display_name, e.source_name, ...values].filter(Boolean).join(" ").toLowerCase();
  },
  // What the server indexes on; the event itself is stored whole.
  indexed(e) {
    const { synced, ...rest } = History.normalize(e);
    return { ...rest, fields: History.fields(rest), important: !!History.importance(rest), search_text: History.searchText(rest) };
  },

  // Local (offline) filtering with the same meaning as history_store._where on the server.
  matches(e, f) {
    return (!f.item_id || e.item_id === f.item_id) && (!f.event_type || e.event_type === f.event_type)
      && (!f.origin_type || e.origin_type === f.origin_type) && (!f.actor_id || e.actor_id === f.actor_id)
      && (!f.field || History.fields(e).includes(f.field)) && (!f.important || !!History.importance(e))
      && (!f.since || e.timestamp >= f.since) && (!f.until || e.timestamp < f.until)
      && (!f.q || History.searchText(e).includes(f.q.trim().toLowerCase()));
  },

  // Newest first. Unsynced events always stay; synced ones beyond the cache size are dropped (the server has them).
  append(history, entries) {
    const list = [...entries.slice().reverse(), ...(Array.isArray(history) ? history : [])];
    let synced = 0;
    return list.filter(e => !e.synced || ++synced <= LOCAL_LIMIT);
  },
  markSynced(history, ids) {
    const cut = v => typeof v === "string" && v.length > VALUE_LIMIT ? v.slice(0, VALUE_LIMIT) + "…" : v;
    return history.map(e => !ids.has(e.event_id || e.id) ? e : e.schema_version
      ? { ...e, synced: true, field_changes: e.field_changes.map(c => TEXTS.has(c.field) ? { ...c, before: cut(c.before), after: cut(c.after) } : c) }
      : { ...e, synced: true });
  },

  // History endpoint beside the advisor API (same base the News Impact settings use).
  url(roadmapId) {
    let api; try { api = localStorage.getItem("ddrm_advisor_api_url"); } catch {}
    return (api || "http://127.0.0.1:7875/api/recommend").replace(/\/recommend\/?$/, `/history/${encodeURIComponent(roadmapId)}`);
  },

  actorName: (e, me) => e.actor_id && e.actor_id === me ? "You" : e.actor_display_name || "Unknown",

  toCsv(events, me) {
    // Quotes every cell; a leading = + - @ tab or CR is defused so spreadsheets do not run it as a formula.
    const cell = v => { let s = Array.isArray(v) ? v.join(", ") : String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    const head = ["Timestamp", "Roadmap Item", "Action", "Change Origin", "Editor", "Changed Field", "Before", "After", "Summary", "Source", "Revision", "Advisor Run ID"];
    const rows = events.flatMap(e => {
      const base = [e.timestamp, e.item_name_snapshot, ACTIONS[e.event_type] || e.event_type, ORIGINS[e.origin_type] || e.origin_type, History.actorName(e, me)];
      const tail = [History.summary(e), e.source_name || "", e.source_revision ?? "", e.advisor_run_id || ""];
      const changes = e.field_changes.length ? e.field_changes : [null];
      return changes.map(c => [...base, c ? LABEL[c.field] || c.field : "", c ? shown(c, "before") : "", c ? shown(c, "after") : "", ...tail]);
    });
    return [head, ...rows].map(r => r.map(cell).join(",")).join("\r\n");
  },
  toJson(events, roadmapId) {
    return JSON.stringify({ schema_version: SCHEMA_VERSION, roadmap_id: roadmapId, exported_at: new Date().toISOString(),
      events: events.map(e => { const { synced, ...rest } = e; return rest; }) }, null, 2);
  }
};
globalThis.RoadmapHistory = Object.freeze(History);
})();
