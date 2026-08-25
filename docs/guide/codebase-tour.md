# Tour of the codebase

Where everything lives, and — more usefully — **which files you can ignore**.

The whole backend is about 4,000 lines of Python and the frontend about 3,900
lines of JavaScript. That is small. You can read all of it in a weekend.

---

## The folder map

```text
Roadmapping/
│
├── README.md              ← installation + usage (the official manual)
├── CHANGELOG.md           ← history of changes, oldest at the bottom
├── IMPACT_VALUES_GUIDE.md ← how to tune the scoring numbers
├── mkdocs.yml             ← config for the site you are reading
├── requirements.txt       ← what the app needs
├── requirements-dev.txt   ← extra: tests, docs, optional dev UIs
│
├── src/                   ← ALL the Python
│   ├── config.py          ← ★ every tunable number lives here
│   ├── core/              ← ★ the seven pipeline stages
│   ├── api/               ← the web server
│   └── ui/                ← pipeline orchestration + optional dev UIs
│
├── roadmap_builder/       ← ALL the frontend (React, no build step)
│
├── tests/                 ← Python unit tests (pytest)
├── tools/                 ← command-line diagnostic scripts
├── testdata/              ← 10 labelled news scenarios + a roadmap fixture
├── docs/                  ← this handbook
│
├── final_reports/         ← submitted report PDF + abstracts
├── demo/                  ← demo video link
├── document/              ← report chapters and screenshots
├── references/            ← the research papers this builds on
└── archive/               ← old versions and junk; ignore it entirely
```

!!! tip "Two folders matter more than all the others"
    `src/core/` (the seven stages) and `src/config.py` (the numbers that control
    them). If you understand those two, you understand the system.

---

## The Python side

### The files you will actually read

| File | Lines | What it does |
| --- | --- | --- |
| **`src/config.py`** | 206 | Every threshold, weight, and model name. Start here. |
| `src/ui/app.py` | 266 | `run_pipeline()` — runs the seven stages in order |
| `src/api/roadmap_api.py` | 87 | The web server. Two endpoints, that is all. |

### The seven stages, `src/core/`

| File | Lines | Stage |
| --- | --- | --- |
| `extractor.py` | 178 | 1 — get article text from a URL |
| `keypoints.py` | 259 | 2 — pick the important sentences |
| `pestle.py` | 83 | 3 — sort into the six categories |
| `sentiment.py` | 81 | 4 — positive / negative / neutral |
| `router.py` | 16 | 4 — picks *which* sentiment model to use |
| `impact.py` | 208 | 5 — the scoring maths |
| `roadmap_matcher.py` | 129 | 6 — match evidence to roadmap items |
| `guidance.py` | 710 | 7 — write the review advice |

`guidance.py` is by far the biggest because it contains all the LLM prompt
construction, the JSON schema enforcement, and the parallel execution. The
deterministic fallback inside it is only a few dozen lines.

### The optional extras

These are **not needed to run the app**. They exist for development.

| File | Lines | What it is |
| --- | --- | --- |
| `src/ui/gradio_app.py` | 640 | An older Gradio UI over the same pipeline |
| `src/ui/keypoints_lab.py` | 198 | A sandbox for tuning sentence extraction |
| `tools/diagnose_impact.py` | 270 | Prints the full scoring chain for an article |
| `tools/e2e_check.py` | 35 | Replays all 10 scenarios, checks the verdicts |

!!! note "Why gradio_app.py is separate"
    It used to live inside `app.py`. That meant the API server loaded Gradio,
    Plotly and Pandas on every start-up just to reach `run_pipeline()`. Splitting
    them means the delivered app needs none of those three — they are in
    `requirements-dev.txt` now. **Do not merge them back.**

---

## The frontend side

`roadmap_builder/` is React, but with **no build step**. The browser downloads
the `.jsx` files and compiles them itself using Babel. That is why you can serve
it with `python -m http.server` and why there is no `npm run build`.

| File | Lines | What it is |
| --- | --- | --- |
| `index.html` | — | Loads everything, in order. Read this first. |
| `app.jsx` | 976 | Top-level state and routing |
| `impact-advisor.jsx` | 810 | The "Assess news" panel and results display |
| `modals.jsx` | 545 | Item editor, import/export, structure editing |
| `tweaks-panel.jsx` | 425 | Appearance settings |
| `start-screen.jsx` | 247 | Roadmap list and template picker |
| `roadmap-grid.jsx` | 225 | The grid itself |
| `data.jsx` | 189 | PESTLE definitions and the built-in templates |
| `coach-rail.jsx` | 129 | The guidance sidebar |
| `primitives.jsx` | 70 | Small shared components |
| `lib/exports.js` | 271 | Pure helper functions — **this is what the tests cover** |
| `styles.css` | 2,291 | All styling, with CSS custom properties at the top |

!!! warning "Script order in `index.html` matters"
    There are no `import` statements — every file dumps its names into the
    global scope, so they must load in dependency order. If you add a new
    `.jsx`, you must add a `<script>` tag in the right position.

### The cache-busting trick

Script tags look like `src="app.jsx?v=9"`. That `?v=` number forces browsers to
re-download after you change a file. **If you edit a `.jsx` and your change does
not appear, bump that number** in `index.html`.

---

## Where the data lives

There is **no database**. Roadmaps are stored in the browser's `localStorage`.

That means:

- Roadmaps are per-browser and per-machine.
- Clearing browser data deletes them.
- The Export button is the only real backup.

For a prototype this is the right call — it removes an entire tier of
infrastructure. If this ever needed multi-user support, that is the first thing
that would have to change.

---

## The tests

| Where | Runs with | Count |
| --- | --- | --- |
| `tests/` | `pytest` | 54 |
| `roadmap_builder/__tests__/` | `npm test` | 50 |
| `tools/e2e_check.py` | manual, backend running | 10 scenarios |

The unit tests deliberately **load no AI models**, which is why they finish in
under a second. Model behaviour is checked separately by the end-to-end script.

`tests/test_impact.py` is worth reading even if you do not care about testing —
it is a set of worked examples of the scoring maths.

See [Testing](../TESTING.md) for the full strategy.

---

## Things you can safely ignore

| Folder | Why ignore it |
| --- | --- |
| `archive/` | Old versions, an archived virtualenv, browser profile junk. Not in git. |
| `venv/` | Your installed packages. Regenerable. Not in git. |
| `__pycache__/` | Python bytecode. Regenerable. |
| `document/`, `references/` | Report material and source papers, not code. |

---

## Reading order for your first day

1. `src/config.py` — see every number the system uses
2. `src/ui/app.py`, function `run_pipeline()` — see the seven stages called in order
3. `src/core/impact.py` — the maths (and `tests/test_impact.py` alongside it)
4. `src/api/roadmap_api.py` — how the web request arrives
5. `roadmap_builder/index.html` then `impact-advisor.jsx` — how the UI calls it

That is roughly 900 lines. Everything else is detail you can look up when you
need it.

---

Next: [Common tasks](common-tasks.md).
