# Contributing

A workflow handbook for the next developer (likely an intern). Read
`ARCHITECTURE.md`, `PIPELINE.md`, and `FRONTEND.md` first if you haven't.

---

## First-day setup

```bash
git clone <repo>
cd roadmapping

python -m venv venv
venv\Scripts\activate                # Windows
# source venv/bin/activate           # macOS / Linux

pip install -r requirements.txt
pip install -r requirements-dev.txt

cd roadmap_builder && npm install && cd ..
```

Smoke-check the install:

```bash
pytest                               # → 54 tests, < 1 second
cd roadmap_builder && npm test       # → 24 tests, < 1 second
```

If both are green, you can run the app (see README quickstart).

---

## Running the app

Two terminals:

```bash
# Terminal 1 — advisor API
python src/api/roadmap_api.py
# serves on 127.0.0.1:7875

# Terminal 2 — browser UI
cd roadmap_builder && python -m http.server 8000
# open http://127.0.0.1:8000
```

For LLM-powered expert advice, drop a `.env` at the repo root:

```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-4o-mini      # optional, this is the default
```

Without a key the app silently falls back to deterministic guidance — every
feature still works, advice is just more generic.

---

## Running tests

```bash
pytest                                  # backend (from repo root) — 54 tests
pytest tests/test_impact.py -v          # one file, verbose
pytest -k "discretize"                  # by keyword

cd roadmap_builder && npm test          # frontend (one-shot) — 50 tests
cd roadmap_builder && npm run test:watch   # frontend (re-runs on save)
```

Tests use only canned dicts — no transformer models load — so the suite
should always finish in under 2 seconds combined. If it gets slow, something
is wrong.

For the full breakdown of coverage, philosophy, and how to write a new test,
read [`TESTING.md`](TESTING.md).

---

## Pre-commit checklist

Before opening a PR or pushing:

1. **`pytest`** is green.
2. **`npm test`** in `roadmap_builder/` is green.
3. **Both servers start** — `python src/api/roadmap_api.py` and the static
   server. `curl http://127.0.0.1:7875/api/health` returns
   `{"status":"ok"}`.
4. Click through one news-impact analysis end-to-end with a real article —
   tests don't catch UI regressions.
5. If you changed pure helpers in `app.jsx`, **mirror them in
   `lib/exports.js`**. The maintenance contract is in that file's header.
6. If you changed the `Item` shape or `RoadmapState`, **add a localStorage
   migration** (see Deferred Work below — there is no migration framework
   yet, so for now write a one-off migration in `loadRoadmapCollection`).
7. No new files in `docs/` unless you also add an `!docs/<file>.md` entry to
   `.gitignore` — the rest of `docs/` is local-only on purpose.

---

## Where do I add X?

| I want to… | File | Function / location |
|------------|------|---------------------|
| Tune verdict thresholds | `src/config.py` | `DDRM_THRESHOLDS` |
| Add a new sentiment model | `src/config.py` | `PESTLE_MODELS` |
| Tweak the impact formula | `src/core/impact.py` | + update `tests/test_impact.py` |
| Change the LLM prompt | `src/core/guidance.py` | `_build_expert_prompt` |
| Add a roadmap template | `roadmap_builder/data.jsx` | `TEMPLATES` array |
| Add a new modal / button | `roadmap_builder/modals.jsx`, `app.jsx` | See `FRONTEND.md` |
| Add a new keyboard shortcut | `roadmap_builder/app.jsx` | `// Keyboard shortcuts` effect |
| Add a 7th PESTLE driver | **3 places** — see "Cross-file gotchas" below |
| Change localStorage key / shape | `roadmap_builder/app.jsx` | `ROADMAPS_KEY`, `loadRoadmapCollection` |
| Add a new API endpoint | `src/api/roadmap_api.py` | + add request/response Pydantic model |

---

## Known gotchas

### Cross-file: PESTLE constants drift

Adding or renaming a PESTLE driver requires editing **three** places:

1. `src/config.py` — `PESTLE_LABELS`, `PESTLE_LABEL_VERBALIZED`,
   `PESTLE_WEIGHTS`, `PESTLE_MODELS`, `TOLERANCE_BANDS`.
2. `src/core/roadmap_matcher.py` — `PESTLE_KEY_TO_LABEL` (short→full key map).
3. `roadmap_builder/data.jsx` — `PESTLE` array (frontend display).

