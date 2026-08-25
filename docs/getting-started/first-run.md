# 2. Run the app

The application is **two programs running at the same time**. You need two
terminal windows. Both must be inside the activated virtual environment.

---

## Terminal 1 — the backend

This is the Python API that does the actual analysis.

```bash
python src/api/roadmap_api.py
```

Leave it running. You should see something like:

```text
INFO:     Uvicorn running on http://127.0.0.1:7875 (Press CTRL+C to quit)
```

Check it is alive by opening <http://127.0.0.1:7875/api/health> in a browser.
You should see:

```json
{"status":"ok"}
```

!!! success "That is the whole backend"
    If you see `{"status":"ok"}`, the Python side is working. No database to
    set up, no migrations, nothing else to configure.

---

## Terminal 2 — the web page

Open a **second** terminal, activate the venv again, then:

```bash
cd roadmap_builder
```

```bash
python -m http.server 8000
```

This just serves the files in that folder. There is no build step and no
bundler — the browser compiles the React code itself as it loads.

Now open <http://127.0.0.1:8000> in your browser.

You should see the **DDRM Builder** start screen, saying "No roadmaps yet".

---

## What you should be looking at

```
   Browser  ──────────────►  http://127.0.0.1:8000
   (the UI)                  (Terminal 2: static file server)
       │
       │  when you click "Run assessment", the page
       │  sends your news text + roadmap as JSON
       ▼
   http://127.0.0.1:7875/api/recommend
   (Terminal 1: the Python backend, where all the thinking happens)
```

The web page holds your roadmaps in the browser's own storage
(`localStorage`). Nothing is saved on a server. Clearing your browser data
deletes your roadmaps, so use the Export button for anything you care about.

---

## Stopping everything

Press ++ctrl+c++ in each terminal.

---

## Quick sanity check

Want proof the whole pipeline works end to end? With the backend running:

```bash
python tools/e2e_check.py
```

This replays all ten test scenarios in `testdata/` and checks each produces the
verdict its filename promises. It takes about 8 minutes because it runs the real
AI models. You should see:

```text
PASS  adjust_01_chip_export_controls.txt   expected=Adjust   got=Adjust   severity=0.5000
...
all scenarios matched
```

!!! note
    If some scenarios fail, do not panic — check
    [Troubleshooting](../guide/troubleshooting.md#the-verdicts-are-wrong)
    first. The most common cause is a changed keypoint setting, not a broken
    model.

---

Next: [3. Your first assessment](first-assessment.md).
