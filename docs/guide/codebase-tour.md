# Tour of the codebase

Start with the entry points, then follow one assessment through the pipeline.
This map describes the current layout; module boundaries have not been
changed by the archive cleanup.

## Folder map

```text
Roadmapping/
├── README.md              setup, commands, and verified development status
├── CHANGELOG.md           dated changes and historical observations
├── IMPACT_VALUES_GUIDE.md scoring controls and their meanings
├── mkdocs.yml             handbook navigation and build configuration
├── requirements.txt       application dependencies
├── requirements-dev.txt   tests, docs, and optional developer interfaces
├── src/
│   ├── config.py          models, thresholds, weights, and extraction settings
│   ├── core/              analysis stages and supporting helpers
│   ├── api/               FastAPI server
│   └── ui/                pipeline orchestration and optional Gradio tools
├── roadmap_builder/       React interface and frontend tests
├── tests/                 Python unit tests
├── testdata/              labelled news scenarios and roadmap fixture
├── tools/                 diagnostics and scenario runner
├── docs/                  active developer handbook
└── archive/               completed academic work and older snapshots
```

Generated `site/`, installed `venv/` and `node_modules/`, and caches are local
outputs. Academic files previously mixed into `docs/` have been archived,
so new handbook builds contain only the active documentation.

## Backend responsibilities

| File | Responsibility |
| --- | --- |
| `src/api/roadmap_api.py` | HTTP entry point: health check and assessment requests |
| `src/ui/app.py` | `run_pipeline()` coordinates the analysis; despite its location, it has no UI framework dependency |
| `src/config.py` | Model choices, weights, thresholds, and extraction settings |
| `src/core/extractor.py` | Get article text from a URL or pasted text |
| `src/core/keypoints.py` | Select relevant, diverse sentences and their context |
| `src/core/pestle.py` | Classify political, economic, social, technological, legal, or environmental evidence |
| `src/core/router.py` | Choose the sentiment model for a category |
| `src/core/sentiment.py` | Normalize model predictions to positive, negative, or neutral |
| `src/core/impact.py` | Calculate impact severity and the review verdict |
| `src/core/roadmap_matcher.py` | Match active drivers to roadmap item tags |
| `src/core/guidance.py` | Rule-based advice and optional OpenRouter guidance |

The path is: request → article text → key sentences → category and sentiment
→ impact score → roadmap matches → advice. See [Architecture](../ARCHITECTURE.md)
and [Pipeline](../PIPELINE.md) for the contract and calculations.

`src/ui/gradio_app.py` and `src/ui/keypoints_lab.py` are optional development
interfaces. Their Gradio, Plotly, and Pandas dependencies are separate from
the delivered API/browser application.

## Frontend responsibilities

| File in `roadmap_builder/` | Responsibility |
| --- | --- |
| `index.html` | Load React, Babel, CSS, and JSX files in dependency order |
| `app.jsx` | Roadmap collection, routing, persistence, undo, and callbacks |
| `impact-advisor.jsx` | News input, API requests, assessment results, and advice |
| `roadmap-grid.jsx` | Roadmap grid and drag/drop |
| `modals.jsx` | Item editing, imports, and structure editing |
| `start-screen.jsx` | Roadmap list and template selection |
| `data.jsx` | Templates, glossary, and PESTLE definitions |
| `coach-rail.jsx` | Onboarding checklist |
| `primitives.jsx` | Shared visual helpers |
| `tweaks-panel.jsx` | Appearance controls |
| `styles.css` | Styling and theme variables |
| `lib/exports.js` | Mirror of application helpers used by Vitest |

There is no bundler. The browser compiles JSX with Babel and the components
share names through the global scope. Script order in `index.html` matters.
If cached scripts hide a change, update the relevant asset version query.
See [Frontend](../FRONTEND.md) for state and interaction details.

Roadmaps persist in browser `localStorage`, so they are specific to the browser
and origin. Export important roadmaps before clearing browser data.

## Tests and development tools

| Location | Command | Coverage |
| --- | --- | --- |
| `tests/` | `python -m pytest` from the root | 54 backend helper tests |
| `roadmap_builder/__tests__/` | `npm test` from `roadmap_builder/` | 50 tests of mirrored frontend helpers |
| `tools/e2e_check.py` | `python tools/e2e_check.py` with the API running | Ten scenarios through the real models |
| `tools/diagnose_impact.py` | `python tools/diagnose_impact.py <article.txt>` | Scoring diagnostics; writes to `tools/diagnostic_output/` |

Unit tests cover neither browser interaction nor real model inference. The
frontend helper mirror must stay aligned with `app.jsx` until the duplication
is removed. See [Testing](../TESTING.md) for the current verification limits.

## Historical material

`archive/README.md` indexes the retired material. `archive/university/` contains
reports, research references, submission files, and the old generated handbook.
Original contents are preserved, including historical conclusions and old paths.
The archive index and previously tracked reports remain eligible for Git;
other local archive files are ignored and require a separate backup.

Existing older prototype archives remain in place. They are not part of the
active application and should not be used as current implementation guidance.

## Suggested reading order

1. `src/ui/app.py` — follow one assessment through `run_pipeline()`.
2. `src/config.py` — identify the models and calibration settings.
3. `src/core/impact.py` alongside `tests/test_impact.py` — understand scoring.
4. `src/api/roadmap_api.py` — inspect the request and response contract.
5. `roadmap_builder/index.html`, `app.jsx`, and `impact-advisor.jsx` — follow the browser flow.

Next: [Common tasks](common-tasks.md).
