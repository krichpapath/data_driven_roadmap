# Changelog

All notable changes to the DDRM prototype are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely.
Dates use ISO `YYYY-MM-DD`.

Entries describe changes and observations at the time they were recorded.
Historical model results and old scenario names are not current acceptance
evidence. See README.md for the verified development baseline.
---

## [Unreleased]

### 2026-10-30 — QA audit fixes (tmp/qa-audit-2026-10-30)

- News Impact keeps the last good assessment when a new run fails or is stopped
  before any source finishes; changing a setting or opening "Paste text" marks
  results stale instead of deleting them.
- Adding the same advice twice no longer duplicates it on items or in History.
- Removing layers or bands that hold items asks in the shared delete dialog
  (a double-click can no longer confirm it); the toast states the count with Undo.
- The overall score card shows batch numbers only; the per-source "Why" sits with
  that source, and the Revise warning names the highest-scoring source.
- Browser storage meter reports real usage and quota, including source files.
- URL import accepts gzip/deflate pages, prefers IPv4 and names the real failure
  (certificate, connection, timeout).
- API: CORS limited to the local page; `DELETE /api/history/{id}` runs when a
  roadmap is deleted (after the Undo window). Restart the API to apply.
- Import rejects items spanning non-neighbouring bands and unknown PESTLE tags.
- Smaller fixes: Enter adds an item, long titles wrap, phone breadcrumb no longer
  overlaps, Assess button stays in view, case-insensitive tags, short-translation
  warning, clearer import messages, landing placeholders and dead footer links
  removed, footer contrast raised to AA, hosted advice no longer says "fixed verdict".

### 2026-10-30 — One delete confirmation

- Deleting roadmaps, folders, items, sources or saved filters now always asks in
  the same centred dialog with a bin icon, instead of a mix of browser alerts
  and in-page dialogs.

### 2026-10-30 — New landing page and top bar

- The landing page follows the new design: animated roadmap check, source
  ticker, draggable snapshot timeline, stepped "How it works" demo and feature
  grid. Its styles live in `roadmap_builder/landing.css`, scoped under `.lp`.
  Demo content is illustrative and labelled as such; image areas are
  placeholders until real pictures are supplied.
- The shared top bar has a new logo, a sliding tab indicator and arrow-key tab
  navigation, and condenses to one row when a roadmap page scrolls. Tabs slide
  page content in by tab order without remounting it.

### 2026-10-30 — Roadmap library redesign

- Your roadmaps, New roadmap and the template library follow the "Roadmaps
  Library" design: grid and list views,
  search, sort, and a "Continue where you left off" row.
- Roadmap folders (create, rename, delete; deleting a folder keeps its
  roadmaps), pinning, multi-select with Ctrl/Cmd or Shift click, drag onto a
  folder to move, bulk delete with one Undo, and Export JSON from each card.
- The template library has categories, search, a preview, and lets you name
  the roadmap and pick its folder before creating it
  (`#/roadmaps/new/templates`).
- Colour tokens match the design app-wide. Opening a roadmap no longer
  changes its "last edited" time.

### 2026-10-27 — History audit trail

- History is now saved by the analysis service in `data/history.sqlite3`
  (append-only, no 500-change limit). The browser keeps its own copy as an
  outbox and offline cache; existing browser history is copied over, not deleted.
- Each change records its origin (User, Advisor Expert, Source Import,
  Automation, Unknown for older entries), who made it, and structured
  before/after values. Advisor Expert entries keep their run ID, source
  revision and evidence references, and group by run.
- Readable summaries, important-change flags, word-level text diffs, Open item
  and Open source links, advanced filters, saved views, and CSV/JSON export.
- The Advisor Expert's own logic and the recommend API are unchanged; the
  browser adds a run ID and time to each result it receives.

### 2026-10-27 — Source import fixes

- `Start Roadmap Review.cmd`: double-click to run the analysis service and the
  web page in one window. The page stays on port 8000, where saved roadmaps live.

- URL import now says "Cannot reach the analysis service at 127.0.0.1:7875…"
  instead of the browser's bare "Failed to fetch" when the service is not running.
