# Impact Calculation — Quick Value Guide

Read this before editing `src/config.py`. Short reference for what each value
means, where it comes from, and which knob to turn.

---

## DDRM formula chain (5 steps)

```
Step 1   M_ij  = |d_ij| · c_ij · r_j         per-keypoint magnitude (0..1)
Step 2   x_ij  in {0, 1, 2}                  bin via tolerance bands
Step 3   SKD_i = Σ_j ( x_ij · w_ij )         within-driver score (0..2)
Step 4   STRM  = Σ_{i active} SKD_i · w_i*   across-driver score (0..2)
Step 5   severity = STRM / 2                 Maintain / Adjust / Revise
```

`i` = PESTLE driver. `j` = keypoint within driver.

---

## Per-keypoint values (Step 1 — magnitude)

| Symbol | What it is | Range | Source | Config knob |
|---|---|---|---|---|
| `|d_ij|` | Sentiment direction. 1 if pos/neg, 0 if neutral | 0 or 1 | `core/sentiment.py` → routed model output | `PESTLE_MODELS[driver].neutral_threshold` |
| `c_ij` | Sentiment confidence | 0..1 | sentiment model `result["score"]` | `PESTLE_MODELS[driver].model_id` |
| `r_j` | Relevance — how well the keypoint matches its PESTLE driver | 0..1 | `core/keypoints.py` raw cosine × `KEYPOINTS_RELEVANCE_GAIN` | `KEYPOINTS_RELEVANCE_GAIN` |

**M = |d| · c · r**. Neutral → M=0 instantly. Low confidence or low relevance → small M.

---

## Bin into impact level (Step 2 — discretize)

`τ_low` and `τ_high` are per-driver tolerance thresholds.

| Magnitude range | x | Meaning |
|---|---|---|
| M < τ_low | 0 | minor / below-noise |
| τ_low ≤ M < τ_high | 1 | moderate |
| M ≥ τ_high | 2 | major shock |

Knob: `TOLERANCE_BANDS[driver] = {"low": ..., "high": ...}`.

Tighter bands (lower τ_low / lower τ_high) = more picks count as moderate/major
= higher severity. Loose bands = stricter = lower severity.

---

## Within-driver weighting (Step 3)

| Symbol | What it is | Range | Source |
|---|---|---|---|
| `w_ij` | Per-keypoint weight inside one driver. Auto-derived = relevance normalized so weights inside a driver sum to 1 | 0..1 | computed in `core/impact.py` `aggregate_by_pestle` |

No knob. Falls out of the formula.

`SKD_i` = weighted sum of x's. Range 0..2.

---

## Across-driver weighting (Step 4)

| Symbol | What it is | Range | Source | Config knob |
|---|---|---|---|---|
| `W_i` | Base PESTLE driver weight (research-given) | 0..1, sums to 1 | DDRM paper / your judgement | `PESTLE_WEIGHTS` |
| `w_i*` | Active-only normalized weight `W_i / Σ_{active} W_k` | 0..1 | computed | — |
| `active` | Driver has at least one keypoint with x > 0 | bool | computed | filter: `n_active > 0` |

Only **active** drivers contribute. A driver with all picks below tolerance is
silenced (paper-aligned).

Knob: change `PESTLE_WEIGHTS` if a driver matters more/less for your roadmap
domain. Sum doesn't need to equal 1 — runtime renormalizes over active set.

---

## Verdict (Step 5)

| Severity range | Verdict | Meaning |
|---|---|---|
| severity < `adjust` | Maintain | roadmap unchanged |
| `adjust` ≤ severity < `revise` | Adjust | minor revision |
| severity ≥ `revise` | Revise | major rework needed |

Knob: `DDRM_THRESHOLDS = {"adjust": 0.35, "revise": 0.65}`.

---

## Where each model comes from

| Stage | Model | Purpose |
|---|---|---|
| Keypoint extraction | `KEYPOINTS_EMBED_MODEL` (sentence-transformers) | Pick top-N informative + driver-relevant + diverse sentences |
| PESTLE classification | `PESTLE_MODEL` (zero-shot, bart-large-mnli) | Tag each keypoint with one of 6 drivers |
| Sentiment | `PESTLE_MODELS[driver].model_id` | Score sentiment per driver (different model per driver) |

---

## Quick troubleshooting cheatsheet

| Symptom | Likely cause | Knob to try |
|---|---|---|
| Severity stuck low (Maintain everywhere) | Too many neutral predictions | Lower `neutral_threshold` (binary models) or swap sentiment model |
| Severity stuck low even with non-neutral picks | Magnitudes < τ_low | Lower `TOLERANCE_BANDS[*].low`, raise `KEYPOINTS_RELEVANCE_GAIN` |
| All articles flagged Revise | τ_high too low or gain too high | Raise `TOLERANCE_BANDS[*].high`, lower `KEYPOINTS_RELEVANCE_GAIN` |
| Wrong driver hit | Zero-shot mislabel | Swap `PESTLE_MODEL` (e.g. DeBERTa zeroshot v2.0) |
| One driver with all-zero picks dilutes others | Out-of-band picks counted as active | Already handled by `n_active > 0` rule |

---

## Tuning workflow

1. Run `python tools/diagnose_impact.py testdata/<file>.txt` — dumps every
   intermediate value per keypoint.
2. Look at the per-pick table: which column is killing the score?
   - `|d|=0` → sentiment went neutral → fix sentiment model / threshold.
   - `mag` low → relevance low or confidence low → fix gain or sentiment model.
   - `x=0` everywhere → bands too high.
3. Look at the leak audit: which drivers are inactive? PESTLE classifier issue.
4. Edit `src/config.py` knob, re-run diagnostic, compare.

Keep one knob per change. Easier to attribute the delta.
