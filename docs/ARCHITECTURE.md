# Architecture

This is the central reference. Keep it open while reading code.

---

## Pipeline diagram

```
                          ╭───────────────────── BROWSER ─────────────────────╮
                          │                                                    │
                          │   roadmap_builder/  (React 18 via CDN, no bundler)│
                          │   ┌────────────────┐   ┌──────────────────────┐  │
                          │   │ App / Roadmap  │   │  Impact Advisor      │  │
                          │   │ Grid / Modals  │   │  (impact-advisor.jsx)│  │
                          │   └───────┬────────┘   └──────────┬───────────┘  │
                          │           │ localStorage          │              │
                          │           ▼                       │ POST         │
                          ╰───────────────────────────────────┼──────────────╯
                                                              │ /api/recommend
                                                              ▼
                          ╭───────────────────── BACKEND ─────────────────────╮
                          │                                                    │
                          │   src/api/roadmap_api.py   (FastAPI, port 7875)    │
                          │           │                                        │
                          │           ▼                                        │
                          │   src/ui/app.py : run_pipeline()                   │
                          │           │                                        │
                          │           ▼                                        │
                          │   ┌─ extractor ─→ keypoints ─→ pestle ─→ sentiment │
                          │   │                                              │ │
                          │   ▼                                              ▼ │
                          │   impact ────────────────────────→ roadmap_matcher │
                          │           │                              │         │
                          │           ▼                              ▼         │
                          │       verdict + severity         matched items     │
                          │                  │                       │         │
                          │                  └───────────┬───────────┘         │
                          │                              ▼                     │
                          │                          guidance                  │
                          │                  (deterministic OR                 │
                          │                   parallel LLM workshop)           │
                          │                              │                     │
                          ╰──────────────────────────────┼─────────────────────╯
                                                         │
                                            JSON result back to browser
```

---

## Frontend ↔ Backend contract

**Single endpoint.** Frontend posts, backend returns a fat JSON blob.

### `POST /api/recommend` → `RecommendResponse`

Request (`src/api/roadmap_api.py`):

```json
{
  "input_text": "<news URL or article body>",
  "input_mode": "URL" | "Text",
  "max_points": 3..7,               // KEYPOINTS_MIN..KEYPOINTS_MAX from config.py
  "roadmap":   { "title": "...", "categories": [...], "bands": [...], "items": [...] },
  "use_expert_workshop": true
}
```

Response (built in `run_pipeline()`):

```json
{
  "result": {
    "title":    "<extracted article title>",
    "verdict":  "Maintain" | "Adjust" | "Revise",
    "severity": 0.0..1.0,
    "reason":   "STRM severity 0.42 in [0.35, 0.65)",
    "by_pestle": { "Political": { "skd": ..., "n_active": ... }, ... },
    "evidence":  [ { "id": "K1", "sentence": "...", "pestle": "Political",
                     "sentiment_label": "negative", "relevance": 0.71, ... } ],
    "roadmap_matches": [ { "item_id": "...", "matched_drivers": [...], ... } ],
    "guidance": { "verdict": "...", "expert_advices": { "<item_id>": { ... } },
                  "summary": "...", "llm_provider": "openrouter" | "deterministic" }
  }
}
```

Failure modes (HTTP):
- `400` — `ValueError` (bad input, unparseable URL, no usable sentences)
- `503` — `RuntimeError` (model not cached / network down)
- `500` — anything else (logged as opaque)

---

## Frontend state model

**One App component owns everything.**

```
loadRoadmapCollection()      ← reads localStorage on mount
        │
        ▼
   App  state
   ├─ roadmaps[]              (collection of records)
   ├─ state                   (active roadmap state, or null)
   ├─ undoStackRef            (last 30 snapshots, useRef)
   ├─ tweaks                  (density / coach visibility / etc)
   ├─ itemModal / showImport / showExport / etc
   └─ toast                   (transient status — managed by useToast hook)
        │
        ▼
   Children (props down, callbacks up)
   ├─ CoachRail               (left rail, 7-step onboarding)
   ├─ RoadmapGrid             (canvas, drag-drop)
   ├─ ItemModal / GlossaryModal / ImportModal / StructureModal
   └─ ImpactAdvisor           (only component that hits the API)

   Every state mutation triggers an effect that calls
   updateRoadmaps(...) → saveRoadmapCollection() to persist.
```

**Persistence:** `localStorage["ddrm_roadmaps_v1"]`. Auto-saves on every state
change. Legacy v1 (single-state key `"ddrm_v1"`) auto-migrates on load.

**Routing:** hash-based, parsed by `parseRoute(hash)`:
- `#/roadmaps` → list view
- `#/roadmaps/new` → start screen
- `#/roadmaps/:id` → builder
- `#/roadmaps/:id/import` → builder + import modal

---

## Module map

### Backend — `src/`

