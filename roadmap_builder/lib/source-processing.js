globalThis.SourceProcessing = (() => {
  const MAX_BYTES = 20 * 1024 * 1024, MAX_PAGES = 30, MAX_PIXELS = 16000000;
  const languages = { en: 'eng', th: 'tha+eng', ja: 'jpn+eng', mixed: 'tha+jpn+eng', unknown: 'tha+jpn+eng' };
  function check(signal) { if (signal?.aborted) throw new Error('Processing cancelled. Saved content is unchanged.'); }
  async function bounded(promise, signal) {
    let timer, abort;
    try {
      check(signal);
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Processing exceeded two minutes. Retry with a smaller source or check language-data connectivity.')), 120000);
        abort = () => reject(new Error('Processing cancelled. Saved content is unchanged.'));
        signal?.addEventListener('abort', abort, { once: true });
      })]);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  function validate(file) {
    if (!file?.size) throw new Error('File is empty.');
    if (file.size > MAX_BYTES) throw new Error('Files must be 20 MB or smaller.');
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt'].includes(ext)) throw new Error('Supported files: PDF, PNG, JPEG, WebP and UTF-8 TXT.');
    return ext;
  }
  async function pdfLibrary() {
    const pdf = await import('../node_modules/pdfjs-dist/build/pdf.mjs');
    pdf.GlobalWorkerOptions.workerSrc = new URL('node_modules/pdfjs-dist/build/pdf.worker.mjs', document.baseURI).href;
    return pdf;
  }
  function canvasFor(width, height) {
    if (width * height > MAX_PIXELS) throw new Error('Image exceeds 16 megapixels. Resize it before importing.');
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width); canvas.height = Math.ceil(height); return canvas;
  }
  function prepare(image, rotation, enhance) {
    const scale = enhance ? Math.min(2, 2400 / Math.max(image.width, image.height)) : 1;
    const w = Math.max(1, Math.round(image.width * Math.max(scale, 1))), h = Math.max(1, Math.round(image.height * Math.max(scale, 1)));
    const canvas = canvasFor(rotation % 180 ? h : w, rotation % 180 ? w : h);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180);
    if (enhance) ctx.filter = 'grayscale(1) contrast(1.2)';
    ctx.drawImage(image, -w / 2, -h / 2, w, h); return canvas;
  }
  function textFromItems(items) {
    let lastY = null, text = '';
    for (const item of items) {
      if (!('str' in item)) continue;
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 3 && !text.endsWith('\n')) text += '\n';
      text += item.str + (item.hasEOL ? '\n' : ' '); lastY = y;
    }
    return text.trim();
  }
  async function file(file, options = {}) {
    const { language = 'en', rotation = 0, enhance = false, forceOCR = false, signal, progress = () => {} } = options;
    const ext = validate(file), started = performance.now();
    let worker, doc, loading;
    const pages = [];
    check(signal);
    async function ocr(image, page) {
      check(signal);
      if (!worker) {
        const creating = Tesseract.createWorker(languages[language], 1, {
        workerPath: new URL('node_modules/tesseract.js/dist/worker.min.js', document.baseURI).href,
        corePath: new URL('node_modules/tesseract.js-core/', document.baseURI).href,
        // Measured on the fixed Thai/Japanese corpus; see local OCR report.
        langPath: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e12c65a915945e4c28e237a9b52bc4a8f39a0cec',
        gzip: false,
        cachePath: 'ddrm-best-e12c65a',
        logger: m => progress(`Page ${page}: ${m.status} ${Math.round((m.progress || 0) * 100)}%`)
        });
        try { worker = await bounded(creating, signal); }
        catch (e) { creating.then(w => w.terminate()).catch(() => {}); throw e; }
      }
      check(signal);
      const canvas = prepare(image, rotation, enhance);
      let timer, abort;
      try {
        const result = await Promise.race([
          worker.recognize(canvas),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('OCR exceeded two minutes on this page. Try a smaller image.')), 120000);
            abort = () => reject(new Error('Processing cancelled. Saved content is unchanged.'));
            signal?.addEventListener('abort', abort, { once: true });
          })
        ]);
        return { page, method: 'ocr', text: result.data.text, confidence: result.data.confidence };
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); canvas.width = canvas.height = 0; }
    }
    try {
      if (ext === 'txt') {
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
        catch { throw new Error('TXT must be UTF-8. Re-save the file as UTF-8 and retry.'); }
        pages.push({ page: 1, method: 'text', text });
      } else if (ext === 'pdf') {
        const pdf = await pdfLibrary();
        loading = pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false,
          cMapUrl: new URL('node_modules/pdfjs-dist/cmaps/', document.baseURI).href, cMapPacked: true,
          standardFontDataUrl: new URL('node_modules/pdfjs-dist/standard_fonts/', document.baseURI).href,
          wasmUrl: new URL('node_modules/pdfjs-dist/wasm/', document.baseURI).href });
        loading.onPassword = () => loading.destroy();
        doc = await bounded(loading.promise, signal);
        if (doc.numPages > MAX_PAGES) throw new Error('PDF exceeds 30 pages. Split it into smaller documents.');
        for (let i = 1; i <= doc.numPages; i++) {
          check(signal); progress(`Reading page ${i} of ${doc.numPages}`);
          const page = await bounded(doc.getPage(i), signal);
          const text = textFromItems((await bounded(page.getTextContent(), signal)).items);
          if (text && !forceOCR) pages.push({ page: i, method: 'pdf-text', text });
          else {
            const viewport = page.getViewport({ scale: 2 });
            const canvas = canvasFor(viewport.width, viewport.height);
            try { await bounded(page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise, signal); pages.push(await ocr(canvas, i)); }
            finally { canvas.width = canvas.height = 0; }
          }
          page.cleanup();
        }
      } else {
        let image;
        try { image = await createImageBitmap(file); } catch { throw new Error('Image is corrupt or does not match a supported format.'); }
        try { pages.push(await ocr(image, 1)); } finally { image.close(); }
      }
      check(signal);
      const text = cleanText(pages.map(p => p.text).join('\n\n\f\n\n')).trim();
      if (!text) throw new Error(ext === 'txt' ? 'The text file has no readable text (only spaces or blank lines).'
        : 'No readable text found. Retry with another language, rotation or a clearer image.');
      if (text.length > SourceLogic.MAX_TEXT) throw new Error('Extracted text exceeds 200,000 characters. Split the source.');
      return { text, pages, method: pages.some(p => p.method === 'ocr') ? 'ocr' : ext === 'pdf' ? 'pdf-text' : 'text',
        settings: { language, rotation, enhance, forceOCR, pdfjs: '6.4.299', tesseract: '6.0.1', languageData: 'tessdata_best@e12c65a915945e4c28e237a9b52bc4a8f39a0cec' }, elapsedMs: Math.round(performance.now() - started) };
    } catch (e) {
      check(signal);
      if (loading && !doc) throw new Error('Cannot open PDF. It may be encrypted or corrupt; supply an unlocked PDF.');
      throw e;
    } finally { if (worker) await worker.terminate(); if (loading) await loading.destroy(); }
  }
  // NFC leaves Thai sara am split (U+0E4D U+0E32), as Tesseract emits it; join it to U+0E33.
  function cleanText(text) { return text.normalize('NFC').replace(/ํา/g, 'ำ'); }
  async function url(url, apiUrl, signal) {
    const endpoint = apiUrl.replace(/\/recommend\/?$/, '/extract');
    let response;
    try { response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal }); }
    catch (e) {
      // fetch rejects with a bare TypeError ("Failed to fetch") when the service is down or unreachable.
      if (e?.name !== 'TypeError') throw e;
      let where = 'the analysis service';
      try { where = `the analysis service at ${new URL(endpoint).host}`; } catch {}
      throw new Error(`Cannot reach ${where}. Check that it is running (see Settings), then retry.`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'URL extraction failed. Check the URL or paste text.');
    return { ...data, pages: [{ page: 1, method: 'html', text: data.text }], settings: {}, elapsedMs: null };
  }
  async function previewPDF(file, canvas, signal) {
    const pdf = await pdfLibrary();
    const loading = pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    loading.onPassword = () => loading.destroy();
    try {
      const doc = await bounded(loading.promise, signal), page = await bounded(doc.getPage(1), signal);
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1.5, 800 / Math.max(size.width, size.height)) });
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await bounded(page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise, signal);
      return doc.numPages;
    } finally { await loading.destroy(); }
  }
  return { validate, file, url, textFromItems, cleanText, previewPDF };
})();
