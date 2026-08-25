# Common tasks

Recipes for the changes you are most likely to be asked to make. Each says
which file to open and what to watch out for.

---

## Change how strict the verdicts are

**File:** `src/config.py`

```python
DDRM_THRESHOLDS = {
    "adjust": 0.35,   # below this = Maintain
    "revise": 0.65,   # at or above this = Revise
}
```

Raising these makes the system more conservative (more Maintains). Lowering them
makes it more reactive.

!!! danger "Always re-run the acceptance check"
    ```bash
    python tools/e2e_check.py
    ```
    All ten scenarios must still match. These numbers were calibrated together
    with the tolerance bands — changing one alone tends to break others.

---

## Change how important a PESTLE driver is

**File:** `src/config.py`

```python
PESTLE_WEIGHTS = {
    "Political":     0.20,
    "Economic":      0.20,
    "Social":        0.15,
    "Technological": 0.20,
    "Legal":         0.15,
    "Environmental": 0.10,
}
```

Remember these are renormalised over *active* drivers at runtime, so what
matters is the ratio between them, not the absolute values.

---

## Change how many sentences are extracted

**File:** `src/config.py`

```python
KEYPOINTS_MIN = 3
KEYPOINTS_MAX = 7
```

!!! warning "Three places must agree"
    `config.py` is the source of truth. The API imports from it, and the
    frontend has a mirrored copy near the top of
    `roadmap_builder/impact-advisor.jsx`:

    ```javascript
    const KEYPOINTS_MIN = 3;
    const KEYPOINTS_MAX = 7;
    ```

    The browser cannot read a Python file, so this copy has to be updated by
    hand. If you change `config.py`, change the `.jsx` too — and bump the
    `?v=` number on that script tag in `index.html`.

---

## Swap a sentiment model

**File:** `src/config.py`, the `PESTLE_MODELS` mapping.

Each driver maps to a model ID and its settings. Binary models (positive/negative
only) need a `neutral_threshold` so a neutral class can be synthesised.

Then run `python tools/e2e_check.py` — a different model will shift severities
and may require re-tuning the tolerance bands.

---

## Add a new news test scenario

1. Write the article as a `.txt` file in `testdata/`.
2. **Name it after the verdict you expect**: `maintain_*`, `adjust_*`, or
   `revise_*`. The end-to-end checker reads the expected answer straight from
   the filename.
3. Add a row to the table in `testdata/README.md`.
4. Run `python tools/e2e_check.py` and confirm it passes.

---

## Add a new field to the assessment result

The result travels from Python to the browser as JSON, so you touch both sides.

1. **Backend** — add the field in `run_pipeline()` in `src/ui/app.py`, inside the
   `result` dictionary.
2. **Frontend** — read it in `roadmap_builder/impact-advisor.jsx` where the
   response is unpacked, and render it.
3. Bump the `?v=` number for `impact-advisor.jsx` in `index.html`.
4. Update the contract table in [Architecture](../ARCHITECTURE.md).

---

## Add a new roadmap template

**File:** `roadmap_builder/data.jsx`

Copy an existing template object and edit it. Each needs `bands` (the time
columns), `categories` (the layer rows), and `items`. Make sure every item has
sensible PESTLE tags, or it will never match any news.

---

## Change the wording of the fallback advice

**File:** `src/core/guidance.py`, the `ACTION_BY_VERDICT` table.

This is the advice shown when no LLM key is configured. It is a plain
dictionary — no model involved.

---

## Run only some tests

```bash
pytest tests/test_impact.py
```

```bash
pytest -k "discretize"
```

```bash
pytest -v -s
```

`-s` lets `print()` reach your terminal, which is the fastest way to debug a
failing calculation.

For the frontend:

```bash
cd roadmap_builder
```

```bash
npx vitest run __tests__/reducers.test.js
```

---

## Preview this documentation site

```bash
pip install -r requirements-dev.txt
```

```bash
mkdocs serve
```

Then open <http://127.0.0.1:8000>.

!!! warning "Port clash"
    That is the same port the roadmap builder uses. Stop the builder's file
    server first, or run `mkdocs serve -a 127.0.0.1:8001`.

To produce a static site in `site/`:

```bash
mkdocs build
```

---

## Add a page to this handbook

1. Create the `.md` file under `docs/`.
2. Add it to the `nav:` list in `mkdocs.yml`.
3. Run `mkdocs build --strict` to catch broken links before committing.

---

## Regenerate the diagnostic dump

```bash
python tools/diagnose_impact.py testdata/adjust_01_chip_export_controls.txt
```

Writes JSON to `tools/diagnostic_output/` and prints the full scoring chain,
including the leak audit that shows where signal was lost.

---

## Before you commit

```bash
pytest
```

```bash
cd roadmap_builder && npm test
```

And if you touched anything in `src/config.py` or `src/core/`:

```bash
python tools/e2e_check.py
```

See [Contributing](../CONTRIBUTING.md) for the full checklist.
