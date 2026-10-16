# Changelog

All notable changes to the DDRM prototype are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely.
Dates use ISO `YYYY-MM-DD`.

Entries describe changes and observations at the time they were recorded.
Historical model results and old scenario names are not current acceptance
evidence. See README.md for the verified development baseline.
---

## [Unreleased]

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
