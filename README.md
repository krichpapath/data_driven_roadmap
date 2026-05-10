# DDRM Builder — Drivers & Trends Impact Assessment

A roadmap-authoring tool for **strategy and planning teams** that keeps
roadmaps from going stale. Build a roadmap once, then re-grade it against
fresh news with a single click — the system returns a verdict
(**Maintain / Adjust / Revise**), per-PESTLE evidence, and per-item expert
advice.

> Research context: operational implementation of the
> **Data-Driven Roadmapping (DDRM)** workflow presented at
> ISPIM Connects Bangkok 2026 (Lertprasertphakorn & Chalarak, 2026).

---

## Quickstart

```bash
# 1. Install
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
pip install -r requirements-dev.txt   # if you want to run tests

# 2. Start the advisor API (terminal 1)
python src/api/roadmap_api.py
# → serves on http://127.0.0.1:7875

# 3. Serve the browser UI (terminal 2)
cd roadmap_builder
python -m http.server 8000
# → open http://127.0.0.1:8000

# 4. (optional) for LLM-powered expert advice
# Create a .env file at the repo root containing:
#     OPENROUTER_API_KEY=sk-or-v1-...
# Without a key the app uses deterministic guidance fallbacks.
```

Pick a template, build a roadmap, click **News Impact**, paste an article URL
or text. Done.

---

## Repository layout

```
.
├── src/
│   ├── config.py              # All tunables (models, weights, thresholds)
│   ├── api/roadmap_api.py     # FastAPI advisor — single endpoint
│   ├── core/                  # Pipeline modules (impact math, classifiers)
│   └── ui/app.py              # Gradio dev UI + run_pipeline() orchestrator
├── roadmap_builder/           # Browser-based roadmap UI (no bundler, JSX-via-CDN)
├── tests/                     # pytest backend tests
├── testdata/                  # Sample roadmaps + 10 news fixtures
├── docs/                      # Developer handbook (see below)
├── requirements.txt
├── requirements-dev.txt
└── README.md (this file)
```

---

## Developer docs

A five-document handbook lives in [`docs/`](docs/). Read in this order:

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — pipeline diagram, module
   map, frontend↔backend contract. **Start here.**
2. [`docs/PIPELINE.md`](docs/PIPELINE.md) — backend deep dive: 5-step impact
   formula, PESTLE/sentiment classifiers, guidance modes.
3. [`docs/FRONTEND.md`](docs/FRONTEND.md) — frontend deep dive: state model,
   no-bundler load order, where to add new templates / modals / shortcuts.
4. [`docs/TESTING.md`](docs/TESTING.md) — testing guide: what's covered,
   what's not, how to write a new test, report-friendly metrics.
5. [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — workflow, gotchas,
   pre-commit checklist, "where do I add X?" table.

---

## Tests

Two suites — combined runtime under 1 second.

```bash
# Backend (Python) — 54 unit tests
pytest                             # from repo root

# Frontend (Vitest) — 50 tests (24 pure helpers + 26 functional reducers)
cd roadmap_builder && npm install && npm test
```

**Total: 104 tests.** They cover the 5-step impact formula, roadmap matching,
guidance merge logic, every state transform behind the React App, and the
import-JSON validator. Canned dicts only — no model loads, no network — so
the suite stays fast and deterministic.

See [`docs/TESTING.md`](docs/TESTING.md) for the coverage breakdown,
philosophy, and how to add a new test.

---

## Pipeline at a glance

```
┌─────────────┐   ┌──────────┐   ┌────────┐   ┌───────────┐   ┌────────┐   ┌───────┐   ┌──────────┐
│  News URL   │──▶│ extract  │──▶│keypoint│──▶│  PESTLE   │──▶│sentiment│──▶│impact│──▶│ guidance │
│  / Text     │   │ article  │   │  pick  │   │  classify │   │ classify│   │ score│   │ (LLM /   │
│             │   │          │   │  (MMR) │   │ (zero-shot│   │ (per-   │   │ + verdict│  determ) │
└─────────────┘   └──────────┘   └────────┘   │   NLI)    │   │ driver) │   └──────┘   └──────────┘
                                              └───────────┘   └─────────┘                  │
                                                                                            ▼
                                                          ┌─────────────────────────────────────┐
                                                          │  Maintain / Adjust / Revise verdict │
                                                          │  + per-item advice merged into UI   │
                                                          └─────────────────────────────────────┘
```

For the math, see [`docs/PIPELINE.md`](docs/PIPELINE.md) and
[`IMPACT_VALUES_GUIDE.md`](IMPACT_VALUES_GUIDE.md).

---

## License

Research prototype — Thammasat University. See `LICENSE`.
