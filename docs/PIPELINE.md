# Backend Pipeline Deep Dive

For the high-level diagram, read [`ARCHITECTURE.md`](ARCHITECTURE.md) first.
This doc walks each pipeline stage in detail.

---

## Stage 1 — Extraction (`src/core/extractor.py`)

**Input:** URL or raw text.
**Output:** `(title, body_text)` — both `str`.

Four strategies, tried in order until one returns text ≥ 200 chars:

1. `trafilatura` — best general purpose, multilingual.
2. `newspaper3k` — strong on traditional news (BBC, Reuters).
3. `readability-lxml` — Mozilla Readability port; HTML cleanup.
4. `BeautifulSoup` — last-resort heuristic over `<p>` tags.

If all four fail but at least one returned partial text, the longest partial
wins. If everything is empty → `ValueError`.

For raw-text input, `extract_text(raw)` just returns `("", raw.strip())`.

---

## Stage 2 — Key-point extraction (`src/core/keypoints.py`)

**Input:** body text.
**Output:** list of dicts:

```python
{
  "sentence":  str,    # the picked sentence (display)
  "relevance": float,  # raw cos-sim to closest PESTLE label, 0..1
  "context":   str,    # picked sentence + N neighbours (for classifiers)
  "composite": float,  # informativeness score (debug)
  "position":  int,    # original sentence index
}
```

Steps:

1. **Sentence split.** Regex-based, with abbreviation guard
   (`Mr.`, `e.g.`, `U.S.`, etc.). Sentences outside `[MIN_WORDS, MAX_WORDS]` are
   dropped.
2. **Embed every sentence + every PESTLE anchor** with
   `sentence-transformers/all-MiniLM-L6-v2`. Anchors are the verbalized
   hypotheses from `config.PESTLE_LABEL_VERBALIZED`, which align better with
   sentence-embedding space than bare single words.
3. **Composite score** per sentence:
   `α · sim_centroid + β · max_sim_to_pestle − γ · length_penalty`
   (defaults `α=0.5, β=0.4, γ=0.1`).
4. **MMR selection** picks top-K with diversity penalty (`λ=0.7`).
5. **Relevance** = raw max cosine to closest PESTLE anchor, scaled by
   `KEYPOINTS_RELEVANCE_GAIN` (default 1.4) and clipped to `[0, 1]`. Why the
   gain: raw cosines cluster around 0.20–0.45 for in-domain news; the gain
   lifts them into the τ_low..τ_high band where `_discretize` produces
   meaningful x_ij values.

---

## Stage 3 — PESTLE classification (`src/core/pestle.py`)

**Input:** one sentence (or context bundle from stage 2).
**Output:** `{ label, confidence, top2 }`.

Uses the zero-shot NLI model `MoritzLaurer/deberta-v3-base-zeroshot-v2.0` with
**verbalized hypotheses** (from `config.PESTLE_LABEL_VERBALIZED`):

```
"This news text is primarily about political affairs, government policy, ..."
```

Why verbalized: bare single-word labels (`Political`, `Social`) are
near-synonyms in NLI vector space and yield weak confidences. The verbalized
phrases give the entailment head richer semantic anchors and lift accuracy
materially.

After classification, the verbalized phrase that won is back-mapped to the
canonical short label (`Political`, `Economic`, …, `Environmental`).

**Domain-relevance gate.** If the top score is below
`PESTLE_MIN_CONFIDENCE` (default 0.65) the pick is labelled `Unclassified`
and silently dropped from the impact aggregation. This prevents off-domain
articles (movies, sports) from inflating severity by being force-routed.

---

## Stage 4 — Sentiment (`src/core/sentiment.py` + `router.py`)

**Input:** sentence + its PESTLE label.
**Output:** `{ label, score, confidence, model_id }`.

`router.get_model_config(pestle_label)` looks up which model to run — see
`config.PESTLE_MODELS`:

| Driver | Model | Why |
|--------|-------|-----|
| Political / Social / Technological / Legal | SiEBERT (`siebert/sentiment-roberta-large-english`) | 93.2% mean accuracy across 15 datasets; binary head dodges Twitter-RoBERTa's news-prose neutral collapse. |
| Economic | FinBERT (`ProsusAI/finbert`) | Native 3-class on financial news. |
| Environmental | ClimateBERT-sentiment (`climatebert/distilroberta-base-climate-sentiment`) | Native 3-class with climate-tone axis (opportunity/risk/neutral). |

Binary models (SiEBERT) get a **`neutral_threshold`**: if pos/neg confidence
falls below it, the prediction is coerced to `neutral`. This synthesises a
neutral class from a binary head.

Output mapping is canonical: `positive` → +1, `neutral` → 0, `negative` → -1.

---

## Stage 5 — Impact scoring (`src/core/impact.py`)

The 5-step formula chain that owns every test in
`tests/test_impact.py`.

### Step 1 — Magnitude

```
M_ij = |d_ij| × c_ij × r_j
```

- `|d_ij|`  = `abs(sentiment_score)` → 1 for pos/neg, 0 for neutral.
- `c_ij`    = sentiment confidence, clamped to [0, 1].
- `r_j`     = relevance from stage 2, clamped to [0, 1].

So a neutral keypoint always contributes 0. A high-confidence positive call
on a high-relevance sentence approaches 1.0.

### Step 2 — Discretization

Per-PESTLE tolerance bands (`config.TOLERANCE_BANDS`):

| Magnitude band | x_ij | Meaning |
|----------------|------|---------|
| `M < τ_low`           | 0 | minor    |
| `τ_low ≤ M < τ_high`  | 1 | moderate |
| `M ≥ τ_high`          | 2 | major    |

