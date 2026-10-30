// Native IndexedDB; no application data is sent to a storage server.
globalThis.SourceStore = (() => {
  const name = 'ddrm_sources_v1';
  const changed = () => {
    globalThis.dispatchEvent?.(new Event('ddrm-sources-changed'));
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(name); channel.postMessage('changed'); channel.close();
    }
  };
  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 2);
      req.onupgradeneeded = e => {
        if (e.oldVersion < 1) {
          req.result.createObjectStore('sources', { keyPath: 'id' });
          req.result.createObjectStore('folders', { keyPath: 'id' });
          req.result.createObjectStore('revisions', { keyPath: ['id', 'revision'] });
        }
        // v1 library was shared across roadmaps; the agreed migration discards it (sources are now per roadmap).
        if (e.oldVersion === 1) for (const store of ['sources', 'folders', 'revisions']) req.transaction.objectStore(store).clear();
      };
      req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Close other DDRM tabs to open the source library.'));
    });
  }
  async function transaction(stores, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result, failure;
      tx.oncomplete = () => { db.close(); if (mode === 'readwrite') changed(); resolve(result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(failure || tx.error || new Error('Source storage failed. Your previous saved revision is intact.')); };
      try { action(tx, value => { result = value; }, error => { failure = error; tx.abort(); }); }
      catch (e) { failure = e; tx.abort(); }
    });
  }
  const all = store => transaction([store], 'readonly', (tx, done) => {
    tx.objectStore(store).getAll().onsuccess = e => done(e.target.result);
  });
  return {
    async list(roadmapId) {
      const [sources, folders] = await Promise.all([all('sources'), all('folders')]);
      return { sources: sources.filter(s => s.roadmapId === roadmapId).sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || '')),
        folders: folders.filter(f => f.roadmapId === roadmapId) };
    },
    history(id) { return transaction(['revisions'], 'readonly', (tx, done) => {
      tx.objectStore('revisions').getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])).onsuccess = e => done(e.target.result);
    }); },
    save(draft) { return transaction(['sources', 'revisions', 'folders'], 'readwrite', (tx, done, fail) => {
      const store = tx.objectStore('sources');
      store.get(draft.id).onsuccess = e => {
        try {
          const old = e.target.result;
          if ((old?.revision || 0) !== (draft.revision || 0)) throw new Error('This source changed in another tab. Reload it before saving; copy your edits first.');
          // Blob identity changes across structured clone; compare immutable original generation instead.
          const next = SourceLogic.revision(draft, old ? { ...old, original: draft.originalVersion === old.originalVersion ? draft.original : old.original } : null);
          const commit = () => { store.put(next); tx.objectStore('revisions').put(next); done(next); };
          if (old && old.roadmapId !== next.roadmapId) throw new Error('Sources cannot move between roadmaps.');
          if (next.folderId) tx.objectStore('folders').get(next.folderId).onsuccess = f => { if (f.target.result?.roadmapId !== next.roadmapId) fail(new Error('Folder no longer exists. Choose Unfiled.')); else commit(); };
          else commit();
        } catch (error) { fail(error); }
      };
    }); },
    saveFolder(folder) {
      const name = (folder.name || '').trim();
      if (!name) return Promise.reject(new Error('Folder name is required.'));
      if (name.length > 80) return Promise.reject(new Error('Folder names can be up to 80 characters.'));
      if (!folder.roadmapId) return Promise.reject(new Error('Folder needs a roadmap.'));
      return transaction(['folders'], 'readwrite', (tx, done, fail) => {
        const store = tx.objectStore('folders');
        store.getAll().onsuccess = e => {
          if (e.target.result.some(f => f.roadmapId === folder.roadmapId && f.id !== folder.id && f.name.trim().toLowerCase() === name.toLowerCase())) {
            fail(new Error(`A folder named "${name}" already exists.`)); return;
          }
          store.put({ ...folder, name });
        };
      });
    },
    // Portable copy of a roadmap's library (originals as base64, stored once per original version).
    async exportRoadmap(roadmapId) {
      const [sources, folders, revisions] = await Promise.all(['sources', 'folders', 'revisions'].map(all));
      const mine = list => list.filter(r => r.roadmapId === roadmapId);
      const files = {};
      const pack = async r => {
        if (!(r.original instanceof Blob)) return r;
        if (!files[r.originalVersion]) {
          const bytes = new Uint8Array(await r.original.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          files[r.originalVersion] = { type: r.original.type, data: btoa(binary) };
        }
        return { ...r, original: { blobRef: r.originalVersion } };
      };
      return { format: 'ddrm-sources', version: 1, folders: mine(folders),
        sources: await Promise.all(mine(sources).map(pack)), revisions: await Promise.all(mine(revisions).map(pack)), files };
    },
    // Writes an exported library into roadmapId. New IDs unless keepIds (undo of a delete); returns old->new ID map.
    importRoadmap(roadmapId, data, { keepIds = false } = {}) {
      if (data?.format !== 'ddrm-sources' || data.version !== 1 || !['folders', 'sources', 'revisions'].every(k => Array.isArray(data[k]))) {
        return Promise.reject(new Error('The sources in this file are not in a supported format.'));
      }
      const ids = {}, map = id => (ids[id] ||= keepIds ? id : crypto.randomUUID());
      const folderIds = new Set(data.folders.map(f => f.id));
      const blobs = {};
      const blob = ref => {
        const file = data.files?.[ref];
        if (typeof file?.data !== 'string' || file.data.length > 28 * 1024 * 1024) throw new Error('A source file in the import is missing or larger than 20 MB.');
        return (blobs[ref] ||= new Blob([Uint8Array.from(atob(file.data), c => c.charCodeAt(0))], { type: String(file.type || '') }));
      };
      const unpack = r => {
        if (typeof r?.id !== 'string' || !Number.isInteger(r.revision) || r.revision < 1) throw new Error('A source in the import is damaged.');
        SourceLogic.revision(r, null); // same name/language/text limits as normal saves
        const original = r.original?.blobRef ? blob(r.original.blobRef) : r.original;
        if (original != null && typeof original !== 'string' && !(original instanceof Blob)) throw new Error('A source in the import is damaged.');
        return { ...r, id: map(r.id), roadmapId, folderId: folderIds.has(r.folderId) ? map(r.folderId) : '', original };
      };
      let rows;
      try {
        rows = { folders: data.folders.map(f => {
          const name = String(f?.name || '').trim().slice(0, 80);
          if (typeof f?.id !== 'string' || !name) throw new Error('A folder in the import is damaged.');
          return { id: map(f.id), roadmapId, name };
        }), sources: data.sources.map(unpack), revisions: data.revisions.map(unpack) };
      } catch (e) { return Promise.reject(e); }
      return transaction(['sources', 'revisions', 'folders'], 'readwrite', (tx, done) => {
        for (const [store, list] of Object.entries(rows)) for (const row of list) tx.objectStore(store).put(row);
        done(ids);
      });
    },
    deleteFolder(id) { return transaction(['folders', 'sources', 'revisions'], 'readwrite', tx => {
      tx.objectStore('folders').delete(id);
      tx.objectStore('sources').openCursor().onsuccess = e => {
        const cursor = e.target.result; if (!cursor) return;
        if (cursor.value.folderId === id) {
          const value = { ...cursor.value, folderId: '', revision: cursor.value.revision + 1, modifiedAt: new Date().toISOString() };
          cursor.update(value); tx.objectStore('revisions').put(value);
        }
        cursor.continue();
      };
    }); },
    // Deletes every source, revision and folder owned by a roadmap.
    removeRoadmap(roadmapId) { return transaction(['sources', 'revisions', 'folders'], 'readwrite', tx => {
      for (const store of ['sources', 'folders']) tx.objectStore(store).openCursor().onsuccess = e => {
        const cursor = e.target.result; if (!cursor) return;
        if (cursor.value.roadmapId === roadmapId) {
          if (store === 'sources') tx.objectStore('revisions').delete(IDBKeyRange.bound([cursor.value.id, 0], [cursor.value.id, Number.MAX_SAFE_INTEGER]));
          cursor.delete();
        }
        cursor.continue();
      };
    }); },
    remove(ids) { return transaction(['sources', 'revisions'], 'readwrite', tx => {
      for (const id of ids) {
        tx.objectStore('sources').delete(id);
        tx.objectStore('revisions').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      }
    }); }
  };
})();