- Thai OCR text joins the split vowel ำ (Tesseract returns ํ + า). On the Thai test
  image, strict character error falls from 3.9% to 2.1%.
- URL import sent `Host: name:443` on HTTPS, which Pantip and Yonhap reject with
  HTTP 400; it now sends the bare host name.
- Web pages are decoded with the charset the server declares (BOM, then HTTP
  header), replacing only invalid bytes. One bad byte on Pantip topic pages had
  turned all Thai text into Mac Roman mojibake.

### 2026-10-26 — Two Python environments

- Replaced `venv/`, `.venv-readiness/`, `tmp/clean-install/` and the broken
  `archive/venv_root/` (Python 3.12 from another machine) with two
  environments built from the same lock file: `.venv-cpu` (any computer) and
  `.venv-gpu` (NVIDIA, PyTorch 2.14.1 + CUDA 13.0). Both pass the Python tests
  and match the ten-scenario baseline. README install and start steps updated.

### 2026-10-21 — News Impact speed fix

- Fixed assessments taking about 3 minutes per source (10 sources: about half an
  hour). Transformers 5 loads a model in the precision it was saved in, and the
  PESTLE checkpoint is float16, which is very slow on a CPU. Every model now loads
  in float32 (`core/router.py: model_load_args`), and the six PESTLE hypotheses
  are scored in one batch. Measured on the ten English scenarios: about 28 s per
  source on the CPU (was 173–197 s) with identical verdicts and severities.
- Use an NVIDIA GPU automatically when the installed PyTorch supports one (about
  1 s per source on an RTX 5060 Laptop GPU). See README "Optional: NVIDIA GPU".
- The API loads all models in the background at start-up, so the first
  assessment no longer waits for them. `tools/e2e_check.py` prints each
  scenario's time; `pytest.ini` limits test discovery to `tests/`.

### 2026-10-19 — Reusable multi-source assessment

- Added a per-roadmap, folder-based source library with IndexedDB persistence,
  original files, editable text, saved revisions and translation review. Deleting a
  roadmap deletes its sources; duplicates start empty. The earlier shared test
  library (storage v1) is discarded on upgrade.
- Added one header on every page: breadcrumbs (Roadmaps / roadmap) and, inside a
  roadmap, Roadmap · Sources · News Impact tabs with their own URLs. News Impact is a
  page that keeps ticked sources and results across tab switches; "Assess selected"
  on the Sources tab opens it with those sources ticked.
- Assess each selected source through the existing API and display an equal-weight
  severity mean only when all succeed. Preserve source/revision/evidence attribution
  when applying and exporting roadmap advice.
- Added protected URL extraction, PDF.js text extraction and local Tesseract OCR.
  Pin Tesseract.js 6.0.1 plus measured official language weights; Japanese spacing
  and scanned tables still require manual correction. English scoring is unchanged.
- Added regression coverage and local research/OCR/verification reports under
  `docs/multi-source/`. No Django, server database or authentication was introduced.

### 2026-10-16 — Selected advice model upgrade

- Default hosted advice to GPT-6 Luna; offer GPT-6.1 Sol, Claude Sonnet 5.5,
  Claude Haiku 5.5 and Qwen3.7 Plus. Migrate old saved GPT-4o defaults to Luna.
- Use model-compatible reasoning options and strict-parameter provider routing;
  report empty or token-truncated advice as failures. Hosted AI remains opt-in.
- Preserve English scoring models and historical readiness evidence. See
  [upgrade verification](docs/readiness/advice-model-upgrade.md).

### 2026-10-16 — Phase 1 readiness

- Isolated and locked dependency updates; recorded installed versions, model
  revisions, full English scenario baselines and security/update inventories.
- Wired server-validated model selection and explicit hosted-AI-off controls;
  report the actual provider model and visible fallback errors.
- Aligned severity labels with 0.35/0.65; bounded URL fetching, blocked private
  destinations and unsafe redirects, and reused downloaded HTML across parsers.
- Serialized assessment calls after a cold-start concurrency check exposed a
  model-loading dtype race. Preserved model weights and scoring rules.
