# Testing Guide

Reference for the test suites covering both halves of the DDRM Builder.
Read this when writing a test, debugging a failure, or checking what a passing
suite actually establishes.

---

## At a glance

| Suite | Scope | Count |
| --- | --- | --- |
| Python | Scoring, matching, guidance, API, history and URL handling | 132 |
| JavaScript | Source library, history, routing, storage and editing helpers | 113 |
| Model baseline | Ten synthetic English scenarios, fixed weights/revisions | 10 |

Counts above were verified on October 31, 2026. Unit tests make no hosted
requests and do not load model weights. Run the live API check below to
compare the actual models with the ten saved scenarios.

Coverage target: every pure function in `src/core/`, every reducer-style
helper in `roadmap_builder/app.jsx`, plus the import-JSON validator.

## End-to-end acceptance check

`tools/e2e_check.py` runs every scenario in `testdata/` through the live API and
asserts the verdict, four-decimal severity, and deterministic guidance match
the recorded baseline. This check exercises the real models, so it is slow
(≈45 s per scenario, plus a one-off multi-GB model download on first run) and is
deliberately kept out of `pytest`.

Start the backend first, then:

```bash
python tools/e2e_check.py
```

Exit code is 0 when every scenario matches its expected verdict, 1 otherwise.

The runner explicitly sets `allow_external_ai=False` and makes no hosted
calls. To compare full model output without the API (cached models required):

```bash
python tools/readiness_check.py --compare testdata/baseline.json --output tmp/comparison.json
```

Do not overwrite the baseline to make a failing update pass. Review the cause.
The ten scenarios prove consistency, not accuracy on real news or other languages.

The separately opt-in paid smoke test uses synthetic data and one GPT-6 Luna
request by default, with a 2,048-token output cap:

```bash
python tools/hosted_smoke.py --run-hosted
python tools/hosted_smoke.py --run-hosted --model openai/gpt-6.1-sol --output tmp/hosted-sol.json
```

This command opts in for its own process and requires an OpenRouter key.
Do not include it in ordinary offline test runs.
The default report is `tmp/hosted-smoke-current.json`; historical readiness evidence
is preserved. Sol and Sonnet use a 4,096-token combined reasoning/output limit.

---

## How to run

### Backend

```bash
# from repo root, with the project venv activated
pytest                              # all tests, quiet
pytest -v                           # verbose with each test name
pytest tests/test_impact.py         # one file
pytest -k "discretize"              # all tests whose name matches the regex
pytest --tb=short                   # short traceback on failure
```

### Frontend

```bash
cd roadmap_builder
npm ci                              # install the exact lock
npm test                            # one-shot, exits 0 / 1
npm run test:watch                  # interactive, re-runs on save
```

`npm test` is the canonical CI command; `npm run test:watch` is for
development.

### Combined dry-run before a commit

```bash
pytest && (cd roadmap_builder && npm test)
```

Both must exit 0.

---

## Layout

```
tests/                                 ← Backend (pytest)
├── conftest.py                        Adds src/ to sys.path
├── test_impact.py                     5-step DDRM formula chain
├── test_roadmap_matcher.py            PESTLE overlap, ranking
├── test_guidance.py                   Evidence selection, expert merge
└── test_keypoints.py                  Sentence splitter only

roadmap_builder/__tests__/             ← Frontend (Vitest)
├── exports.test.js                    Pure helpers (titleOf, parseRoute, ...)
└── reducers.test.js                   App-level state transforms

roadmap_builder/lib/exports.js         ← Shared routing and export helpers
```

---

## Philosophy

The existing suites use the following approach. Treat the coverage gaps as
limits of the current tests, not a prohibition on testing integrations.

### 1. Keep unit tests focused on pure logic.

The pipeline's verdict math is owned by `src/core/impact.py` — pure functions
on dicts. The frontend tests import application helpers from
`lib/exports.js`. They do not directly exercise `app.jsx` or the React tree.
Phase 1 tests exercise the FastAPI HTTP layer and mocked provider failures.
Actual hosted responses and real model inference require separate smoke checks. Use appropriate integration or manual
checks when changing those boundaries.

This keeps the unit suites fast and deterministic, without network calls or
model warm-up. It does not establish that the whole application works.

### 2. Tests are worked examples.

A new contributor should be able to read `tests/test_impact.py` and
understand the impact formula chain without ever opening `impact.py`.
Comments in test files explain *why*, not *what*. Sample inputs are
hand-picked to illustrate boundaries, not random.

### 3. Test the same helper that the app uses.