| File | One-line summary |
|------|------------------|
| `config.py` | All tunables: models, PESTLE labels, weights, tolerance bands, thresholds. **Edit here, nothing else.** |
| `api/roadmap_api.py` | FastAPI app. Single `POST /api/recommend` endpoint. CORS open. |
| `ui/app.py` | `run_pipeline()` orchestrator. UI-framework free, so the advisor API delegates here without pulling in gradio/plotly/pandas. |
| `ui/gradio_app.py` | Optional Gradio dev UI over `run_pipeline()`. Not needed to run the delivered app. |
| `core/extractor.py` | URL → article text. 4-strategy chain (trafilatura → newspaper3k → readability → bs4). |
| `core/keypoints.py` | Top-N most relevant + diverse sentences via sentence-transformers + MMR. |
| `core/pestle.py` | Zero-shot NLI classifier with verbalized hypotheses → 6 PESTLE labels (or "Unclassified"). |
| `core/router.py` | PESTLE label → which sentiment model to use. |
| `core/sentiment.py` | Run the routed sentiment model, normalize to {positive, negative, neutral}. |
| `core/impact.py` | The 5-step DDRM formula chain. SKD → STRM → severity → verdict. |
| `core/roadmap_matcher.py` | Match impact output to roadmap items by PESTLE-driver overlap. |
| `core/guidance.py` | Deterministic guidance + expert-workshop (parallel LLM calls per active PESTLE role). |

### Frontend — `roadmap_builder/`

| File | One-line summary |
|------|------------------|
| `index.html` | Loads React + Babel from CDN, then every `*.jsx` in dependency order. |
| `app.jsx` | The `App` component. Single state hub, undo, routing, all callbacks. |
| `data.jsx` | Templates, glossary, PESTLE constants. **Edit to add a new template.** |
| `coach-rail.jsx` | Left-rail 7-step onboarding checklist. |
| `roadmap-grid.jsx` | Canvas + drag-drop. Renders chips + multi-band span items. |
| `modals.jsx` | ItemModal / GlossaryModal / ImportModal / StructureModal. |
| `impact-advisor.jsx` | News input + result panel. Only file that calls the API. |
| `start-screen.jsx` | Onboarding hero + template picker. |
| `primitives.jsx` | Icon (24 SVGs), Toast, GlossaryCard, InfoDot. |
| `tweaks-panel.jsx` | Floating dev tweak panel (host-iframe protocol; mostly inert in standalone use). |
| `lib/exports.js` | ESM mirror of pure helpers from `app.jsx`, used only by Vitest. |
| `styles.css` | All styling, CSS custom properties for theming. |

### Tests

| File | What it locks |
|------|--------------|
| `tests/conftest.py` | Adds `src/` to `sys.path` so `from core.X import ...` works. |
| `tests/test_impact.py` | The 5-step formula chain. **Read these to understand impact math.** |
| `tests/test_roadmap_matcher.py` | Active-driver filtering, PESTLE overlap, ranking. |
| `tests/test_guidance.py` | Evidence selection, expert merge, legacy flatten. |
| `tests/test_keypoints.py` | Sentence splitting + abbreviation protection. |
| `roadmap_builder/__tests__/exports.test.js` | Pure FE helpers (titleOf, parseRoute, CSV/JSON/text export, formatGuidanceNote). |
| `roadmap_builder/__tests__/reducers.test.js` | App-level functional tests (upsert/delete/move/structure/advisor/validate, plus a 7-step composed user session). |

For test philosophy, coverage breakdown, and how to write a new test, read
[`TESTING.md`](TESTING.md).

---

## Cross-cutting concerns

**Model loading is global mutable cache.**
`_pipeline_cache`, `_model_cache`, `_classifier`, and `_dotenv_loaded` are
module-level singletons. Pipeline calls are serialized to prevent concurrent
initialization from corrupting shared model dtype state. **Will multiply RAM
linearly under `--workers > 1`.** Document this if you ever scale out.

**LLM is optional and off by default.** Without request opt-in, when the server
sets `DDRM_EXTERNAL_AI=off`, or without a key, `generate_guidance()`
returns a deterministic policy-based suggestion. The frontend handles both
shapes (new `expert_advices` map; legacy `item_guidance` list).

**PESTLE constants live in three places** — `src/config.py`,
`src/core/roadmap_matcher.py` (the key↔label map), and `roadmap_builder/data.jsx`.
Adding a new driver requires updating all three. See `CONTRIBUTING.md` for the
upgrade path.

---

## Where do I look first when…

| I want to… | Start at |
|------------|----------|
| Change verdict thresholds | `src/config.py` → `DDRM_THRESHOLDS` |
| Add a new sentiment model | `src/config.py` → `PESTLE_MODELS` |
| Change the impact formula | `src/core/impact.py` (also update `tests/test_impact.py`) |
| Add a roadmap template | `roadmap_builder/data.jsx` → `TEMPLATES` |
| Add a new modal / button / shortcut | `roadmap_builder/app.jsx` |
| Tweak the LLM prompt | `src/core/guidance.py` → `_build_expert_prompt` |
| Change what gets stored in localStorage | `roadmap_builder/app.jsx` → `makeRecord` / `ROADMAPS_KEY` |
