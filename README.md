# Roadmap Review

Build a technology roadmap and assess how news affects it. The application
returns **Maintain**, **Adjust**, or **Revise**, with supporting sentences,
affected roadmap items, and suggested review actions. Final judgment belongs
to the roadmap owner.

## Current development baseline

The application has a Python API and a React browser interface. Roadmaps are
saved in the browser's `localStorage`; there is no database. Export important
roadmaps before clearing browser data.

The October 2026 cleanup resumes development from the existing application.
Completed university work and old research material are preserved in
[the archive](archive/README.md). Historical evaluation results are references,
not evidence that a new version has passed validation.

Phase 1 verification: **82 Python tests, 54 JavaScript tests, and all ten
English model scenarios pass**. Verdicts and four-decimal severity values match
the recorded baseline. See the [readiness report](docs/readiness/report.md)
for browser checks, dependency decisions, known limitations, and the
[31-requirement / 15-scenario checklist](docs/readiness/requirements-checklist.md).
The subsequent advice-model upgrade passes **96 Python and 54 JavaScript tests**,
plus one real OpenRouter smoke request for each of the five selected models.

New readiness documents under `docs/readiness/`, university archives and private
learning notes are local-only and are not included in a Git clone. Links to those
reports are for the working copy; keep a separate backup of the local archive.

## Setup

The locked environment was verified on **Windows x64, Python 3.14.8 and
Node.js 24.18.0**. Frontend tests require Node 22.12+, 24+, or 26+
(as supported by Vitest 5); Node 24 is the tested choice. Other Python/OS
combinations need their own installation and model regression check.
The browser loads React and Babel from CDNs. Model downloads require internet
access on first use and several GB of disk space.

The existing `venv/` is the preserved baseline. Use `.venv-readiness/` for the
updated application. From the repository root, create and activate it:

**Windows PowerShell**

```powershell
python -m venv .venv-readiness
.\.venv-readiness\Scripts\Activate.ps1
```

**macOS / Linux**

```bash
python3 -m venv .venv-readiness
source .venv-readiness/bin/activate
```

Install the application and development dependencies:

```bash
python -m pip install -r requirements.lock
# Optional Gradio and documentation tools:
python -m pip install -r requirements-dev.lock
```

The first lock includes the application and its test tools. The second lock
adds MkDocs and the optional Gradio development interfaces. Direct dependency
versions are recorded separately in `requirements.txt` and `requirements-dev.txt`.
For frontend tests, run `npm ci` inside `roadmap_builder/`.

Optional: copy `.env.example` to `.env` and set `OPENROUTER_API_KEY` for
LLM-written advice. Hosted AI is **off by default** in the interface. To opt in,
set `DDRM_EXTERNAL_AI=on` and enable **Use hosted AI guidance** in advisor
settings. `DDRM_EXTERNAL_AI=off` blocks hosted guidance even if the browser
opts in. The server allowlist is in `src/config.py`. Keep `.env` local.

Advice defaults to **GPT-6 Luna**. The picker also offers **GPT-6.1 Sol**,
**Claude Sonnet 5.5**, **Claude Haiku 5.5**, and **Qwen3.7 Plus** through OpenRouter.
Old GPT-4o browser selections and environment defaults migrate to Luna.
See [advice model upgrade](docs/readiness/advice-model-upgrade.md) for request
settings, verification and limitations. Restart the API and refresh the browser
after updating.

## Run

Use two terminals with the virtual environment activated.

**Terminal 1 — API**

```bash
python src/api/roadmap_api.py
```

**Terminal 2 — browser interface**

```bash
cd roadmap_builder
python -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000>. The health endpoint at
<http://127.0.0.1:7875/api/health> should return `{"status":"ok"}`.
There is no application build step.

Create a roadmap from the Industrial Digital template, open **News Impact**,
and paste an article or URL. Keep **Evidence points** at **7** for the existing
calibration. The first assessment loads or downloads the AI models; latency
depends on the machine and input.

## Test and document

| Command | Working directory | Purpose |
| --- | --- | --- |
| `python -m pytest` | Repository root | Backend unit tests |
| `npm test` | `roadmap_builder/` | Frontend helper tests |
| `npm run test:watch` | `roadmap_builder/` | Watch frontend tests |
| `python tools/e2e_check.py` | Repository root | Ten real-model scenarios; API must be running |
| `python tools/diagnose_impact.py testdata/adjust_01_chip_export_controls.txt` | Repository root | Inspect scoring; writes diagnostic output |
| `mkdocs serve -a 127.0.0.1:8001` | Repository root | Preview the handbook |
| `mkdocs build --strict` | Repository root | Build the handbook into `site/` |

Unit tests do not load AI models. Frontend tests exercise mirrored helper
functions, not the React interface; advisor/storage tests use the actual shared helpers. See [Testing](docs/TESTING.md) for limits
and the end-to-end workflow. The scenario runner sets `allow_external_ai=False` and asserts deterministic
guidance. It makes no hosted guidance calls.

## Project map

```text
src/
  api/roadmap_api.py    HTTP entry point
  ui/app.py            run_pipeline() orchestration
  ui/                  optional Gradio interfaces
  core/                extraction, classification, scoring, matching, advice
  config.py            model choices, weights, and thresholds
roadmap_builder/       React interface, CSS, and frontend tests
tests/                 Python unit tests
testdata/              labelled news scenarios and roadmap fixture
tools/                 diagnostics and scenario runner
docs/                  active developer handbook
archive/               retired academic material and earlier snapshots
```

`venv/`, `node_modules/`, caches, and the generated `site/` are local outputs.
The archive index explains which historical files are retained in Git and
which exist only in this checkout.

## Where to start

- [Developer handbook](docs/index.md): setup, usage, and current limitations.
- [Codebase tour](docs/guide/codebase-tour.md): responsibilities and reading order.
- [Architecture](docs/ARCHITECTURE.md): data flow and API contract.
- [Scoring](docs/guide/scoring.md) and [value guide](IMPACT_VALUES_GUIDE.md): the current formula and tuning controls.
- [Contributing](docs/CONTRIBUTING.md): change workflow and maintenance concerns.
- [Changelog](CHANGELOG.md): dated changes and historical rationale.

Read `src/config.py` before tuning models or thresholds. Recheck all scenarios
after changes to scoring or classification.

## License

See [LICENSE](LICENSE) for the existing copyright and usage terms.