- Protected roadmap autosave during route changes, surfaced failed storage, and
  made full JSON export downloadable using the existing export dialog.
- Added 28 Python and four JavaScript regression cases. See
  [readiness report](docs/readiness/report.md) for actual checks and limitations.
- Preserved all 31 original requirements and 15 acceptance scenarios in the
  release checklist; Django and multi-source implementation remain later phases.


### 2026-10-15 — Archive completed academic work and refresh development docs

- Moved university reports, research references, submission files, and old
  handbook output under `archive/university/`, preserving their contents.
- Saved the original README and a local SHA-256 move manifest. Added
  `archive/README.md` with the locations and Git/local-only boundaries.
- Refreshed README, handbook navigation, folder map, and contributor guidance
  for ongoing development. Historical evaluations are clearly separated from
  current verification.
- Corrected stale model names and configuration comments; application behavior,
  dependencies, and scoring values are unchanged.
- Verified all 156 preserved files by SHA-256, Git ignore boundaries, 54
  backend tests, 50 frontend tests, and a strict handbook build with local
  links checked. Real-model scenarios were not rerun.

Earlier dated entries below are retained as historical records.

### 2026-04-29 — Impact tuning was too sensitive

**Why**: Unrelated news, such as movie news, could be pushed to **Revise**. The
main cause was not the DDRM formula. A weak PESTLE match could still become an
active driver, and one active driver can carry a lot of weight in the final
score.

**Changed**:
- `src/config.py` — raised the PESTLE confidence gate from `0.45` to `0.65`.
  Weak matches are now marked `Unclassified` and ignored by the impact score.
- `src/config.py` — added a neutral floor for FinBERT so weak economic tone is
  less likely to count as positive or negative impact.
- `src/config.py` — retuned tolerance bands to `low=0.35`, `high=0.60`.
  Moderate evidence can still reach **Adjust**, but ordinary signals are less
  likely to jump to **Revise**.
- `src/ui/app.py` — `Unclassified` evidence now shows impact `0.0` in the UI,
  matching the actual DDRM aggregation.
- `src/core/keypoints.py` — stopped using TF-IDF fallback relevance for DDRM
  scoring. If `sentence-transformers` is missing, the app now shows a clear
  install/restart error instead of producing an overconfident result.

**Result**:
- Movie-style unrelated news now stays **Maintain**.
- `news_04` no longer becomes **Revise** because of a TF-IDF fallback score of
  `1.0` on a routine sentence.
- Validation set now lands as intended:
  `news_01-03` → **Adjust**,
  `news_04-05` → **Maintain**,
  `news_06-07` → **Revise**.

**Formula chain untouched**. This only changes gates and tuning values.

### 2026-04-27 — Tolerance bands + relevance gain + active-driver fix (Phase 1 / F + G + rescale)

**Why**: After model swap, news_01 + news_03 still failed Adjust because raw PESTLE-cosine relevance clustered in [0.15, 0.45], capping magnitudes below τ_low. news_03 also lost to active-driver dilution: x=0 picks on wrong drivers ate w_star mass.

**Changed**:
- `src/config.py` — added `KEYPOINTS_RELEVANCE_GAIN = 2.0` (rescale knob, clipped to 1.0). Recalibrated `TOLERANCE_BANDS`: τ_low 0.30→0.22 (Pol/Soc/Legal), τ_low 0.25→0.22 (Econ/Tech), Env 0.25→0.20. τ_high 0.60→0.65 (non-env), 0.55→0.55 Env (effective bump after intermediate sweep).
- `src/core/keypoints.py` — applies `KEYPOINTS_RELEVANCE_GAIN` to raw cosine before emit.
- `src/core/impact.py` — `aggregate_by_pestle` now reports `n_active` (picks with x>0). `overall_impact` uses `n_active>0` to decide active drivers (paper-aligned: drivers with all-x=0 contribute zero; counting them dilutes w_star).

**Formula chain untouched**. All three are knob/filter tweaks the paper exposes.

**Result** (severity, all 3 articles target Adjust [0.35, 0.65)):