Default band: low=0.35, high=0.60. Currently uniform across all six drivers.

### Step 3 — Within-driver aggregation (SKD)

```
SKD_i = Σ_j ( x_ij × w_ij )
```

`w_ij` = relevance, normalised to sum 1 within driver `i`. So SKD for one
driver lives in [0, 2] (since x_ij ∈ {0, 1, 2}).

### Step 4 — Across-driver aggregation (STRM)

```
STRM = Σ_{i ∈ A} ( SKD_i × w_i* )
```

where `A` = **active drivers only** (drivers with ≥1 keypoint above τ_low),
and `w_i*` is `config.PESTLE_WEIGHTS` renormalised over `A`.

Why active-only: weighting over inactive drivers dilutes the score
artificially when news only touches 1–2 PESTLE domains.

`severity = STRM / 2`, clipped to [0, 1].

### Step 5 — Verdict

```
severity ≥ DDRM_THRESHOLDS["revise"]   → "Revise"
severity ≥ DDRM_THRESHOLDS["adjust"]   → "Adjust"
otherwise                              → "Maintain"
```

Defaults: adjust=0.35, revise=0.65.

### Worked example

Suppose two keypoints are picked:

| K_id | sentence (paraphrased) | pestle | sentiment | conf | relevance |
|------|------------------------|--------|-----------|------|-----------|
| K1   | "new tariff hits chips" | Economic | -1 | 0.92 | 0.71 |
| K2   | "AI compute demand surges" | Technological | +1 | 0.88 | 0.80 |

Step 1: M_K1 = 1·0.92·0.71 = 0.65, M_K2 = 1·0.88·0.80 = 0.70.
Step 2: both ≥ 0.60 → x = 2 each.
Step 3: each driver has one keypoint, so w_ij = 1.0. SKD_Economic = 2,
SKD_Technological = 2.
Step 4: active set = {Economic, Technological}. Base weights 0.20 each → w* =
0.50 each. STRM = 2·0.5 + 2·0.5 = 2.0. severity = 2/2 = 1.0.
Step 5: 1.0 ≥ 0.65 → **Revise**.

---

## Stage 6 — Roadmap matching (`src/core/roadmap_matcher.py`)

**Input:** impact result + roadmap state from frontend.
**Output:** ranked list of matched roadmap items.

1. `active_drivers()` — pick drivers where `n_active > 0`, sort by severity ↓
   then priority ↓ then count ↓.
2. `normalize_roadmap_items()` — flatten the frontend roadmap shape; expand
   short PESTLE keys (`P`, `E`, `T`) to full labels (`Political`, ...).
3. For each item, intersect its PESTLE tags with the active driver set. Items
   with empty overlap are dropped.
4. Score = `0.65 · severity_sum + 0.25 · priority_sum + 0.05 · overlap_count`,
   capped at 1.0. Sort descending; take top `limit` (default 10).

---

## Stage 7 — Guidance (`src/core/guidance.py`)

Two modes — hosted guidance requires explicit opt-in; offline guidance is the default.

### Deterministic mode (default fallback)

Used when:
- External AI is off in the request or `DDRM_EXTERNAL_AI=off`, OR
- No `OPENROUTER_API_KEY` configured, OR
- No matched items, OR
- All expert calls failed.

`generate_guidance()` builds a per-item suggestion using the static
`ACTION_BY_VERDICT` policy:

| Verdict | review_type | default_action | summary |
|---------|-------------|----------------|---------|
| Maintain | monitor | monitor | Impact is low. Watch matched items. |
| Adjust | focused review | rescope | Impact is material. Adjust scope/timing. |
| Revise | formal revision | revise | Impact is high. Candidate for formal revision. |

### Expert workshop mode (LLM)

Used when the request opts in, the server permits hosted guidance, the selected
model is allowlisted, the verdict is not Maintain, a key is set, and there are
matches with active drivers in their lane.

For each active PESTLE role:

1. Filter keypoints + matches scoped to that role.
2. Build a role-specific prompt — see `_build_expert_prompt()`.
3. Call OpenRouter with **strict JSON-schema output**. The schema's
   `evidence_keypoint_id` is enum-restricted to actual keypoint IDs in scope —
   the API rejects hallucinated citations at the wire.
4. Parallel execution via `ThreadPoolExecutor` (max 6 workers).

`_merge_expert_results()` then stacks per-role advice into a per-item map:

```json
{
  "<item_id>": {
    "item_name": "...",
    "advices": [
      { "role": "Political", "action": "Adjust", "advice": "...",
        "evidence_keypoint": { "id": "K1", "sentence": "...", ... } }
    ]
  }
}
```

The action is **always** the global DDRM verdict — the LLM does NOT pick its
own action label. Severity math owns classification; experts only advise.

`_flatten_for_legacy()` produces the legacy `item_guidance` list shape so
older frontend builds still work.

---

## Where the failure modes live

| Symptom | Likely culprit | File |
|---------|---------------|------|
| 503 + "Semantic keypoint model is unavailable" | sentence-transformers not cached | `keypoints.py:_raise_semantic_required_error` |
| 400 + "No usable sentences found" | All sentences below MIN_WORDS or above MAX_WORDS | `keypoints.py:_split_sentences` |
| Severity always 0 | All keypoints classified as "Unclassified" by the gate | `pestle.py:PESTLE_MIN_CONFIDENCE` |
| LLM advice missing | `OPENROUTER_API_KEY` not set, or all expert calls timed out | `guidance.py:_openrouter_key`, `_call_expert` |
| Frontend gets stale results | `apiUrl` localStorage override pointing at wrong port | `impact-advisor.jsx:ADVISOR_API_KEY` |