Tests will catch most missed updates, but adding a new driver also requires
choosing a sentiment model. Document the model choice in `CHANGELOG.md`.

### Backend: model loading is global mutable cache

`_pipeline_cache`, `_model_cache`, `_classifier`, and `_dotenv_loaded` are
module-level singletons. This is fine for a single-process uvicorn (the
default), but each model loads on first request — first call is slow.

If you ever run with `uvicorn --workers > 1`, every worker reloads every
model into RAM independently. Mitigations are deferred work — see below.

### Backend: `from config import …` and `from core.X import …` look magic

The `src/api/roadmap_api.py` entrypoint mutates `sys.path` to add `src/`
before importing `from ui.app import run_pipeline`. `tests/conftest.py` does
the same trick for pytest. New entrypoints must do the same, or imports will
fail.

### Frontend: `<script>` load order is fragile

Files attach exports to `window` via `Object.assign(window, {…})`. If you
add a file that depends on `RoadmapGrid` BEFORE `roadmap-grid.jsx` in
`index.html`, you get an undefined reference at evaluation time. Always
verify the script order after adding a file.

### Frontend: TDZ in dep arrays

`useEffect` dep arrays evaluate identifiers at hook-call time during render.
If you put a `const X = useCallback(...)` in a dep array of an effect that
appears BEFORE the `const X` line, you'll get
`Cannot access 'X' before initialization` at startup. Move the declaration
above any effect that depends on it.

### Frontend: localStorage migration is one-shot

`loadRoadmapCollection()` migrates the legacy v0 key (`ddrm_v1`) to v1
(`ddrm_roadmaps_v1`) once on first load. There is no framework for
versioning beyond v1 yet. If you change the `RoadmapState` shape in a
breaking way, write a migration block at the top of `loadRoadmapCollection`
that reads, transforms, and re-saves, gated on a stored schema version.

---

## Out of scope (deferred to later quarter)

These are real problems but not blocking handoff. Each line is a future
ticket. Picking any one off is a great onboarding task.

- **Vite + TypeScript migration** for the frontend. Removes Babel-in-browser,
  enables type checking, faster first paint. Each `*.jsx` is small enough to
  port one at a time.
- **Single PESTLE taxonomy module** — collapse the three-file drift into one
  shared source (`src/core/pestle_taxonomy.py` + a generated JSON for
  `data.jsx`).
- **Split `src/core/guidance.py`** (currently ~700 lines) into:
  `guidance/openrouter_client.py`, `guidance/prompts.py`,
  `guidance/schemas.py`, `guidance/deterministic.py`,
  `guidance/expert_workshop.py`. Pure mechanical refactor — do AFTER
  `tests/test_guidance.py` is expanded to cover more paths.
- **localStorage migration framework** — `MIGRATIONS = [{from, to, fn}]`
  array invoked from `loadRoadmapCollection`. Append one entry per future
  schema bump.
- **Logging in `roadmap_api.py`** — add `logging.basicConfig(...)` and
  `logger.exception(...)` in the bare-except handler. Currently 500s are
  silent except in uvicorn stderr.
- **Error split in `extractor.py`** — distinguish network errors (retryable)
  from parse errors (try next strategy).
- **CI** — GitHub Actions workflow running `pytest` + `npm test` on push.
  Trivial once the repo lives on GitHub permanently.
- **Coverage report** — `pytest-cov` with target 80% on `src/core/`.
- **Component extraction in `app.jsx`** — `Topbar`, `ExportModal`,
  `RouteError` are all inline; extracting them into `roadmap_builder/components/`
  shrinks `app.jsx` by ~150 lines.
- **Multi-worker FastAPI** — model-loading singleton becomes a problem here.
  Move model loading into a FastAPI `lifespan` and document the RAM cost.

---

## Commit / PR style

The current `main` history uses brief imperative subject lines:

```
Add per-PESTLE expert workshop guidance & UI updates
Add Impact Advisor features and undo
Flatten prototype/ to repo root; rename builder index; add LICENSE
```

Match the tone. No conventional-commit prefix is required.

---

## Getting unstuck

1. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) — it links to the right file.
2. Search the test files — they're worked examples of every pure function.
3. Check `CHANGELOG.md` for design rationale on past decisions.
4. Read `IMPACT_VALUES_GUIDE.md` for the impact-math intuition.
