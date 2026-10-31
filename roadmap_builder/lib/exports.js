// Shared helpers, loaded by index.html as a module and used by the JSX files
// through globalThis. Vitest imports the same file, so its tests run the real code.
//
// The "Reducers" section and validateRoadmap below are still COPIES of logic
// inside app.jsx and modals.jsx. Their tests do not prove the app's copies work.

import "./advisor.js"; // sets globalThis.AdvisorUtils, as in the browser

// ─── Roadmap state shape helpers ────────────────────────────────────────────

export function titleOf(state) {
  return (state?.title || "").trim() || "Untitled Roadmap";
}

export function isValidRoadmapState(state) {
  return !!state
    && typeof state === "object"
    && !Array.isArray(state)
    && Array.isArray(state.categories)
    && Array.isArray(state.bands)
    && Array.isArray(state.items);
}

// ─── Routing ────────────────────────────────────────────────────────────────

export function parseRoute(hash) {
  const path = (hash || "").replace(/^#/, "");
  if (!path || path === "/") return { view: "empty" };

  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "roadmaps") return { view: "not-found" };
  if (parts.length === 1) return { view: "roadmaps" };
  if (parts.length === 2 && parts[1] === "new") return { view: "new" };
  if (parts.length === 2) return { view: "builder", id: decodeURIComponent(parts[1]) };
  if (parts.length === 3 && parts[1] === "new" && parts[2] === "templates") return { view: "new", picker: true };
  if (parts.length === 3 && parts[2] === "import") {
    return { view: "builder", id: decodeURIComponent(parts[1]), action: "import" };
  }
  if (parts.length === 3 && ["sources", "impact", "history"].includes(parts[2])) {
    return { view: "builder", id: decodeURIComponent(parts[1]), tab: parts[2] };
  }
  return { view: "not-found" };
}

// ─── Selection export builders ──────────────────────────────────────────────

export function csvEscape(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

export function buildSelectionJson(state, picked) {
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

export function buildSelectionCsv(state, picked) {
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

export function buildSelectionText(state, picked) {
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

// ─── Roadmap state reducers ─────────────────────────────────────────────────
// These are the pure transforms behind App's setState callbacks. Mirror the
// in-component logic from app.jsx so functional tests can hit them directly.

/** Append an item if absent, otherwise replace by id. Returns new state. */
export function upsertItem(state, item) {
  const exists = state.items.some(i => i.id === item.id);
  return {
    ...state,
    items: exists
      ? state.items.map(i => (i.id === item.id ? item : i))
      : [...state.items, item],
  };
}

/** Remove an item by id. */
export function deleteItem(state, id) {
  return { ...state, items: state.items.filter(i => i.id !== id) };
}

/** Move an item to a new layer + single band. Mirrors `onMoveItem`. */
export function moveItem(state, id, catId, bandId) {
  return {
    ...state,
    items: state.items.map(i =>
      i.id === id ? { ...i, catId, bands: [bandId] } : i
    ),
  };
}

/**
 * Replace categories + bands. Items referencing dropped categories are removed
 * entirely; items referencing some-but-not-all dropped bands keep only the
 * surviving ones. Items whose bands are wholly removed are dropped.
 * Mirrors `onSaveStructure`.
 */
export function saveStructure(state, cats, bands) {
  const catIds = new Set(cats.map(c => c.id));
  const bandIds = new Set(bands.map(b => b.id));
  return {
    ...state,
    categories: cats,
    bands,
    items: state.items
      .filter(i => catIds.has(i.catId))
      .map(i => ({ ...i, bands: i.bands.filter(b => bandIds.has(b)) }))
      .filter(i => i.bands.length > 0),
  };
}

/**
 * Append advisor advice to matched items' `advice` (user notes untouched) + flag reviewNeeded.
 * Mirrors `applyGuidanceNotes`. `entries` is the list of expert-result entries
 * for items the user picked; `verdict` is the global DDRM verdict string.
 */
export function applyAdvisorAdvice(state, entries, verdict) {
  if (!entries.length) return state;
  const byId = Object.fromEntries(entries.map(e => [e.item_id, e]));
  return {
    ...state,
    items: state.items.map(item => {
      const entry = byId[item.id];
      if (!entry) return item;
      const note = formatGuidanceNote(entry, verdict);
      // Legacy items keep old advice in their notes: separate it before appending.
      const text = item.advice == null ? globalThis.AdvisorUtils.splitLegacyNotes(item.notes) : { notes: item.notes, advice: item.advice };
      const existing = text.advice || "";
      if (existing.includes(note)) return item; // re-applying the same advice must not duplicate it
      return {
        ...item,
        reviewNeeded: true,
        lastImpactVerdict: verdict,
        notes: text.notes,
        advice: existing ? `${existing}\n\n${note}` : note,
      };
    }),
  };
}

/** Toggle membership in an immutable Set. Used by selection callbacks. */
export function toggleInSet(set, value) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

// ─── Roadmap import validation ──────────────────────────────────────────────
// Mirror of the validation block inside ImportModal.tryLoad in modals.jsx.

/** Throws if `roadmap` is malformed. Returns true on success. */
export function validateRoadmap(roadmap) {
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
    if (!cat || typeof cat !== "object"
        || !String(cat.id || "").trim() || !String(cat.label || "").trim()) {
      throw new Error(`Layer ${idx + 1} must include id and label.`);
    }
  });
  roadmap.bands.forEach((band, idx) => {
    if (!band || typeof band !== "object"
        || !String(band.id || "").trim() || !String(band.label || "").trim()) {
      throw new Error(`Time band ${idx + 1} must include id and label.`);
    }
  });
  const catIds = new Set(roadmap.categories.map(c => c.id));
  const bandIds = new Set(roadmap.bands.map(b => b.id));
  roadmap.items.forEach((item, idx) => {
    if (!item || typeof item !== "object" || !String(item.name || "").trim()) {
      throw new Error(`Item ${idx + 1} must include a name.`);
    }
    if (!String(item.catId || "").trim() || !catIds.has(item.catId)) {
      throw new Error(`Item ${idx + 1} must reference an existing layer.`);
    }
    if (!Array.isArray(item.bands) || item.bands.length < 1) {
      throw new Error(`Item ${idx + 1} must include at least one time band.`);
    }
    if (!item.bands.every(bid => bandIds.has(bid))) {
      throw new Error(`Item ${idx + 1} must reference existing time bands.`);
    }
    const order = item.bands.map(b => roadmap.bands.map(b => b.id).indexOf(b)).sort((a, b) => a - b);
    if (order.some((pos, i) => i && pos !== order[i - 1] + 1)) {
      throw new Error(`Item ${idx + 1} must use neighbouring time bands (a card is one continuous span).`);
    }
    if (item.pestle != null && (!Array.isArray(item.pestle) || item.pestle.some(p => !["P", "E", "S", "T", "L", "En"].includes(p)))) {
      throw new Error(`Item ${idx + 1} has an unknown PESTLE tag. Use P, E, S, T, L or En.`);
    }
  });
  return true;
}

// ─── Impact Advisor note formatter ──────────────────────────────────────────

export function formatGuidanceNote(entry, verdict) {
  const lines = [];
  if (Array.isArray(entry.advices) && entry.advices.length > 0) {
    const expertNoun = entry.advices.length === 1 ? "expert" : "experts";
    lines.push(`Impact review (${verdict}), ${entry.advices.length} ${expertNoun}:`);
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

Object.assign(globalThis, { titleOf, isValidRoadmapState, parseRoute, csvEscape, buildSelectionJson, buildSelectionCsv, buildSelectionText, formatGuidanceNote });