| File | Pre-Phase-1 | Post-Phase-1 |
|---|---|---|
| news_01 | 0.196 (Maintain) | **0.500 (Adjust)** |
| news_02 | 0.420 (Adjust) | **0.630 (Adjust)** |
| news_03 | 0.333 (Maintain) | **0.506 (Adjust)** |

**Validate**: `python tools/diagnose_impact.py testdata/*.txt`.

### 2026-04-27 — Per-driver sentiment model swap

**Why**: Twitter-RoBERTa was trained on tweets and went neutral on ~57% of news-prose picks → magnitude collapse → news_01/03 stuck at Maintain.

**Changed**:
- `src/config.py` `PESTLE_MODELS` — routed each driver to a domain-fit model with `label_map` and (binary models) `neutral_threshold`.
- `src/core/sentiment.py` — applies `label_map`; coerces binary predictions below `neutral_threshold` to `neutral`.
- `FALLBACK_SENTIMENT_MODEL` → SiEBERT.

**Models picked**:

| Driver | Model | Why |
|---|---|---|
| Political | `siebert/sentiment-roberta-large-english` | Hartmann 2023, IJRM: 93.2% acc across 15 datasets (vs 78.1% SST-2 baseline). Trained on news+tweets+reviews. |
| Economic | `ProsusAI/finbert` (kept) | Reuters + Financial PhraseBank; ≈0.86 macro F1 (arXiv:1908.10063); 3-class native. |
| Social | `siebert/sentiment-roberta-large-english` | Same SiEBERT proof; mixed-register training fits Social. |
| Technological | `siebert/sentiment-roberta-large-english` | Same SiEBERT proof; threshold 0.75 (vs 0.70) because tech-news hedges more. |
| Legal | `siebert/sentiment-roberta-large-english` | No peer-reviewed legal-news-sentiment model exists on HF (LegalBERT = case outcomes, wrong task). SiEBERT fallback. |
| Environmental | `climatebert/distilroberta-base-climate-sentiment` | Bingler et al. 2022/2023, Finance Research Letters; native opportunity/risk/neutral. NOT `*-climate-detector` (topic-only). |

**Validate**: re-run `python tools/diagnose_impact.py testdata/news_01_us_china_chip_war.txt testdata/news_03_data_center_pdpa.txt`. Expect neutral leak drop, severity ≥ 0.35.

### 2026-04-27 — Synthetic test articles for impact-score validation
- Added `testdata/` with 3 fake English news files modelled on the Thai 2024
  Digital Industry roadmap review. Each targets a different PESTLE mix and is
  expected to land in the **Adjust** band.
- Files: `news_01_us_china_chip_war.txt` (Political-heavy),
  `news_02_genai_asean_surge.txt` (Economic-heavy),
  `news_03_data_center_pdpa.txt` (Environmental-heavy). See `testdata/README.md`.

### 2026-04-27 — Keypoint extractor: context windows + raw PESTLE relevance (A + B)

**Why**
After the initial semantic + MMR upgrade, manual testing showed the impact
calculator was systematically underrating articles:
- Sentiment ran on bare sentences and lost surrounding discourse, dropping its
  confidence (and therefore the magnitude `M = |d|·c·r`).
- The relevance weight returned by the extractor was rank-normalized
  (top pick = 1.0, others scaled down), which over-discounted lower-ranked
  but still on-topic picks.

The combination dragged STRM/severity below the "Adjust" threshold even on
articles a human reviewer would clearly label Adjust or Revise.

**What changed**

1. **Context-window output (A)**
   `keypoints.py` now returns, for each pick, the bare sentence *and* a
   `context` string containing the sentence plus N neighbour sentences on each
   side (configurable via `KEYPOINTS_CONTEXT_WINDOW`, default `1`). The UI
   continues to display the bare sentence; PESTLE / sentiment classifiers now
   consume the context string for stronger signal.

