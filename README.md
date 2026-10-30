# Roadmap Review

Build a technology roadmap, add news articles and reports, and see how they
affect it. For each source the app answers **Maintain**, **Adjust** or
**Revise**, shows the sentences behind that answer, and suggests which roadmap
items to review. The final decision is always yours.

## What you need

- A Windows 10 or 11 computer (the tested setup).
- **Python 3.14** from [python.org](https://www.python.org/downloads/). During
  installation, tick **Add python.exe to PATH**.
- **Node.js 24** (LTS) from [nodejs.org](https://nodejs.org/).
- Internet access and several GB of free disk space. The first run downloads
  the AI models.

## Install (once)

1. Open the project folder in File Explorer.
2. Click the address bar, type `powershell` and press **Enter**. A blue window
   opens in this folder.
3. Copy **one** of the two blocks below into it, press **Enter** and wait
   until it finishes (about 10 minutes).

   **A. Any computer (CPU):**

   ```powershell
   python -m venv .venv-cpu
   .\.venv-cpu\Scripts\python.exe -m pip install -r requirements.lock
   cd roadmap_builder; npm.cmd ci; cd ..
   ```

   **B. Computer with an NVIDIA graphics card (GPU, about 35 times faster:
   0.6 s instead of 22 s per source, same results):**

   ```powershell
   python -m venv .venv-gpu
   .\.venv-gpu\Scripts\python.exe -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cu130
   .\.venv-gpu\Scripts\python.exe -m pip install -r requirements.lock
   cd roadmap_builder; npm.cmd ci; cd ..
   ```

   You can install both. They live in the folders `.venv-cpu` and `.venv-gpu`.

## Start the app (every time)

Double-click **`Start Roadmap Review.cmd`** in the project folder. It starts both
parts in one window (using `.venv-gpu` if installed, else `.venv-cpu`) and opens
<http://127.0.0.1:8000>. Close that window to stop the app.

To start the parts by hand instead, open **two** PowerShell windows in the
project folder (steps 1–2 above).

**Window 1: the analysis service.** Leave it open.

```powershell
.\.venv-cpu\Scripts\python.exe src\api\roadmap_api.py
```

With the GPU version (B), use `.\.venv-gpu\Scripts\python.exe` instead.

**Window 2: the web page.** Leave it open.

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory roadmap_builder
```

Then open **<http://127.0.0.1:8000>** in your browser. To stop the app, close
both windows.

## Use it

1. **Create a roadmap.** Click **New roadmap** and pick a template, for
   example **Industrial Digital**, or choose **Blank canvas**.
2. **Add sources.** Open the **Sources** tab. Add files (PDF, image, TXT), web
   addresses or pasted text. Read the extracted text, fix any errors, tick
   **I reviewed this extracted text** and click **Save revision**. For Thai,
   Japanese or other languages, also add an English translation and tick the
   approval box.
3. **Assess the news.** Open **News Impact**, tick up to 10 sources and click
   **Assess**. Each source gets its own result; the overall score appears when
   all of them finish.
4. **Add advice.** Tick the advice cards you agree with and click **Add … to
   roadmap**. The affected items get a **REVISE** or **ADJUST** badge and a
   note that names the source. Adding the same advice again is skipped.

If an assessment fails (for example the analysis service is not running), the
previous results stay on screen. Changing a setting marks results as out of
date instead of deleting them; click **Assess** again to refresh them.

How long it takes: in the first minute after starting Window 1, the service
is still loading its AI models. After that, each source takes about 20–30
seconds, or under 1 second with the GPU version.

## Keep your work safe

- Roadmaps and sources are saved **only in this browser**. There is no
  server database, so clearing browser data deletes them.
- For a backup, open a roadmap and click **Export → Download with sources**.
  Restore it with **Import**.
- Always use the same address, **<http://127.0.0.1:8000>**. A different
  address (for example `localhost:8000`) opens an empty app.

## Good to know

- Limits: 20 MB per file, 30 PDF pages, and 10 sources per assessment.
- The scoring models understand **English only**. Other languages are scored
  from the English translation you approve.
- Text read from scans and photos (OCR) can contain mistakes. Check it before
  you assess. The first OCR in a language downloads that language's data.
- The score measures how strongly the news affects the roadmap. It does not
  say whether the source is reliable.
- **AI-written advice (optional, off by default).** Copy `.env.example` to
  `.env`, add your `OPENROUTER_API_KEY`, set `DDRM_EXTERNAL_AI=on`, restart
  Window 1, and tick **Use hosted AI guidance** in the News Impact settings.
  Without it, advice is written by fixed rules and nothing leaves your
  computer.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| "Cannot reach the analysis service" | Window 1 is closed or failed. Start it again. <http://127.0.0.1:7875/api/health> should show `{"status":"ok"}`. |
| The first assessment is slow | Wait a minute after starting Window 1; the models are loading. |
| Every assessment takes 20–30 s | Normal without a graphics card. Install the GPU version (B) for under 1 s. |
| My roadmaps are gone | Check the address is exactly `http://127.0.0.1:8000`, or import your backup. |
| `python` or `npm` is "not recognized" | Reinstall Python (tick **Add to PATH**) or Node.js, then open a new PowerShell window. |

## For developers

Install the developer tools (tests, MkDocs, Gradio) with
`.\.venv-cpu\Scripts\python.exe -m pip install -r requirements-dev.lock`
(or the same with `.venv-gpu`). Use either environment in the commands below.

| Command (from the project folder) | What it checks |
| --- | --- |
| `.\.venv-cpu\Scripts\python.exe -m pytest` | Python unit tests (no AI models needed) |
| `cd roadmap_builder; npm.cmd test` | JavaScript helper tests |
| `.\.venv-cpu\Scripts\python.exe tools\e2e_check.py` | The 10 English news scenarios against the running service; must match `docs/readiness/baseline.json` |

Status on 2026-10-21: 102 Python tests and 85 JavaScript tests pass, and all
10 scenarios match the recorded baseline on both CPU and GPU.

```text
src/api/roadmap_api.py   web service the page talks to (port 7875)
src/ui/app.py            the assessment pipeline, run_pipeline()
src/core/                text extraction, key points, PESTLE, sentiment, scoring, advice
src/config.py            models, weights and thresholds: read this before tuning
roadmap_builder/         the web page (React, no build step) and its tests
tests/  testdata/        Python tests and the labelled news scenarios
tools/                   scenario runner and diagnostics
```

- All models load in float32 through `model_load_args()` in
  `src/core/router.py`. A float16 checkpoint once made each assessment take
  minutes on a CPU, and a test now guards this.
- Re-run `tools\e2e_check.py` after any change to models, scoring or the
  Python environment.
- Further reading: [Changelog](CHANGELOG.md), [archive](archive/README.md),
  and the handbook in `docs/` ([index](docs/index.md),
  [architecture](docs/ARCHITECTURE.md), [testing](docs/TESTING.md)).
  `docs/` and `archive/` are kept locally and are not in a Git clone.

## License

See [LICENSE](LICENSE).
