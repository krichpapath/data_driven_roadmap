// Pure helpers for the roadmap library page (Your roadmaps). Loaded as a plain script in the
// browser and imported by Vitest; both read globalThis.RoadmapLibrary.
const DAY = 86400000;

globalThis.RoadmapLibrary = Object.freeze({
  // "Just now", "12 min ago", "3 hours ago", "Yesterday", "4 days ago", then "Oct 14" (or "Oct 14, 2025").
  relTime(iso, now = new Date()) {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return "Unknown";
    const mins = Math.floor((now - t) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (t >= startOfToday) { const h = Math.floor(mins / 60); return `${h} hour${h === 1 ? "" : "s"} ago`; }
    const days = Math.ceil((startOfToday - t) / DAY);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return t.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(t.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
  },

  // News impact line for a card, worked out from saved data (impact results themselves are not stored).
  // sourceCount is null while the source library is still loading.
  impact(record, sourceCount, now = new Date()) {
    const items = record.state?.items || [];
    const review = items.filter(i => i.reviewNeeded).length;
    if (review) return { label: `${review} item${review === 1 ? "" : "s"} to review`, tone: "amber" };
    const last = (record.history || []).filter(e => e.origin_type === "advisor").map(e => e.timestamp).sort().pop();
    if (last) {
      const when = this.relTime(last, now);
      return { label: `Assessed ${/ago$|^Just now$/.test(when) ? "today" : when === "Yesterday" ? "yesterday" : when}`, tone: "green" };
    }
    if (sourceCount === 0) return { label: "No sources yet", tone: "" };
    return { label: "Not assessed", tone: "" };
  },

  // folder: "all" | "pinned" | folder id. Roadmaps in a deleted folder count as unfiled.
  filter(roadmaps, folder, query = "") {
    const q = query.trim().toLowerCase();
    return roadmaps.filter(r => (folder === "all" || (folder === "pinned" ? r.pinned : r.folderId === folder))
      && (r.title || "").toLowerCase().includes(q));
  },

  sort(roadmaps, key) {
    const by = {
      edited: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
      name: (a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }),
      created: (a, b) => String(b.createdAt || b.updatedAt).localeCompare(String(a.createdAt || a.updatedAt)),
      items: (a, b) => (b.state?.items?.length || 0) - (a.state?.items?.length || 0)
    }[key] || (() => 0);
    // Pinned roadmaps stay on top whatever the sort.
    return [...roadmaps].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b));
  },

  // Miniature of the real grid: first 3 layers x first 3 bands, a cell is filled when an item covers it.
  thumb(state) {
    const cats = (state?.categories || []).slice(0, 3), bands = (state?.bands || []).slice(0, 3), items = state?.items || [];
    return cats.map(c => ({
      color: c.color || "var(--c-slate)",
      cells: bands.map(b => items.filter(i => i.catId === c.id && (i.bands || []).includes(b.id)).length)
    }));
  },

  timeline(state) {
    const bands = state?.bands || [];
    if (!bands.length) return "No time bands";
    return bands.length === 1 ? bands[0].label : `${bands[0].label} – ${bands[bands.length - 1].label}`;
  }
});
