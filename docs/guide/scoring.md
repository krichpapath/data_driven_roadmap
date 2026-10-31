# The scoring maths

This is where the verdict actually comes from. It is five steps of arithmetic —
no machine learning, no magic. If you can follow a weighted average, you can
follow all of it.

**File:** `src/core/impact.py`. Every function here is covered by
`tests/test_impact.py`, which doubles as worked examples.

---

## The notation

The code and the report use subscripts. Decoded:

| Symbol | Means |
| --- | --- |
| `i` | a PESTLE driver (Political, Economic, …) |
| `j` | one extracted sentence (a "key point") |
| `d` | sentiment direction: `+1`, `0`, or `-1` |
| `c` | how confident the sentiment model was, `0`–`1` |
| `r` | relevance of the sentence, `0`–`1` |
| `M` | magnitude — the strength of one piece of evidence |
| `x` | that magnitude bucketed into `0`, `1`, or `2` |
| `SKD` | the score for one driver |
| `STRM` | the combined score across drivers |

---

## Step 1 — How strong is one piece of evidence?

```text
M_ij  =  |d_ij|  ×  c_ij  ×  r_j
          ^direction ^confidence ^relevance
```

Multiply three things together:

- **Direction** — `1` if the sentence is positive or negative, `0` if neutral.
- **Confidence** — how sure the sentiment model was.
- **Relevance** — how well the sentence matched its PESTLE category.

All three are between 0 and 1, so `M` is too.

!!! note "Neutral wipes everything out"
    If a sentence is neutral, `|d| = 0`, so `M = 0` no matter how confident or
    relevant it was. A purely factual sentence contributes nothing. This is
    intentional — impact requires a *direction*.

**Example:** a negative sentence, model 92% confident, relevance 0.71:

```text
M = 1 × 0.92 × 0.71 = 0.65
```

---

## Step 2 — Bucket it into minor / moderate / major

Continuous scores are hard to reason about, so `M` is squashed into three levels
using two thresholds (the **tolerance bands** in `src/config.py`):

| Condition | `x` | Meaning |
| --- | --- | --- |
| `M < 0.35` | **0** | minor — ignore it |
| `0.35 ≤ M < 0.60` | **1** | moderate |
| `M ≥ 0.60` | **2** | major |

Our example, `M = 0.65`, becomes `x = 2` — major.

All six drivers currently use the same band. The structure allows per-driver
bands if you ever need them.

??? question "Why 0.35 and 0.60?"
    These were recalibrated after diagnostics showed real semantic relevance
    usually lands between 0.30 and 0.60. The bands are set so genuine evidence
    can reach *Adjust*, while routine news stays below. The comment in
    `src/config.py` records the reasoning — read it before changing them.

---

## Step 3 — Combine within one driver

```text
SKD_i  =  sum over sentences j of  ( x_ij × w_ij )
```

If three sentences all landed in *Economic*, combine them into a single Economic
score. The weights `w` are the sentences' relevance values, normalised so they
add up to 1 within that driver.

So this is a **weighted average of the buckets**, where more relevant sentences
count more. Since `x` maxes out at 2, `SKD` for a driver lands between 0 and 2.

---

## Step 4 — Combine across drivers

```text
STRM  =  sum over ACTIVE drivers i of  ( SKD_i × w_i* )
```

Now combine the drivers. Each has a base importance:

| Driver | Weight |
| --- | --- |
| Political | 0.20 |
| Economic | 0.20 |
| Technological | 0.20 |
| Social | 0.15 |
| Legal | 0.15 |
| Environmental | 0.10 |

The critical detail: **only *active* drivers are counted.** A driver is active
if it has at least one sentence above the lower threshold. The weights are then
renormalised across just those active drivers.

!!! warning "This is the subtlest idea in the whole calculation"
    If you weighted across all six drivers, an article that only touches Legal
    and Technological would be divided by six — permanently capping its severity
    low no matter how serious it is. Focused news would be structurally unable
    to trigger *Revise*. Renormalising over active drivers only is what stops
    that.

Then:

```text
severity = STRM / 2      (clipped to 0..1)
```

Dividing by 2 is just because `SKD` maxes at 2, so this rescales to a clean
0–1 range.

---

## Step 5 — Pick the verdict

```text
severity ≥ 0.65   →  Revise
severity ≥ 0.35   →  Adjust
otherwise         →  Maintain
```

Those two numbers are `DDRM_THRESHOLDS` in `src/config.py`.

---

## A complete worked example

Two sentences survive extraction:

| ID | Roughly says | Driver | Sentiment | Conf | Relevance |
| --- | --- | --- | --- | --- | --- |
| K1 | "new tariff hits chips" | Economic | −1 | 0.92 | 0.71 |
| K2 | "AI compute demand surges" | Technological | +1 | 0.88 | 0.80 |

**Step 1**

```text
M_K1 = 1 × 0.92 × 0.71 = 0.65
M_K2 = 1 × 0.88 × 0.80 = 0.70
```

**Step 2** — both are ≥ 0.60, so both become `x = 2`.

**Step 3** — one sentence per driver, so each weight is 1.0:

```text
SKD_Economic      = 2
SKD_Technological = 2
```

**Step 4** — active set is {Economic, Technological}. Base weights 0.20 each,
renormalised to 0.50 each:

```text
STRM     = (2 × 0.5) + (2 × 0.5) = 2.0
severity = 2.0 / 2 = 1.0
```

**Step 5** — `1.0 ≥ 0.65` → **Revise**.

---

## Seeing it on real data

`tools/diagnose_impact.py` prints this entire chain for any article — every
sentence, its magnitude, its bucket, per-driver totals, and where signal was
lost:

```bash
python tools/diagnose_impact.py testdata/revise_02_sweeping_digital_mandate.txt
```

The output includes a **leak audit** showing exactly why severity ended up lower
than you expected — how many sentences were neutral, how many fell below the
lower threshold, how many had weak relevance. This is the single most useful
tool for understanding a surprising verdict.

---

## Tuning it

All the knobs live in `src/config.py`:

| Setting | Effect of raising it |
| --- | --- |
| `TOLERANCE_BANDS` low | Fewer sentences count at all → lower severity |
| `TOLERANCE_BANDS` high | Harder to reach "major" → lower severity |
| `DDRM_THRESHOLDS` | Harder to reach Adjust/Revise |
| `PESTLE_WEIGHTS` | That driver matters more when active |
| `PESTLE_MIN_CONFIDENCE` | Stricter category gate → more discarded |
| `KEYPOINTS_MAX` | More sentences considered |

!!! danger "Re-run the acceptance check after any change here"
    These values were calibrated together against the ten labelled scenarios.
    Changing one in isolation will silently break others. After editing, always:

    ```bash
    python tools/e2e_check.py
    ```

    All ten scenarios should still match. There is a fuller explanation in
    `IMPACT_VALUES_GUIDE.md`.

---

Next: [Tour of the codebase](codebase-tour.md).
