/* global React, Icon, Select, Check, SourceStore, SourceLogic, SourceProcessing */
const SOURCE_LANGUAGES = { en: 'English', th: 'Thai', ja: 'Japanese', mixed: 'Mixed', unknown: 'Not specified' };
const SOURCE_TYPES = { pdf: 'PDF', image: 'Image', text: 'Text file', url: 'Website', paste: 'Pasted text' };
// Badge tone and News Impact readiness come from SourceLogic.status, so the list predicts what analysis accepts.
function sourceQueue(source) {
  const [label, tone] = SourceLogic.status(source);
  return tone === 'ok' ? 'ready' : label === 'Needs translation' ? 'translate' : 'review';
}
function SourceBadge({ source }) {
  const [label, tone] = SourceLogic.status(source);
  return <span className={`badge ${tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : sourceQueue(source)}`}>{label}</span>;
}
function sourceDraft(roadmapId, name, type, language, folderId = '') {
  return { id: crypto.randomUUID(), roadmapId, revision: 0, name, type, language, folderId, tags: [],
    originalVersion: crypto.randomUUID(), original: null, extractedText: '', correctedText: '', englishText: '',
    translationApproved: false, status: 'pending', error: '', processing: null };
}
function SourcePreview({ source }) {
  const [url, setUrl] = React.useState('');
  const [show, setShow] = React.useState(false), [previewError, setPreviewError] = React.useState(''), [pages, setPages] = React.useState(0);
  const canvas = React.useRef(null);
  React.useEffect(() => {
    if (!(source.original instanceof Blob)) { setUrl(''); return; }
    const value = URL.createObjectURL(source.original); setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [source.original]);
  React.useEffect(() => {
    if (!show || source.type !== 'pdf' || !(source.original instanceof Blob)) return;
    const controller = new AbortController(); setPreviewError(''); setPages(0);
    SourceProcessing.previewPDF(source.original, canvas.current, controller.signal).then(setPages).catch(e => { if (!controller.signal.aborted) setPreviewError(e.message); });
    return () => controller.abort();
  }, [show, source.original, source.type]);
  return <>
    <div className="orig-row">
      <div className="drop-icon"><Icon name="file-text" size={14} /></div>
      <div>{source.originalUrl || source.originalFilename || 'Pasted text'}<span>{SOURCE_TYPES[source.type] || source.type}</span></div>
      {source.type === 'pdf' && url && <button type="button" className="link-btn" aria-expanded={show} onClick={() => setShow(v => !v)}>{show ? 'Hide preview' : 'Preview first page'}</button>}
      {url && <a href={url} download={source.originalFilename || source.name}>Download original</a>}
    </div>
    {url && source.type === 'image' && <img className="orig-img" src={url} alt={`Original ${source.name}`} />}
    {show && <><canvas className="orig-img" ref={canvas} aria-label={`First page of ${source.name}`} /><p className="field-help">{previewError || (pages ? `Page 1 of ${pages}. Download the original to view all pages.` : 'Loading preview…')}</p></>}
    {typeof source.original === 'string' && <pre className="raw">{source.original}</pre>}
  </>;
}
function SourceWorkspace({ roadmapId, apiUrl, onAssess, focusId, onFocused }) {
  if (!apiUrl) { try { apiUrl = localStorage.getItem('ddrm_advisor_api_url'); } catch {} }
  apiUrl ||= 'http://127.0.0.1:7875/api/recommend';
  const [library, setLibrary] = React.useState({ sources: [], folders: [] });
  const [loaded, setLoaded] = React.useState(false); // avoids flashing empty-library UI before storage answers
  const [selection, setSelection] = React.useState([]);
  const [folder, setFolder] = React.useState('all');
  const [query, setQuery] = React.useState(''), [type, setType] = React.useState(''), [languageFilter, setLanguageFilter] = React.useState('');
  const [draft, setDraftState] = React.useState(null), [dirty, setDirtyState] = React.useState(false);
  // Refs mirror the editor so storage refreshes (other tabs, list actions) can reconcile it without stale closures.
  const draftRef = React.useRef(null), dirtyRef = React.useRef(false), baseRef = React.useRef(null), touchedRef = React.useRef(new Set());
  const setDraft = v => { draftRef.current = typeof v === 'function' ? v(draftRef.current) : v; setDraftState(draftRef.current); };
  const setDirty = v => { dirtyRef.current = v; setDirtyState(v); };
  const loadDraft = source => { setDraft(source && structuredClone(source)); baseRef.current = source; touchedRef.current = new Set(); setDirty(false); };
  const [folderForm, setFolderForm] = React.useState(null); // { id: 'new' | folder id, name }
  const [candidate, setCandidate] = React.useState(null), [history, setHistory] = React.useState([]);
  const [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(false), [progress, setProgress] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [importMode, setImportMode] = React.useState('files'), [language, setLanguage] = React.useState('en');
  const [urlText, setUrlText] = React.useState(''), [pasteText, setPasteText] = React.useState(''), [importName, setImportName] = React.useState('');
  const [rotation, setRotation] = React.useState(0), [enhance, setEnhance] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(null), [dragOver, setDragOver] = React.useState(false);
  const [queue, setQueue] = React.useState('all'), [page, setPage] = React.useState(1), [pageSize, setPageSize] = React.useState(10);
  const controller = React.useRef(null), fileInput = React.useRef(null), replaceInput = React.useRef(null);
  const selected = React.useRef(selection); selected.current = selection;
  // Opened from a History link: show that source once the library has loaded.
  React.useEffect(() => {
    if (!loaded || !focusId) return;
    const source = library.sources.find(x => x.id === focusId);
    if (source) loadDraft(source);
    onFocused?.();
  }, [loaded, focusId]);
  async function refresh() {
    try {
      const data = await SourceStore.list(roadmapId); setLibrary(data); setLoaded(true);
      setSelection(current => current.filter(id => data.sources.some(s => s.id === id)));
      const open = draftRef.current, stored = open && data.sources.find(x => x.id === open.id);
      if (stored && stored.revision !== open.revision) {
        if (!dirtyRef.current) loadDraft(stored);
        else {
          // Rebase unsaved edits onto the newer revision unless the same field changed there too.
          const base = baseRef.current || {}, fields = [...touchedRef.current];
          if (fields.some(f => JSON.stringify(base[f]) !== JSON.stringify(stored[f]))) {
            setError('This source was also changed elsewhere in a field you are editing. Copy your edits, then click the source name to load the latest version.');
          } else {
            setDraft(cur => ({ ...structuredClone(stored), ...Object.fromEntries(fields.map(f => [f, cur[f]])) }));
            baseRef.current = stored;
          }
        }
      }
    } catch (e) { setError(`Cannot open source storage: ${e.message}`); }
  }
  React.useEffect(() => {
    refresh(); window.addEventListener('ddrm-sources-changed', refresh);
    const channel = new BroadcastChannel('ddrm_sources_v1'); channel.onmessage = refresh;
    return () => { window.removeEventListener('ddrm-sources-changed', refresh); channel.close(); controller.current?.abort(); };
  }, []);
  React.useEffect(() => {
    const guard = e => { if (dirty || candidate) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, candidate]);
  React.useEffect(() => {
    window.sourceNavigationGuard = () => !(dirty || candidate || busy) || confirm('Leave this page? Unsaved source edits and unfinished processing will be discarded.');
    return () => { delete window.sourceNavigationGuard; };
  }, [dirty, candidate, busy]);
  function leave() { return !(dirty || candidate) || confirm('Discard unsaved source edits or processing results?'); }
  function focus(source) {
    if (draftRef.current?.id === source.id || !leave()) return;
    loadDraft(source); setCandidate(null); setHistory([]); setError('');
    // Narrow screens stack the editor under the list: bring it into view.
    if (matchMedia('(max-width: 1100px)').matches) requestAnimationFrame(() => document.querySelector('.srcp .detail')?.scrollIntoView({ block: 'start' }));
  }
  function edit(field, value) {
    const resets = ['correctedText', 'language', 'englishText'].includes(field);
    setDraft(d => ({ ...d, [field]: value, ...(resets ? { translationApproved: false } : {}) }));
    touchedRef.current = new Set([...touchedRef.current, field, ...(resets ? ['translationApproved'] : [])]);
    setDirty(true);
  }
  function toggle(id) {
    setSelection(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  }
  async function action(fn) { setError(''); try { await fn(); await refresh(); return true; } catch (e) { setError(e.message); return false; } }
  async function save() {
    setSaving(true);
    try { await action(async () => {
      if (draft.status === 'ready' && !draft.correctedText.trim()) throw new Error('Reviewed text cannot be empty.');
      const value = await SourceStore.save(draftRef.current); loadDraft(value); setNotice('Saved source revision ' + value.revision);
    }); } finally { setSaving(false); }
  }
  async function importSources(files) {
    if (busy) return;
    setNotice(''); // an old "N imported" must not sit next to this attempt's error
    const entries = files ? Array.from(files) : importMode === 'urls' ? urlText.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [pasteText];
    if (!files && importMode === 'text' && (!importName.trim() || !pasteText.trim())) { setError(!importName.trim() ? 'Give the pasted source a name.' : 'Paste the source text.'); return; }
    if (!entries.length) { setError(importMode === 'urls' ? 'Enter at least one URL, one per line.' : 'Choose at least one file.'); return; }
    if (entries.length > 10) { setError(`Import up to 10 sources at a time (you added ${entries.length}).`); return; }
    setBusy(true); setError(''); setNotice(''); controller.current = new AbortController();
    const added = [], failures = [];
    try {
      for (const entry of entries) {
        if (controller.current.signal.aborted) break;
        const isFile = entry instanceof File;
        let source = sourceDraft(roadmapId, isFile ? entry.name : importMode === 'urls' ? entry : importName, isFile ? 'text' : importMode === 'urls' ? 'url' : 'paste', language, folder === 'all' ? '' : folder);
        source.original = entry; source.originalFilename = isFile ? entry.name : ''; source.originalUrl = source.type === 'url' ? entry : '';
        setProgress(`Importing ${source.name}`);
        try {
          let processing;
          if (isFile) {
            const ext = SourceProcessing.validate(entry); source.type = ext === 'pdf' ? 'pdf' : ext === 'txt' ? 'text' : 'image';
            processing = await SourceProcessing.file(entry, { language, signal: controller.current.signal, progress: setProgress });
          } else if (source.type === 'url') processing = await SourceProcessing.url(entry, apiUrl, controller.current.signal);
          else processing = { text: entry.trim(), method: 'paste', pages: [{ page: 1, text: entry.trim() }] };
          source.extractedText = processing.text; source.correctedText = processing.text; source.processing = processing;
          if (source.type === 'url') { source.name = processing.title || entry; source.original = processing.text; }
          source.status = 'review';
        } catch (e) { source.status = controller.current.signal.aborted ? 'cancelled' : 'error'; source.error = e.message; failures.push(`${source.name}: ${e.message}`); }
        // Failed imports are reported, not stored: the user still has the file or URL and can retry.
        if (source.status !== 'review') continue;
        try { const saved = await SourceStore.save(source); added.push(saved); }
        catch (e) { failures.push(`Not saved: ${source.name}: ${e.message}`); break; }
      }
      await refresh();
      if (added.length && !dirty && !candidate) focus(added[0]);
      if (added.length) setNotice(`${added.length} imported${failures.length ? `, ${failures.length} failed` : ''}. Review the extracted text before analysis.`);
      if (failures.length) setError(`${failures.length} of ${entries.length} not imported:\n${failures.join('\n')}`);
      if (!failures.length) { setUrlText(''); setPasteText(''); setImportName(''); if (added.length) setImportOpen(false); }
    } finally { setBusy(false); setProgress(''); if (fileInput.current) fileInput.current.value = ''; }
  }
  async function reprocess(replacement) {
    if (!draft || busy) return;
    setBusy(true); setError(''); controller.current = new AbortController();
    try {
      const original = replacement || draft.original;
      let processing;
      if (original instanceof Blob) processing = await SourceProcessing.file(original, { language: draft.language, rotation, enhance, forceOCR: true, signal: controller.current.signal, progress: setProgress });
      else if (draft.type === 'url') processing = await SourceProcessing.url(draft.originalUrl, apiUrl, controller.current.signal);
      else processing = { text: original, method: 'paste', pages: [{ page: 1, text: original }] };
      setCandidate({ ...draft, original: !replacement && draft.type === 'url' ? processing.text : original,
        originalVersion: crypto.randomUUID(), originalFilename: replacement?.name || draft.originalFilename,
        originalUrl: replacement ? '' : draft.originalUrl,
        type: replacement ? (replacement.name.toLowerCase().endsWith('.pdf') ? 'pdf' : replacement.name.toLowerCase().endsWith('.txt') ? 'text' : 'image') : draft.type,
        processing, extractedText: processing.text, correctedText: processing.text, status: 'review', error: '', translationApproved: false });
    } catch (e) { setError(e.message); } finally { setBusy(false); setProgress(''); if (replaceInput.current) replaceInput.current.value = ''; }
  }
  const inFolder = library.sources.filter(s => folder === 'all' || (s.folderId || '') === folder);
  const counts = { all: inFolder.length, review: 0, translate: 0, ready: 0 };
  inFolder.forEach(s => { counts[sourceQueue(s)]++; });
  const visible = inFolder.filter(s => (queue === 'all' || sourceQueue(s) === queue)
    && (!type || s.type === type) && (!languageFilter || s.language === languageFilter)
    && `${s.name} ${(s.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(visible.length / pageSize)), curPage = Math.min(page, pages);
  const paged = visible.slice((curPage - 1) * pageSize, curPage * pageSize);
  const showImport = importOpen ?? (loaded && !library.sources.length);
  const folderName = id => library.folders.find(f => f.id === id)?.name || 'Unfiled';
  const folderCount = id => library.sources.filter(s => (s.folderId || '') === id).length;
  const folderRows = [['all', 'All sources', library.sources.length], ['', 'Unfiled', folderCount('')], ...library.folders.map(f => [f.id, f.name, folderCount(f.id), f])];
  const readySelected = library.sources.filter(s => selection.includes(s.id) && SourceLogic.status(s)[1] === 'ok');
  const closeDraft = () => { if (leave()) { setDraft(null); setDirty(false); setCandidate(null); } };
  const date = value => value ? new Date(value).toLocaleString() : 'now';
  const saveFolderForm = async name => {
    const isNew = folderForm.id === 'new';
    const ok = await action(() => SourceStore.saveFolder(isNew ? { id: crypto.randomUUID(), roadmapId, name } : { ...folderForm.folder, name }));
    if (ok) setFolderForm(null);
  };
  const folderEditor = folderForm && <FolderEdit value={folderForm.name} placeholder="New folder" onChange={name => setFolderForm(f => ({ ...f, name }))}
    onSave={saveFolderForm} onCancel={() => setFolderForm(null)} />;
  const seg = [['ready', 'Ready', 'var(--c-green)'], ['translate', 'Needs translation', 'var(--c-slate)'], ['review', 'Needs review', 'var(--c-amber)']];

  return <section className="srcp pg" aria-label="Source library" id="main" role="main" tabIndex={-1}>
    <h1 className="visually-hidden">Sources</h1>
    <div className="layout">
      <nav className="rail" aria-label="Source folders">
        <h2 className="eyebrow">Folders</h2>
        {folderRows.map(([id, name, count, f]) => folderForm && f && folderForm.id === f.id ? <div key={id}>{folderEditor}</div>
          : <div key={id || 'unfiled'} className="folder-wrap">
            <button className={`folder ${folder === id ? 'on' : ''}`} title={name} aria-current={folder === id ? 'true' : undefined} onClick={() => { setFolder(id); setPage(1); }}>
              <span className="fname"><Icon name={id === 'all' ? 'layers' : id === '' ? 'inbox' : 'folder'} size={14} /><span>{name}</span></span>
              <span className="count" aria-hidden="true">{count}</span>
            </button>
            {f && <span className="factions">
              <button title="Rename folder" aria-label={`Rename folder ${f.name}`} onClick={() => setFolderForm({ id: f.id, name: f.name.slice(0, 80), folder: f })}><Icon name="pencil" size={12} /></button>
              <button className="del" title="Delete folder" aria-label={`Delete folder ${f.name}`} onClick={async () => { if (await confirmDeletion({ title: `Delete folder "${f.name}"?`, body: "Sources move to Unfiled.", confirmLabel: "Delete folder" })) action(async () => { await SourceStore.deleteFolder(f.id); setFolder('all'); }); }}><Icon name="trash" size={12} /></button>
            </span>}
          </div>)}
        <div className="rail-sep" />
        {folderForm?.id === 'new' ? folderEditor
          : <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setFolderForm({ id: 'new', name: '' })}><Icon name="plus" size={12} />New folder</button>}
        <div className="readiness">
          <div className="eyebrow">Ready for analysis</div>
          <div className="readiness-num"><b>{counts.ready}</b>of {inFolder.length} in {folder === 'all' ? 'library' : folderName(folder)}</div>
          <div className="rbar">{seg.map(([k, , col]) => counts[k] ? <i key={k} style={{ width: `${counts[k] / inFolder.length * 100}%`, background: col }} /> : null)}</div>
          <div className="rlegend">{seg.map(([k, l, col]) => <div key={k}><i style={{ background: col }} />{l}<b>{counts[k]}</b></div>)}</div>
        </div>
      </nav>

      <main className="list">
        <div className="list-head">
          <div><div className="eyebrow">Source library</div><h2>{folder === 'all' ? 'All sources' : folderName(folder)}<small>{visible.length}</small></h2></div>
          <button className={`btn ${showImport ? '' : 'btn-accent'}`} aria-expanded={showImport} aria-controls="source-import" onClick={() => setImportOpen(!showImport)}>
            <Icon name={showImport ? 'x' : 'plus'} size={13} />{showImport ? 'Close import' : 'Add sources'}</button>
        </div>
        {showImport && <section id="source-import" className="card import" aria-label="Add sources">
          <div className="import-top">
            <div className="segmented" role="group" aria-label="Import type">
              {[['files', 'Files'], ['urls', 'Website URLs'], ['text', 'Pasted text']].map(([value, name]) =>
                <button key={value} type="button" className={importMode === value ? 'on' : ''} aria-pressed={importMode === value} disabled={busy} onClick={() => setImportMode(value)}>{name}</button>)}
            </div>
            <label className="import-lang">Source / OCR language <Select value={language} disabled={busy} options={Object.entries(SOURCE_LANGUAGES)} onChange={setLanguage} /></label>
          </div>
          {importMode === 'files' ? <label className={`dropzone ${dragOver ? 'drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); importSources(e.dataTransfer.files); }}>
              <input className="visually-hidden" ref={fileInput} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" disabled={busy} onChange={e => importSources(e.target.files)} />
              <div className="drop-icon"><Icon name="upload" size={15} /></div>
              <div className="drop-title">{dragOver ? 'Drop to import' : 'Drop files here or click to browse'}</div>
              <div className="drop-sub">PDF, PNG, JPG, WebP or UTF-8 TXT</div>
            </label> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {importMode === 'text' && <div className="field"><label className="field-label" htmlFor="import-name">Source name</label><input id="import-name" className="field-input" value={importName} onChange={e => setImportName(e.target.value)} maxLength={300} required /></div>}
              <div className="field">
                <label className="field-label" htmlFor="import-text">{importMode === 'urls' ? 'One URL per line' : 'Source text'}</label>
                {importMode === 'urls'
                  ? <textarea id="import-text" className="field-textarea" rows={4} placeholder="https://…" value={urlText} onChange={e => setUrlText(e.target.value)} maxLength={200000} />
                  : <textarea id="import-text" className="field-textarea" rows={4} placeholder="Paste article or document text" value={pasteText} onChange={e => setPasteText(e.target.value)} maxLength={200000} />}
              </div>
              <div><button className="btn btn-accent" disabled={busy} onClick={() => importSources()}>Import sources</button></div>
            </div>}
          <div className="import-foot">Up to 10 at a time · 20 MB per file · 30 PDF pages. The first OCR run downloads language data. Review extracted text before analysis.</div>
        </section>}
        {busy && <div className="busy" role="status"><span className="spinner" aria-hidden="true" /><span>{progress || 'Processing…'}</span><button className="btn btn-sm" onClick={() => controller.current?.abort()}>Cancel processing</button></div>}
        {error && <div role="alert" className="bad-bar"><Icon name="alert-triangle" size={14} /><p>{error}</p><button className="btn btn-ghost btn-sm" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="x" size={11} /></button></div>}
        {notice && <div role="status" className="ok-bar"><Icon name="check" size={14} /><p>{notice}</p><button className="btn btn-ghost btn-sm" aria-label="Dismiss message" onClick={() => setNotice('')}><Icon name="x" size={11} /></button></div>}
        <div className="queue" role="group" aria-label="Show sources by status">
          {[['all', 'All', ''], ['review', 'Needs review', 'q-review'], ['translate', 'Needs translation', 'q-translate'], ['ready', 'Ready', 'q-ready']].map(([k, l, c]) =>
            <button key={k} className={`${c} ${queue === k ? 'on' : ''}`} aria-pressed={queue === k} onClick={() => { setQueue(k); setPage(1); }}><b>{counts[k]}</b><span>{l}</span></button>)}
        </div>
        <div className="filters">
          <label className="search"><span className="visually-hidden">Search name or tag</span><Icon name="search" size={13} aria-hidden="true" /><input className="field-input" type="search" placeholder="Search name or tag" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
          <Select aria-label="Filter by type" value={type} options={[['', 'All types'], ...Object.entries(SOURCE_TYPES)]} onChange={v => { setType(v); setPage(1); }} />
          <Select aria-label="Filter by language" value={languageFilter} options={[['', 'All languages'], ...Object.entries(SOURCE_LANGUAGES)]} onChange={v => { setLanguageFilter(v); setPage(1); }} />
        </div>
        <div className={`selbar ${selection.length ? 'active' : ''}`}>
          <strong role="status">{selection.length ? `${selection.length} selected${readySelected.length < selection.length ? ` · ${readySelected.length} ready` : ''}` : 'Tick sources to assess, move or delete together'}</strong>
          {!selection.length ? <button className="btn btn-ghost btn-sm" disabled={!paged.length} onClick={() => setSelection(paged.map(s => s.id))}>Select page</button> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelection([])}>Clear</button>
            <Select aria-label="Move selected sources" value="" placeholder="Move to…" options={[['unfiled', 'Unfiled'], ...library.folders.map(f => [f.id, f.name])]} onChange={target => action(async () => { for (const s of library.sources.filter(s => selection.includes(s.id))) await SourceStore.save({ ...s, folderId: target === 'unfiled' ? '' : target }); })} />
            <button className="btn btn-sm danger" disabled={busy || saving} onClick={async () => { if (await confirmDeletion({ title: `Delete ${selection.length} source${selection.length > 1 ? "s" : ""}?`, body: "Their revisions are deleted too.", confirmLabel: "Delete" })) action(async () => { await SourceStore.remove(selection); if (selection.includes(draft?.id)) { setDraft(null); setDirty(false); setCandidate(null); } }); }}><Icon name="trash" size={12} />Delete</button>
            {onAssess && <button className="btn btn-accent btn-sm" disabled={!readySelected.length || readySelected.length > SourceLogic.MAX_SOURCES}
              title={readySelected.length > SourceLogic.MAX_SOURCES ? `News Impact assesses up to ${SourceLogic.MAX_SOURCES} sources at a time.` : readySelected.length < selection.length ? 'Sources that still need review or translation are left out.' : undefined}
              onClick={() => { if (leave()) onAssess(readySelected.map(s => s.id)); }}><Icon name="search" size={12} />Assess {readySelected.length} on News Impact</button>}
          </>}
        </div>
        {!loaded ? <p className="field-help" role="status">Loading sources…</p> : !visible.length ? <div className="card empty">
          <Icon name={library.sources.length ? 'search' : 'book'} size={22} />
          <h2>{library.sources.length ? 'No sources match' : 'Your library is empty'}</h2>
          <p>{library.sources.length ? 'Change the folder, queue, search or filters.' : 'Add PDFs, images, text files, websites or pasted text.'}</p>
          {!library.sources.length && !showImport && <button className="btn btn-accent" onClick={() => setImportOpen(true)}>Add sources</button>}
        </div> : <>
          <ul className="card rows">{paged.map(s => { const on = selection.includes(s.id), focused = draft?.id === s.id; return <li key={s.id} className={`row ${focused ? 'focused' : ''}`} onClick={() => focus(s)}>
            <Check state={on ? 'on' : ''} label={`Select ${s.name}`} onClick={() => toggle(s.id)} />
            <button className="row-info" aria-current={focused ? 'true' : undefined}>
              <h3 title={s.name}>{s.name}</h3>
              <span className="row-meta"><span>{SOURCE_TYPES[s.type] || s.type}</span><span className="sep">·</span><span>{SOURCE_LANGUAGES[s.language]}</span><span className="sep">·</span><span>{folderName(s.folderId)}</span><span className="sep">·</span><span>rev {s.revision}</span>{(s.tags || []).map(t => <span key={t} className="tag">#{t}</span>)}</span>
            </button>
            <SourceBadge source={s} />
          </li>; })}</ul>
          {visible.length > 5 && <SourcePager page={curPage} setPage={setPage} size={pageSize} setSize={setPageSize} total={visible.length} />}
        </>}
      </main>

      <aside className="detail" aria-label="Source preview and editing">
        {!draft ? <div className="empty"><Icon name="file-text" size={24} /><h2>Nothing previewed</h2><p>Click a source to review its extracted text and edit details.</p></div>
        : <SourceDetail key={draft.id} draft={draft} dirty={dirty} edit={edit} busy={busy} saving={saving} folders={library.folders} candidate={candidate} date={date}
            onAccept={() => { setDraft(candidate); touchedRef.current = new Set(Object.keys(candidate)); setCandidate(null); setDirty(true); }} onDiscard={() => setCandidate(null)}
            rotation={rotation} setRotation={setRotation} enhance={enhance} setEnhance={setEnhance} reprocess={reprocess} replaceInput={replaceInput}
            history={history} loadHistory={() => action(async () => setHistory(await SourceStore.history(draft.id)))}
            onClose={closeDraft} onSave={save}
            onDelete={async () => { if (await confirmDeletion({ title: `Delete "${draft.name}"?`, body: "Its revisions are deleted too.", confirmLabel: "Delete source" })) action(async () => { await SourceStore.remove([draft.id]); setDraft(null); setDirty(false); setCandidate(null); }); }} />}
      </aside>
    </div>
    <footer className="app-foot" title="Library storage belongs to this browser and address. Clearing site data removes it; keep original files separately. Analysis sends approved text to your local API; hosted advice remains opt-in.">Library storage belongs to this browser and address. Clearing site data removes it; keep original files separately. Analysis sends approved text to your local API; hosted advice remains opt-in.</footer>
  </section>;
}

// Review → (translate) → ready, as the badges and News Impact see it.
function SourceDetail({ draft, dirty, edit, busy, saving, folders, candidate, date, onAccept, onDiscard, rotation, setRotation, enhance, setEnhance, reprocess, replaceInput, history, loadHistory, onClose, onSave, onDelete }) {
  const [showRaw, setShowRaw] = React.useState(false);
  const needsTr = draft.language !== 'en', reviewed = draft.status === 'ready';
  const stepState = k => k === 'extract' ? 'done' : k === 'review' ? (reviewed ? 'done' : 'active')
    : k === 'translate' ? (!reviewed ? '' : draft.translationApproved ? 'done' : 'active') : (reviewed && (!needsTr || draft.translationApproved) ? 'done' : '');
  const steps = [['extract', 'Extracted'], ['review', 'Reviewed'], ...(needsTr ? [['translate', 'Translated']] : []), ['ready', 'Ready for analysis']];
  const p = draft.processing;
  return <>
    <fieldset className="detail-inner" disabled={busy || saving}>
      <div className="dhead">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 className="eyebrow">Source details</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={12} />Close</button>
        </div>
        <label className="title-edit" title="Rename source"><input aria-label="Source name" value={draft.name} maxLength={300} placeholder="Untitled source" onChange={e => edit('name', e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); }} /><Icon name="pencil" size={14} /></label>
        <div className="dmeta"><SourceBadge source={draft} /><span>Revision {draft.revision}</span><span>·</span><span>Added {date(draft.createdAt)}</span><span>·</span><span>Modified {date(draft.modifiedAt)}</span></div>
        <div className="steps">{steps.map(([k, l]) => { const s = stepState(k); return <span key={k} className={s}>{s === 'done' && <Icon name="check" size={10} />}{l}</span>; })}</div>
      </div>

      {candidate && <section className="card candidate" aria-label="New processing result">
        <div className="sec-title"><div><div className="eyebrow">Reprocessed</div><h3>New processing result</h3></div></div>
        <div className="sec-body">
          <pre className="raw">{candidate.correctedText}</pre>
          <p className="field-help">Accepting replaces the editable draft, not the saved revision.</p>
          <div style={{ display: 'flex', gap: 6 }}><button className="btn btn-accent" onClick={onAccept}>Accept into draft</button><button className="btn" onClick={onDiscard}>Discard result</button></div>
        </div>
      </section>}

      <section className="card">
        <div className="sec-title"><div><div className="eyebrow">Step 1 · Check</div><h3>Review text</h3></div>
          <button className="btn btn-sm" aria-pressed={showRaw} onClick={() => setShowRaw(v => !v)}>{showRaw ? 'Hide' : 'Compare with'} raw extraction</button></div>
        <div className="sec-body">
          {draft.error && <p role="alert" className="bad-bar">{draft.error}</p>}
          {p?.method === 'ocr' && !reviewed && <div className="note-bar">OCR output can contain errors. Compare it with the original before marking it reviewed.</div>}
          <div className={showRaw ? 'compare' : ''}>
            {showRaw && <div className="field">
              <span className="field-label">Raw extracted · {p?.method || 'not processed'}{p?.elapsedMs != null ? ` · ${p.elapsedMs} ms` : ''}</span>
              <pre className="raw">{draft.extractedText}</pre>
              {p?.pages?.length > 1 || p?.pages?.some(pg => pg.confidence != null) ? <div className="field-help">{p.pages.map(pg => <div key={pg.page}>Page {pg.page}: {pg.method || 'text'}{pg.confidence != null ? ` · OCR confidence ${pg.confidence.toFixed(1)} (not accuracy)` : ''}</div>)}</div> : null}
            </div>}
            <div className="field"><label className="field-label" htmlFor="source-corrected">Corrected source text</label>
              <textarea id="source-corrected" className="field-textarea" rows={12} value={draft.correctedText} maxLength={200000} onChange={e => { edit('correctedText', e.target.value); edit('status', 'review'); }} /></div>
          </div>
          <SignOff done={reviewed} title="Not yet reviewed" help="Compare the text above with the original, then confirm. Required before assessment."
            action="Mark as reviewed" doneTitle="Extracted text reviewed" doneHelp="Confirmed by you. Editing the text clears this."
            onConfirm={() => edit('status', 'ready')} onUndo={() => edit('status', 'review')} />
        </div>
      </section>

      {needsTr && <section className="card">
        <div className="sec-title"><div><div className="eyebrow">Step 2 · Translate</div><h3>English translation</h3></div></div>
        <div className="sec-body">
          <p className="field-help">Non-English sources are scored from a reviewed English translation. Later changes to the original or translated text untick the approval.</p>
          <textarea className="field-textarea" aria-label="Reviewed English translation" rows={6} placeholder="Reviewed English translation" value={draft.englishText} maxLength={200000} onChange={e => edit('englishText', e.target.value)} />
          {draft.englishText.trim() && draft.englishText.trim().length < draft.correctedText.trim().length / 4 && <p role="status" className="field-help warn">
            ⚠ The translation is much shorter than the source ({draft.englishText.trim().length.toLocaleString()} vs {draft.correctedText.trim().length.toLocaleString()} characters). Only the English text is scored, so a summary can change the result.</p>}
          <SignOff done={draft.translationApproved} title="Translation not yet checked" help={`Check the English against the ${SOURCE_LANGUAGES[draft.language]} source, then confirm.`}
            action="Mark as checked" doneTitle="Translation checked" doneHelp="Confirmed by you. Editing either text clears this."
            onConfirm={() => { edit('translationApproved', true); edit('approvedFor', `${draft.language}\n${draft.correctedText}`); }} onUndo={() => edit('translationApproved', false)} />
        </div>
      </section>}

      <section className="card">
        <div className="sec-title"><div><div className="eyebrow">Metadata</div><h3>Details</h3></div></div>
        <div className="sec-body">
          <div className="grid3">
            <div className="field"><span className="field-label">Language</span><Select aria-label="Language" value={draft.language} options={Object.entries(SOURCE_LANGUAGES)} onChange={v => edit('language', v)} /></div>
            <div className="field"><span className="field-label">Folder</span><Select aria-label="Folder" value={draft.folderId || ''} options={[['', 'Unfiled'], ...folders.map(f => [f.id, f.name])]} onChange={v => edit('folderId', v)} /></div>
            <div className="field"><label className="field-label" htmlFor="source-tags">Tags, comma separated</label><input id="source-tags" className="field-input" value={draft.tags.join(',')} onChange={e => edit('tags', e.target.value.split(','))} /></div>
          </div>
        </div>
        <details className="disclosure"><summary>Original source</summary><div className="sec-body"><SourcePreview source={draft} open /></div></details>
        <details className="disclosure"><summary>Replace or reprocess</summary><div className="sec-body">
          <p className="field-help">Results appear for comparison before you accept them.</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ width: 120 }}><span className="field-label">Rotation</span><Select aria-label="Rotation" value={rotation} options={[0, 90, 180, 270].map(n => [n, `${n}°`])} onChange={setRotation} /></div>
            <label className="check-inline" style={{ paddingBottom: 8 }}><Check state={enhance ? 'on' : ''} label="Upscale, grayscale and contrast" onClick={() => setEnhance(!enhance)} />Upscale / grayscale / contrast</label>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" disabled={busy} onClick={() => reprocess()}><Icon name="wand" size={12} />Reprocess original (force OCR for PDF)</button>
            <label className="btn btn-sm">Replace file<input className="visually-hidden" ref={replaceInput} type="file" disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" onChange={e => { if (e.target.files[0]) reprocess(e.target.files[0]); }} /></label>
          </div>
        </div></details>
        <details className="disclosure" onToggle={e => { if (e.currentTarget.open) loadHistory(); }}><summary>Saved revisions <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-faint)', fontWeight: 600 }}>{draft.revision}</span></summary>
          <div className="sec-body" style={{ gap: 6 }}>
            {history.length ? history.map(s => <details key={s.revision} className="rev"><summary><b>Revision {s.revision}</b><span>{date(s.modifiedAt)}</span>{s.revision === draft.revision && <span className="badge ok">Current</span>}</summary>
              <div><SourcePreview source={s} /><pre className="raw">{s.correctedText}</pre></div></details>) : <p className="field-help">No earlier revisions.</p>}
          </div>
        </details>
      </section>
    </fieldset>
    <div className="savebar">
      <span className={`state ${dirty ? 'dirty' : ''}`}>{dirty ? 'Unsaved changes' : 'No unsaved changes'}</span>
      <button className="btn btn-destroy" disabled={busy} onClick={onDelete}><Icon name="trash" size={13} />Delete source</button>
      <button className="btn btn-accent" disabled={busy || !dirty} onClick={onSave}>{saving ? 'Saving…' : 'Save revision'}</button>
    </div>
  </>;
}

function SignOff({ done, title, help, doneTitle, doneHelp, action, onConfirm, onUndo }) {
  return <div className={`signoff ${done ? 'done' : ''}`}>
    <div className="signoff-seal"><Icon name={done ? 'check' : 'file-text'} size={14} /></div>
    <div className="signoff-text" role="status"><b>{done ? doneTitle : title}</b><span>{done ? doneHelp : help}</span></div>
    {done ? <button className="btn btn-sm btn-undo" onClick={onUndo}><Icon name="undo" size={12} />Undo</button>
      : <button className="btn btn-sm" onClick={onConfirm}><Icon name="check" size={12} />{action}</button>}
  </div>;
}

// Inline folder name editor: Enter or leaving the field saves, Escape cancels.
function FolderEdit({ value, onChange, onSave, onCancel, placeholder }) {
  const done = () => value.trim() ? onSave(value.trim()) : onCancel();
  return <div className="folder-edit">
    <div className="folder-edit-row"><Icon name="folder" size={14} />
      <input autoFocus aria-label="Folder name" maxLength={80} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} onBlur={done}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }} /></div>
    <small>Enter to save · Esc to cancel</small>
  </div>;
}

// Page numbers with the first, last and neighbours of the current page; gaps shown as "…".
function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const a = [...new Set([1, total, cur - 1, cur, cur + 1])].filter(n => n >= 1 && n <= total).sort((x, y) => x - y), out = [];
  a.forEach((n, i) => { if (i && n - a[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}

function SourcePager({ page, setPage, size, setSize, total }) {
  const pages = Math.max(1, Math.ceil(total / size)), from = total ? (page - 1) * size + 1 : 0, to = Math.min(total, page * size);
  return <div className="pager">
    <span className="pager-range">Showing <b>{from}–{to}</b> of <b>{total}</b></span>
    <label>Per page<Select aria-label="Sources per page" value={size} options={[5, 10, 20, 50].map(n => [n, String(n)])} onChange={n => { setSize(n); setPage(1); }} /></label>
    <nav className="pager-pages" aria-label="Pages">
      <button disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
      {pageList(page, pages).map((n, i) => n === '…' ? <span key={'g' + i} className="gap">…</span>
        : <button key={n} className={n === page ? 'on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>)}
      <button disabled={page === pages} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
    </nav>
  </div>;
}