The browser and Vitest use the same routing and export functions from
`roadmap_builder/lib/exports.js`. The reducer and import-validation tests still
exercise copies of component logic; check those editing flows in a browser too.

---

## What's covered

### Backend (`tests/`)

#### `test_impact.py` — the 5-step DDRM formula chain

| Function | Cases |
|----------|-------|
| `_magnitude` | neutral=0, max-inputs caps at 1, range clamping, intermediate value |
| `_discretize` | below τ_low → 0, in band → 1, at/above τ_high → 2, unknown PESTLE falls back to default |
| `_normalize_weights` | sum-to-one, all-zero → uniform, empty input, negative clamp |
| `aggregate_by_pestle` | empty → all zero, single strong point → SKD=2, sub-tolerance keeps `n_active`=0, unknown PESTLE silently dropped |
| `overall_impact` | empty → 0, no active drivers → 0, single-driver renormalisation |
| `ddrm_status` | each verdict band, threshold boundaries |

23 tests. Each one corresponds to a numbered step in
`docs/PIPELINE.md` § Stage 5.

#### `test_roadmap_matcher.py` — match impact output to roadmap items

| Function | Cases |
|----------|-------|
| `_safe_float` | numeric round-trip, default fallback |
| `_label_for_tag` | PESTLE keys (`P`, `E`, `T`, `En`) → full labels; passes through unknowns |
| `active_drivers` | filters `n_active=0`, sorts by severity-then-priority |
| `normalize_roadmap_items` | empty roadmap, missing fields, full template |
| `match_roadmap_items` | no overlap → empty, multi-overlap ranks higher, limit applied |

13 tests.

#### `test_guidance.py` — guidance helpers (no LLM calls)

| Function | Cases |
|----------|-------|
| `_top_evidence` | dedup by sentence, limit, missing id |
| `_filter_keypoints_for_role` / `_filter_matches_for_role` | empty / partial / unknown role |
| `_resolve_keypoint` | compact record on hit, `None` on miss |
| `_merge_expert_results` | single role, multi-role stacking, action=verdict invariant, skips entries without `item_id` |
| `_flatten_for_legacy` | first advice = primary, role concatenation, picks first available evidence |
| `ACTION_BY_VERDICT` | covers exactly Maintain/Adjust/Revise with required keys |

These 14 helper tests are supplemented by `test_readiness.py`, which checks
provider selection, off controls and failures with mocked HTTP boundaries.
The separately recorded hosted smoke test checks one real provider response.

#### `test_keypoints.py` — sentence splitter

| Function | Cases |
|----------|-------|
| `_split_sentences` | basic 3-sentence doc, abbreviation protection (`Mr.`, `e.g.`, `U.S.`), word-count filter, empty input |

4 tests. The semantic scoring path is *not* tested here — it requires
sentence-transformers + ~90 MB of model weights on disk. Quality there is
better validated by offline integration runs against `testdata/*.txt`.

### Frontend (`roadmap_builder/__tests__/`)

#### `exports.test.js` — pure helpers

24 tests on:

- `titleOf` — trim + fallback to "Untitled Roadmap"
- `isValidRoadmapState` — defensive shape check (used after `JSON.parse`)
- `parseRoute` — every routing case
- `csvEscape` — RFC-4180 quote doubling, commas, newlines
- `buildSelectionJson` / `buildSelectionCsv` / `buildSelectionText` — bulk export round-trips
- `formatGuidanceNote` — new multi-expert shape and legacy single-advice shape

#### `reducers.test.js` — App-level functional behaviour

26 tests, including a final 7-step composed scenario that simulates a real
user session (add → edit → move → restructure → advisor → validate).

| Reducer | Tests |
|---------|-------|
| `upsertItem` | append vs replace, immutability of input |
| `deleteItem` | remove, no-op on unknown id |
| `moveItem` | catId update + collapse to single band, leaves siblings alone |
| `saveStructure` | drop items in removed layers, trim removed bands, drop items left bandless, replace structure wholesale |
| `applyAdvisorAdvice` | sets `reviewNeeded` + `lastImpactVerdict` + appends notes; ignores unmatched items; appends with separator; no-op on empty entries |
| `toggleInSet` | add / remove / new-Set immutability |
| `validateRoadmap` | accept good, reject every malformed shape, surface specific error per case |
| Composed scenario | full multi-step session preserves invariants |

These are **functional tests** in the sense that they assert behaviour at the
state-transform boundary — exactly what a click in the UI does — without
needing a DOM.

---

## Coverage boundaries

