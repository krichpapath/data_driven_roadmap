import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import '../lib/advisor.js';
import '../lib/sources.js';
import '../lib/source-storage.js';
import '../lib/source-processing.js';
const source = (id = 'a', roadmapId = 'r1') => ({ id, roadmapId, name: id, language: 'en', correctedText: 'News about technology policy.', englishText: '', tags: [], status: 'ready', revision: 0, originalVersion: id });
const result = (ref, severity) => ({ source_ref: ref, severity, verdict: 'Adjust', thresholds: { adjust: .35, revise: .65 }, evidence: [{ id: 'K1' }] });
beforeEach(async () => { for (const id of ['r1', 'r2']) await SourceStore.removeRoadmap(id); });
describe('source lifecycle', () => {
  it('persists edits and keeps original revisions with file content', async () => {
    const first = await SourceStore.save({ ...source(), original: new Blob(['Original']), originalFilename: 'original.txt' });
    const second = await SourceStore.save({ ...first, correctedText: 'Corrected' });
    expect(second.revision).toBe(2);
    const { sources } = await SourceStore.list('r1'); expect(sources[0].correctedText).toBe('Corrected');
    expect(await sources[0].original.text()).toBe('Original');
    expect((await SourceStore.history('a'))[0].correctedText).toBe(first.correctedText);
  });
  it('rejects stale writes without destroying saved content', async () => {
    const old = await SourceStore.save(source()); await SourceStore.save({ ...old, name: 'New' });
    await expect(SourceStore.save({ ...old, name: 'Stale' })).rejects.toThrow('another tab');
    expect((await SourceStore.list('r1')).sources[0].name).toBe('New');
  });
  it('rolls back a failed revision write without losing the current source', async () => {
    const old = await SourceStore.save(source());
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'revisions') throw new DOMException('Storage full', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try { await expect(SourceStore.save({ ...old, name: 'Unsaved' })).rejects.toThrow('Storage full'); }
    finally { IDBObjectStore.prototype.put = put; }
    expect((await SourceStore.list('r1')).sources[0].name).toBe(old.name);
    expect(await SourceStore.history(old.id)).toHaveLength(1);
  });
  it('folder deletion moves sources and records a revision', async () => {
    await SourceStore.saveFolder({ id: 'f', roadmapId: 'r1', name: 'Reports' });
    await SourceStore.save({ ...source(), folderId: 'f' }); await SourceStore.deleteFolder('f');
    const data = await SourceStore.list('r1'); expect(data.folders).toEqual([]); expect(data.sources[0].folderId).toBe(''); expect(data.sources[0].revision).toBe(2);
  });
  it('refuses deleted folders atomically', async () => {
    await expect(SourceStore.save({ ...source(), folderId: 'missing' })).rejects.toThrow('Folder');
    expect((await SourceStore.list('r1')).sources).toEqual([]);
  });
  it('invalidates translation after original correction, but not rename', async () => {
    let s = await SourceStore.save({ ...source(), language: 'ja', englishText: 'Reviewed translation', translationApproved: true });
    s = await SourceStore.save({ ...s, name: 'Renamed' }); expect(s.translationApproved).toBe(true);
    s = await SourceStore.save({ ...s, correctedText: '訂正' }); expect(s.translationApproved).toBe(false);
    expect(() => SourceLogic.text(s)).toThrow('translation');
    s = await SourceStore.save({ ...s, correctedText: '再訂正', translationApproved: true, approvedFor: 'ja\n再訂正' });
    expect(s.translationApproved).toBe(true);
  });
  it('deletes all revisions only on explicit source deletion', async () => {
    const s = await SourceStore.save(source()); await SourceStore.save({ ...s, name: 'Next' });
    await SourceStore.remove(['a']); expect(await SourceStore.history('a')).toEqual([]);
  });
});
describe('roadmap ownership', () => {
  it("lists only a roadmap's own sources and folders", async () => {
    await SourceStore.saveFolder({ id: 'f2', roadmapId: 'r2', name: 'Other' });
    await SourceStore.save(source('a')); await SourceStore.save(source('b', 'r2'));
    expect((await SourceStore.list('r1')).sources.map(s => s.id)).toEqual(['a']);
    expect((await SourceStore.list('r1')).folders).toEqual([]);
  });
  it('rejects unowned sources, foreign folders and moves between roadmaps', async () => {
    await expect(SourceStore.save({ ...source(), roadmapId: '' })).rejects.toThrow('roadmap');
    await SourceStore.saveFolder({ id: 'f2', roadmapId: 'r2', name: 'Other' });
    await expect(SourceStore.save({ ...source(), folderId: 'f2' })).rejects.toThrow('Folder');
    const saved = await SourceStore.save(source());
    await expect(SourceStore.save({ ...saved, roadmapId: 'r2' })).rejects.toThrow('between roadmaps');
  });
  it('upgrading from the shared v1 library discards its sources and revisions', async () => {
    await new Promise(r => { const d = indexedDB.deleteDatabase('ddrm_sources_v1'); d.onsuccess = d.onerror = r; });
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('ddrm_sources_v1', 1);
      req.onupgradeneeded = () => { const db = req.result; db.createObjectStore('sources', { keyPath: 'id' }); db.createObjectStore('folders', { keyPath: 'id' }); db.createObjectStore('revisions', { keyPath: ['id', 'revision'] }); };
      req.onsuccess = () => { const db = req.result, tx = db.transaction(['sources', 'revisions'], 'readwrite');
        tx.objectStore('sources').put({ id: 'old', revision: 1 }); tx.objectStore('revisions').put({ id: 'old', revision: 1 });
        tx.oncomplete = () => { db.close(); resolve(); }; };
      req.onerror = () => reject(req.error);
    });
    expect(await SourceStore.history('old')).toEqual([]);
    await SourceStore.save(source()); expect((await SourceStore.list('r1')).sources).toHaveLength(1);
  });
  it('deleting a roadmap removes only its sources, revisions and folders', async () => {
    await SourceStore.saveFolder({ id: 'f', roadmapId: 'r1', name: 'Mine' });
    const mine = await SourceStore.save({ ...source('a'), folderId: 'f' }); await SourceStore.save({ ...mine, name: 'Edited' });
    await SourceStore.save(source('b', 'r2'));
    await SourceStore.removeRoadmap('r1');
    expect(await SourceStore.list('r1')).toEqual({ sources: [], folders: [] });
    expect(await SourceStore.history('a')).toEqual([]);
    expect((await SourceStore.list('r2')).sources).toHaveLength(1);
  });
});
describe('analysis and aggregation', () => {
  it('status badge agrees with what analysis accepts', () => {
    const cases = [[{}, 'Ready'], [{ status: 'review' }, 'Needs review'], [{ status: 'error' }, 'Failed'],
      [{ language: 'ja', englishText: 'Translated.' }, 'Needs translation'], [{ language: 'ja', englishText: 'Translated.', translationApproved: true }, 'Ready']];
    for (const [patch, label] of cases) {
      const s = { ...source(), ...patch };
      expect(SourceLogic.status(s)[0]).toBe(label);
      if (label === 'Ready') expect(() => SourceLogic.text(s)).not.toThrow(); else expect(() => SourceLogic.text(s)).toThrow();
    }
  });
  it('attributes matching and advised evidence without collisions between sources', () => {
    const entry = { item_id: 'item', advices: [{ evidence_keypoint: { id: 'K2' } }] };
    const a = { source_ref: { id: 'a', revision: 2, name: 'Source A' }, roadmap_matches: [{ item_id: 'item', matched_evidence: [{ id: 'K1' }] }] };
    const b = { ...a, source_ref: { id: 'b', revision: 1, name: 'Source B' } };
    expect(SourceLogic.attribution(a, entry)).toContain('a@2:K1, a@2:K2');
    expect(SourceLogic.attribution(b, entry)).toContain('b@1:K1, b@1:K2');
    expect(SourceLogic.attribution({}, entry)).toBe('');
  });
  it('averages 70, 80, 90 to 80, using each selected source once', async () => {
    const snapshot = SourceLogic.snapshot(['a','b','c'].map(id => ({ ...source(id), revision: 1 })));
    const seen = []; const rows = await SourceLogic.run(snapshot, async s => { seen.push(s.source_ref.id); return result(s.source_ref, [.7,.8,.9][seen.length-1]); }, () => {}, () => false);
    expect(seen).toEqual(['a','b','c']); expect(SourceLogic.aggregate(rows, snapshot).severity).toBeCloseTo(.8);
  });
  it.each([[0, 'Maintain'], [.3499, 'Maintain'], [.35, 'Adjust'], [.6499, 'Adjust'], [.65, 'Revise'], [1, 'Revise']])('single source %s retains verdict %s', (score, verdict) => {
    const snapshot = SourceLogic.snapshot([{ ...source(), revision: 1 }]);
    const total = SourceLogic.aggregate([result(snapshot[0].source_ref, score)], snapshot); expect(total.severity).toBe(score); expect(total.verdict).toBe(verdict);
  });
  it('retains successes but never averages a failed subset', async () => {
    const snapshot = SourceLogic.snapshot(['a','b'].map(id => ({ ...source(id), revision: 1 })));
    const rows = await SourceLogic.run(snapshot, async s => { if (s.source_ref.id === 'b') throw new Error('Model unavailable'); return result(s.source_ref, .5); }, () => {}, () => false);
    expect(rows[0].severity).toBe(.5); expect(rows[1].error).toBe('Model unavailable'); expect(SourceLogic.aggregate(rows, snapshot)).toBeNull();
  });
  it('cancels between requests and rejects wrong attribution', async () => {
    const snapshot = SourceLogic.snapshot(['a','b'].map(id => ({ ...source(id), revision: 1 })));
    let stop = false;
    const rows = await SourceLogic.run(snapshot, async s => result(s.source_ref, .4), () => { stop = true; }, () => stop);
    expect(rows).toHaveLength(1); expect(SourceLogic.aggregate(rows, snapshot)).toBeNull();
    let late = false;
    const kept = await SourceLogic.run(snapshot, async s => { late = true; return result(s.source_ref, .4); }, () => {}, () => late);
    expect(kept.map(r => r.source_ref.id)).toEqual(['a']); // stopped mid-request: the returned result is kept
    const bad = await SourceLogic.run(snapshot, async () => result({ id: 'wrong' }, .5), () => {}, () => false);
    expect(bad.every(r => !!r.error)).toBe(true);
  });
  it('rejects duplicate IDs, empty selection and unsupported methods', () => {
    expect(() => SourceLogic.snapshot([])).toThrow(); expect(() => SourceLogic.snapshot([source(),source()])).toThrow('Duplicate');
    expect(() => SourceLogic.aggregate([], [], 'weighted')).toThrow('Unsupported');
  });
  it('warns about equal text without silently removing sources', () => {
    const snapshot = SourceLogic.snapshot([source(),source('b')]); expect(snapshot).toHaveLength(2); expect(SourceLogic.duplicates(snapshot)).toHaveLength(1);
  });
  it('requires review, translation approval, and bounded nonempty text', () => {
    expect(() => SourceLogic.text({ ...source(), status: 'review' })).toThrow('review');
    expect(() => SourceLogic.text({ ...source(), language: 'th' })).toThrow('translation');
    expect(() => SourceLogic.text({ ...source(), correctedText: ' ' })).toThrow('empty');
    expect(SourceLogic.text({ ...source(), language: 'ja', englishText: 'Translated', translationApproved: true })).toBe('Translated');
  });
  it('validates file limits and preserves PDF line order', () => {
    expect(() => SourceProcessing.validate({ name: 'a.pdf', size: 21*1024*1024 })).toThrow('20 MB');
    expect(() => SourceProcessing.validate({ name: 'a.exe', size: 20 })).toThrow('Supported');
    expect(SourceProcessing.textFromItems([{ str: '見出し', transform: [0,0,0,0,0,100], hasEOL: true }, { str: '本文', transform: [0,0,0,0,0,80] }])).toBe('見出し\n本文');
  });
  it('joins the split Thai sara am that OCR returns', () => {
    expect(SourceProcessing.cleanText('กําหนด สํานัก')).toBe('กำหนด สำนัก');
    expect(SourceProcessing.cleanText('กำหนด 見出し')).toBe('กำหนด 見出し');
  });
  it('explains an unreachable analysis service instead of "Failed to fetch"', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    try {
      await expect(SourceProcessing.url('https://example.com/a', 'http://127.0.0.1:7875/api/recommend'))
        .rejects.toThrow('Cannot reach the analysis service at 127.0.0.1:7875');
    } finally { globalThis.fetch = original; }
  });
});
describe('library export, import and folder names', () => {
  it('copies a library with files, folders and revisions under new IDs, and restores original IDs on undo', async () => {
    await SourceStore.saveFolder({ id: 'f', roadmapId: 'r1', name: 'Reports' });
    const first = await SourceStore.save({ ...source(), folderId: 'f', original: new Blob(['Original'], { type: 'text/plain' }) });
    await SourceStore.save({ ...first, correctedText: 'Corrected' });
    const exported = JSON.parse(JSON.stringify(await SourceStore.exportRoadmap('r1')));
    const ids = await SourceStore.importRoadmap('r2', exported);
    const copy = await SourceStore.list('r2');
    expect(copy.sources[0].id).toBe(ids.a); expect(ids.a).not.toBe('a');
    expect(copy.sources[0].folderId).toBe(copy.folders[0].id); expect(copy.folders[0].name).toBe('Reports');
    expect(await copy.sources[0].original.text()).toBe('Original');
    expect(await SourceStore.history(ids.a)).toHaveLength(2);
    expect((await SourceStore.list('r1')).sources[0].correctedText).toBe('Corrected');
    await SourceStore.removeRoadmap('r1');
    await SourceStore.importRoadmap('r1', exported, { keepIds: true });
    expect((await SourceStore.list('r1')).sources[0].id).toBe('a');
  });
  it('rejects damaged imports without writing anything', async () => {
    await expect(SourceStore.importRoadmap('r2', { format: 'x' })).rejects.toThrow('supported');
    await expect(SourceStore.importRoadmap('r2', { format: 'ddrm-sources', version: 1, folders: [], revisions: [], sources: [{ ...source(), revision: 1, name: '' }] })).rejects.toThrow('Name');
    expect((await SourceStore.list('r2')).sources).toEqual([]);
  });
  it('requires unique, bounded folder names per roadmap', async () => {
    await SourceStore.saveFolder({ id: 'f1', roadmapId: 'r1', name: 'Reports' });
    await expect(SourceStore.saveFolder({ id: 'f2', roadmapId: 'r1', name: ' reports ' })).rejects.toThrow('already exists');
    await expect(SourceStore.saveFolder({ id: 'f3', roadmapId: 'r1', name: 'x'.repeat(81) })).rejects.toThrow('80');
    await SourceStore.saveFolder({ id: 'f1', roadmapId: 'r1', name: 'Reports' });
    await SourceStore.saveFolder({ id: 'f4', roadmapId: 'r2', name: 'Reports' });
    expect((await SourceStore.list('r1')).folders).toHaveLength(1);
  });
});
