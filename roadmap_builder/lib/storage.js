globalThis.RoadmapStorage = Object.freeze({
  save(storage, key, roadmaps) {
    try {
      storage.setItem(key, JSON.stringify({ roadmaps }));
      return "";
    } catch {
      return "Changes are not saved in this browser. Export your roadmap before closing this page; storage may be full or disabled.";
    }
  },
  canPersist(route, stateId, state) {
    return route.view === "builder" && !!route.id && route.id === stateId
      && !!state && Array.isArray(state.categories) && Array.isArray(state.bands) && Array.isArray(state.items);
  }
});