| Surface | Evidence | Remaining limitation |
| --- | --- | --- |
| React interface | Browser creation/edit/export, assessment and advice checks in readiness report | No automated DOM suite or cross-browser certification |
| FastAPI | TestClient error/control regressions and ten live model scenarios | No load test or deployed-service test |
| Hosted guidance | Mocked selection/off/failure cases and one real paid smoke | Not an evaluation of advice accuracy across providers |
| Models | Pinned revisions and ten full-output comparisons | Synthetic consistency is not representative accuracy |
| URL extraction | DNS/redirect/size/deadline regressions, one-download fallback test, two real articles | Footer contamination and unusual publisher layouts remain possible |
| Browser storage | Actual shared helper tests and save/reload/export checks | Local browser storage is still the only persistence layer |

---

## Writing a new test

### Backend (pytest)

1. Decide which existing file is closest to the function you're testing. If
   none fits, create a new `tests/test_<module>.py`.
2. Use plain `assert` statements with `pytest.approx` for floats.
3. Build inputs with small dict literals — no fixtures unless reused 3+ times.
4. Comment the *why*, not the *what*. The function name says what.

Skeleton:

```python
"""Tests for `core.<module>` — one-line summary."""

from __future__ import annotations

import pytest

from core import <module> as m


def test_<scenario>_<expected_behaviour>():
    # Why this case matters: <one sentence>.
    result = m.func(arg)
    assert result == expected
```

### Frontend (Vitest)

1. Decide whether the helper is a *pure function* (goes in `lib/exports.js`)
   or a *reducer-style state transform* (also in `lib/exports.js`, but tests
   live in `reducers.test.js`).
2. Add the helper export to `lib/exports.js` and call that implementation from the component.
3. Add tests under `roadmap_builder/__tests__/<file>.test.js`. Vitest
   auto-discovers anything under `__tests__/` ending in `.test.js`.

Skeleton:

```js
import { describe, it, expect } from "vitest";
import { myHelper } from "../lib/exports.js";

describe("myHelper", () => {
  it("does X when Y", () => {
    expect(myHelper(input)).toEqual(expected);
  });
});
```

### Adding a new reducer

If you find yourself testing a `setState` callback inside `app.jsx`:

1. Extract the body into a pure function in `lib/exports.js` (input state +
   args → new state, no side effects).
2. Replace the body in `app.jsx` with a call to the helper. Keep the
   `setState(s => helper(s, ...))` shape to preserve React's update
   semantics.
3. Add tests for the helper in `reducers.test.js`.

This pattern progressively shrinks `app.jsx` without forcing a bundler
migration.

---

## Debugging a failing test

### Backend

```bash
pytest tests/test_impact.py::test_discretize_at_low_returns_one -v -s
# -v shows full test name; -s lets print() reach the terminal
```

For pdb:

```bash
pytest --pdb                        # drop into debugger on first failure
```

### Frontend

```bash
cd roadmap_builder
npx vitest run __tests__/reducers.test.js -t "applyAdvisorAdvice"
# -t filters by test name regex
```

Vitest also has a UI: `npm run test:watch` then press `u` for the dashboard.

---

## CI hook (deferred — not yet wired)

There is no GitHub Actions workflow in this repo. When the project moves to
a permanent home, drop in:

```yaml
# .github/workflows/test.yml
name: tests
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: pytest
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd roadmap_builder && npm ci && npm test
```

This is in `docs/CONTRIBUTING.md` § Out of scope as a deferred ticket.

---

## Coverage report (deferred)

Not yet wired. To check coverage manually:

```bash
pip install pytest-cov
pytest --cov=src/core --cov-report=term-missing
```

Frontend equivalent:

```bash
cd roadmap_builder && npx vitest run --coverage
# requires `@vitest/coverage-v8` dev-dep
```

Adding `pytest-cov` and `@vitest/coverage-v8` to the dev dependencies is a
small follow-up task — see `CONTRIBUTING.md`.

---

## Reporting verified results

Use `testdata/baseline.json` for expected scenario results. Preserve the
distinction between unit tests, live model regression,
manual browser checks, and real-article quality inspection. Historical academic
results are retained in the archive; they do not establish current acceptance.

---

## Quick links

- Backend pipeline maths: [`docs/PIPELINE.md`](PIPELINE.md)
- Frontend state shapes: [`docs/FRONTEND.md`](FRONTEND.md)
- Workflow + deferred work: [`docs/CONTRIBUTING.md`](CONTRIBUTING.md)
- Architecture overview: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