2. **Raw PESTLE-similarity relevance (B)**
   `relevance` is now the raw max cosine between the sentence embedding and
   the closest PESTLE label embedding, clipped to `[0, 1]`. It reflects
   driver-alignment confidence, not pick rank, so multiple on-topic picks
   carry meaningful weight into `point_impact` / `aggregate_by_pestle` /
   `overall_impact`.

3. **New rich API**
   - `extract_keypoints_rich(text, max_points)` returns
     `[{ sentence, relevance, context, composite, position }, ...]`.
   - `extract_keypoints(text, max_points)` is preserved as a 2-tuple
     `(sentence, relevance)` shim that calls the rich function. Existing
     callers keep working but now receive the new relevance semantics.

4. **Config**
   - Added `KEYPOINTS_CONTEXT_WINDOW = 1` to `src/config.py`.

5. **UI**
   - `src/ui/app.py` `run_pipeline` now uses `extract_keypoints_rich` and
     classifies on `context`, displays `sentence`.
   - `src/ui/keypoints_lab.py` shows `relevance`, `composite`, `sentence`,
     `context` columns side-by-side for tuning.

**Files touched**
- `src/config.py` — added one knob.
- `src/core/keypoints.py` — new rich API + context builder; legacy API kept.
- `src/ui/app.py` — feeds `context` into PESTLE / sentiment, displays sentence.
- `src/ui/keypoints_lab.py` — surfaces `context` and `composite`.

**Files NOT touched (verified backwards-compatible)**
- `src/core/pestle.py`, `src/core/sentiment.py`, `src/core/router.py`,
  `src/core/impact.py`, `src/core/extractor.py` — unchanged. Both classifiers
  already accept arbitrary text; impact scoring already multiplies by
  `relevance` and benefits directly from the new value.

**How to validate**
1. Open `python src/ui/keypoints_lab.py`. Confirm `relevance` column now
   varies per pick (no longer always `1.0` for the top one with rest scaled).
   Confirm `context` column shows multi-sentence strings when a pick is not
   at a paragraph edge.
2. Run the main pipeline (`python src/ui/app.py`) on the same article you
   used before. Compare:
   - sentiment confidence per evidence row (should generally rise).
   - per-driver SKD and overall STRM (should rise on under-rated articles).
   - verdict (Maintain → Adjust, or Adjust → Revise on borderline cases).
3. If STRM still feels low, the next levers are
   (C) per-driver retrieval to surface minor drivers, then
   (E) recalibrating `TOLERANCE_BANDS` / `DDRM_THRESHOLDS` against a labeled
   set.

**Risk / rollback**
- Pure additive change to `keypoints.py` public API; legacy 2-tuple form
  preserved.
- To roll back, revert this commit; no data migrations.

---

## [Earlier]

### 2026-04-27 — Semantic + MMR + PESTLE-prior keypoint extractor

**Why**
Original `keypoints.py` used mean TF-IDF per sentence: biased toward short
sentences with rare words, no semantics, no diversity, no driver-awareness.
Boilerplate ("Subscribe to newsletter") frequently outscored real signal.

**What changed**
- Replaced TF-IDF mean with `sentence-transformers/all-MiniLM-L6-v2`
  embeddings.
- Score combines centroid similarity (informativeness), max-cosine to PESTLE
  labels (driver relevance), and a length-deviation penalty.
- Added Maximal Marginal Relevance (MMR) selection for diversity.
- Added abbreviation-aware sentence splitter ("U.S.", "Dr.", "e.g." no longer
  break splits).
- Added length-bound filter (drops stubs and run-ons).
- TF-IDF kept as a graceful fallback if `sentence-transformers` is missing.

**Files touched**
- `src/config.py` — added `KEYPOINTS_EMBED_MODEL`, `KEYPOINTS_ALPHA/BETA/GAMMA`,
  `KEYPOINTS_MMR_LAMBDA`, `KEYPOINTS_MIN_WORDS`, `KEYPOINTS_MAX_WORDS`.
- `src/core/keypoints.py` — full rewrite, public signature preserved.
- `src/ui/keypoints_lab.py` — new standalone Gradio lab for tuning knobs and
  comparing semantic vs TF-IDF baseline side-by-side. Independent from
  `app.py`.
