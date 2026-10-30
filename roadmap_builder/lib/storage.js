globalThis.RoadmapStorage = Object.freeze({
  save(storage, key, roadmaps) {
    try {
      storage.setItem(key, JSON.stringify({ roadmaps }));
      return "";
    } catch {
      return "Changes are not saved in this browser. Export your roadmap before closing this page; storage may be full or disabled.";
    }
  },
  // Latest saved collection, or null when it is missing/unreadable (caller keeps its own copy).
  read(storage, key) {
    try {
      const parsed = JSON.parse(storage.getItem(key));
      return Array.isArray(parsed?.roadmaps) ? parsed.roadmaps.filter(r => r && r.id) : null;
    } catch { return null; }
  },
  // Applies one change to the newest stored collection, so another tab's saves are never overwritten.
  update(storage, key, fallback, mutate) {
    const roadmaps = mutate(this.read(storage, key) || fallback);
    return { roadmaps, error: this.save(storage, key, roadmaps) };
  },
  canPersist(route, stateId, state) {
    return route.view === "builder" && !!route.id && route.id === stateId
      && !!state && Array.isArray(state.categories) && Array.isArray(state.bands) && Array.isArray(state.items);
  }
});
