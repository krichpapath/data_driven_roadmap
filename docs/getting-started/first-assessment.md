# 3. Your first assessment

Both servers are running from [the previous page](first-run.md). Now let us
actually use the thing.

---

## Step 1 — Make a roadmap

Open <http://127.0.0.1:8000>.

1. Click **New roadmap**.
2. Choose **Industrial Digital** from the template picker. It is marked
   *Recommended* and mirrors the Thai Digital Industry roadmap the research is
   based on, so it already contains sensible items.
3. You now see the **roadmap grid**.

### Reading the grid

The grid has two axes:

- **Columns are time bands** — `2024–2026`, `2027–2030`, `Beyond 2030`.
- **Rows are layers** — Business Drivers, Strategic Targets, Products, Process,
  R&D Programs, Infrastructure, Resources.

Each coloured card sitting in a cell is a **roadmap item**. Click one to edit
it. The important field for our purposes is its **PESTLE tags** — those decide
whether a news article can match this item at all.

!!! tip "PESTLE is the vocabulary of this whole project"
    Six categories: **P**olitical, **E**conomic, **S**ocial, **T**echnological,
    **L**egal, **En**vironmental. Both the news evidence *and* your roadmap
    items get tagged with them. Matching happens where the two overlap.

---

## Step 2 — Open the advisor

Find the **Assess news** panel (the impact advisor). You will see:

| Field | What to put in it |
| --- | --- |
| **Input type** | `Article text` or `News URL` |
| The big text box | Paste your news article here |
| **Evidence points** | How many sentences to extract — **leave this alone** |
| **LLM advice model** | Only matters if you set an API key |

!!! danger "Do not change 'Evidence points' casually"
    It defaults to **7**, and that is not an arbitrary number — the scoring
    thresholds were calibrated at 7. Setting it to 5 makes borderline articles
    come out with the wrong verdict. There is a full explanation in
    [Troubleshooting](../guide/troubleshooting.md#the-verdicts-are-wrong).

---

## Step 3 — Feed it a test article

Do not hunt for a real news article yet. The project ships ten test articles
with **known correct answers**, in the `testdata/` folder:

```text
testdata/
├── maintain_01_routine_industry_briefing.txt     → should say Maintain
├── maintain_02_thai_genai_pilot.txt              → should say Maintain
├── maintain_03_clmv_data_workshop.txt            → should say Maintain
├── adjust_01_chip_export_controls.txt            → should say Adjust
├── adjust_02_genai_asean_surge.txt               → should say Adjust
├── adjust_03_data_center_pdpa.txt                → should say Adjust
├── adjust_04_industry_ai_sandbox.txt             → should say Adjust
├── revise_01_multi_crisis_pdpa_penalties.txt     → should say Revise
├── revise_02_sweeping_digital_mandate.txt        → should say Revise
└── revise_03_foreign_ai_investment_rules.txt     → should say Revise
```

The filename tells you the expected verdict. That is deliberate — it is how the
automated end-to-end check works.

Open `testdata/adjust_01_chip_export_controls.txt`, copy all of it, paste it
into the advisor, and click **Run**.

!!! info "These articles are synthetic"
    They were written for testing. The facts, figures and quotes are invented.
    Do not cite them as real reporting.

---

## Step 4 — Wait

The first run takes **several minutes** while the AI models download. Later runs
take about 45–60 seconds. The progress indicator will move through the pipeline
stages.

---

## Step 5 — Read the result

You get back five things. Understanding these is understanding the project.

### The verdict

A big **Maintain**, **Adjust**, or **Revise**, plus a **severity** number from
0.00 to 1.00. For `adjust_01` you should get **Adjust** at about `0.50`.

The verdict is purely a threshold on severity:

```text
severity < 0.35   →  Maintain
0.35 ≤ s < 0.65   →  Adjust
severity ≥ 0.65   →  Revise
```

### The evidence

The individual sentences it pulled out, each labelled with:

- its **PESTLE category** and how confident the classifier was,
- its **sentiment** (positive / neutral / negative),
- its **relevance** score,
- which model judged it.

This is the traceability that the research is really about. Every number in the
final verdict can be walked back to a specific sentence.

### The drivers

Which PESTLE categories were *active* — meaning at least one piece of evidence
in that category cleared the minimum bar.

### Matched roadmap items

Your roadmap items whose PESTLE tags overlap with the active drivers, ranked by
how strongly they are implicated.

!!! question "Got zero matches?"
    That is normal and not a bug. It means no roadmap item shares a PESTLE tag
    with the active drivers. Try an article that hits categories your items are
    actually tagged with.

### The advice

A suggested review action per matched item. Without an API key this comes from a
fixed rule table. With a key, a language model writes tailored advice per PESTLE
role — and the advice must cite one of the extracted sentences as its evidence.

!!! note "The maths owns the verdict, never the LLM"
    Even in LLM mode, the language model **cannot** choose the action label. It
    only writes prose explaining the action that the severity calculation
    already decided. This is a deliberate design decision — keep it that way.

---

## Step 6 — Try to break it

The fastest way to build intuition:

1. Run `maintain_01` and `revise_01` back to back. Compare the severities.
2. Feed it something completely off-topic — a sports report. Most sentences
   should come back **Unclassified** and be discarded, giving a low severity.
   That filter is intentional.
3. Change an item's PESTLE tags and re-run. Watch the matches change.

---

Now you have seen it work. Next, understand *why*:
[The problem it solves](../guide/the-problem.md).
