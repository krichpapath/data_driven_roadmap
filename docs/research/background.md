# Research background

The theory the code implements, and where it came from. Useful if you are
continuing the research, writing about the project, or defending a design
decision.

---

## The project in one sentence

> A traceable mechanism for turning unstructured news text into a defensible
> technology-roadmap review recommendation, while leaving the final judgment
> with human experts.

| | |
| --- | --- |
| **Project code** | `68-1_22_nrc-r1` |
| **Title (EN)** | Drivers and Trends Impact Assessment Mechanism for Dynamic Technology Roadmap Status Monitoring |
| **Title (TH)** | โครงการศึกษาและพัฒนากลไกการประเมินผลกระทบจากปัจจัยและแนวโน้มสำหรับการติดตามสถานะแผนที่นำทางการวิจัยและพัฒนาเทคโนโลยี |
| **Course** | CS403, Department of Computer Science, Thammasat University |
| **Advisor** | อ.ดร. นวฤกษ์ ชลารักษ์ |

---

## The three ideas you need

### 1. Technology roadmapping

A **technology roadmap** places planned research, products, and capabilities on
a timeline, usually as a grid of layers (business drivers, targets, products,
R&D, infrastructure) against time bands. It is a coordination device: it tells
everyone what is supposed to exist when.

Its weakness is that it is a static artefact describing a changing world.

### 2. Data-Driven Roadmapping (DDRM)

**DDRM** is the research approach this project builds on — using data rather
than workshop intuition alone to inform roadmap decisions, including monitoring
whether a roadmap's status still holds.

The gap this project identified: DDRM literature establishes that status
monitoring *should* happen, but gives **limited operational detail** for
converting unstructured textual evidence into a traceable status
recommendation. Saying "monitor with data" is not the same as specifying how a
paragraph of news becomes a defensible verdict.

The primary source is in the repository:

```text
references/Data-Driven_Roadmapping_DDRM_Approach_and_Case_Demonstration.pdf
```

The `DDRM_` prefix throughout the code — `DDRM_THRESHOLDS`, "DDRM verdict" —
refers to this.

### 3. PESTLE analysis

**PESTLE** is a long-standing strategic-analysis framework for categorising
external forces:

| | Category | Covers |
| --- | --- | --- |
| **P** | Political | Government policy, regulation, political stability |
| **E** | Economic | Markets, funding, trade, GDP |
| **S** | Social | Demographics, culture, workforce attitudes |
| **T** | Technological | Innovation pace, R&D, infrastructure |
| **L** | Legal | Compliance, IP, data privacy law |
| **En** | Environmental | Sustainability, climate, resource use |

This project uses PESTLE as the **shared vocabulary** connecting two different
things: news evidence gets classified into these categories, and roadmap items
get tagged with them. Matching happens where the two overlap. That shared
vocabulary is what makes automated matching possible at all.

---

## The contribution

The workflow, stated as the research states it:

```text
   evidence input
        → key sentence extraction
            → PESTLE classification
                → sentiment direction analysis
                    → impact scoring
                        → roadmap item matching
                            → status label
```

Mapping to three review labels — **Maintain**, **Adjust**, **Revise**.

The claimed contribution is the **traceable evidence-to-status mechanism**. Not
the classifier, not the UI — the fact that every number in the final verdict can
be walked back to the specific sentence that produced it, with the confidence of
each intermediate judgement recorded.

!!! quote "The boundary condition"
    *"The main contribution is a traceable evidence-to-status mechanism for
    roadmap monitoring, while final roadmap judgment remains with experts."*

    This constrains what the software is allowed to do. Two design decisions
    enforce it directly: the language model cannot select the action label
    (severity maths owns that), and low-confidence evidence is discarded rather
    than forced into the nearest category.

---

## Design decisions and their justifications

Useful when someone asks "why did you do it that way?".

### Why verbalised PESTLE hypotheses instead of single words

The classifier is asked whether text entails *"This news text is primarily about
political affairs, government policy…"* rather than simply "Political".

Bare single-word labels sit too close together in the model's semantic space —
*Political* and *Social* are near-synonyms to it — producing weak, unreliable
confidences. Longer descriptive phrases give the entailment head richer anchors
and materially improve accuracy.

### Why a different sentiment model per driver

| Driver | Model | Reason |
| --- | --- | --- |
| Political, Social, Technological, Legal | SiEBERT | Strong general accuracy across many datasets; its binary head avoids the neutral collapse that general social-media models show on news prose |
| Economic | FinBERT | Natively trained three-class on financial news |
| Environmental | ClimateBERT | Native three-class with a climate risk/opportunity axis |

A model trained on product reviews reads a central-bank statement badly. Routing
by domain is cheap and materially more accurate.

### Why discard low-confidence evidence

Without the confidence gate, an off-topic article — sports, entertainment —
would have every sentence forced into its nearest PESTLE category, yielding a
confident, meaningless severity score. Discarding weak evidence is what prevents
false alarms. It costs recall and buys precision, which is the correct trade for
a tool whose output triggers expensive human review.

### Why renormalise weights over active drivers only

If severity were weighted across all six drivers, an article touching only two
would be divided by six — structurally capping its severity regardless of how
serious it is. Focused news could never reach *Revise*. Renormalising over the
drivers that actually have evidence prevents this artificial dilution.

### Why the LLM cannot choose the action

Determinism and defensibility. If a language model picked the verdict, the same
article could yield different recommendations on different runs, and the result
could not be traced to a calculation. The maths owns classification; the model
only writes prose explaining a decision already made.

---

## Evaluation

As reported:

| Method | Detail |
| --- | --- |
| **Synthetic scenarios** | 10 Digital Industry news articles with known expected verdicts |
| **Roadmap fixture** | 1 sample roadmap for testing item matching |
| **Automated tests** | 104 — 54 backend, 50 frontend |
| **Expert review** | 1 manual review by a roadmap domain expert |

**Result:** all ten scenarios produce their expected status label. A
representative *Adjust* case linked Technological and Legal drivers to four
roadmap items. The expert review supported the workflow's value for review
preparation.

!!! warning "Reproducing the ten-out-of-ten result"
    That result holds at the calibrated extraction setting of **7** key points.
    Running at a different count changes borderline scenarios. Verify with:

    ```bash
    python tools/e2e_check.py
    ```

    See [Troubleshooting](../guide/troubleshooting.md#the-verdicts-are-wrong).

### About the test articles

The ten scenarios in `testdata/` are **synthetic** — facts, figures and quotes
are fabricated. They are loosely modelled on factors from the Thai 2024 review
of the Digital Industry roadmap (2022–2030): the generative-AI surge, the
US–China chip war, EU/India trade restrictions, Thai PDPA enforcement,
data-centre energy load, ASEAN/CLMV digital expansion, and AI workforce
displacement.

Do not cite them as real reporting.

---

## Source material in this repository

| Path | What it is |
| --- | --- |
| `references/Data-Driven_Roadmapping_DDRM_Approach_and_Case_Demonstration.pdf` | The DDRM approach paper |
| `references/review2567_อุตสาหกรรมดิจิทัล.pdf` | Thai 2024 Digital Industry review |
| `references/ISPIM_Bangkok/` | Conference paper drafts on drivers and trends impact assessment |
| `references/How does impact calculation work.docx` | Working notes on the scoring chain |
| `final_reports/` | Submitted report PDF and Thai/English abstracts |
| `document/` | Report chapters and screenshots |

---

## Known limitations

Be honest about these; they are the natural next research steps.

1. **English only.** The extraction stack handles multiple languages, but the
   sentiment and classification models are English-trained.
2. **Synthetic evaluation.** Ten fabricated articles, not a real news corpus.
3. **Single expert review.** One reviewer is a signal, not a validation.
4. **Uniform tolerance bands.** All six drivers use the same thresholds; the
   structure supports per-driver bands but they were never differentiated.
5. **Item matching is tag overlap only.** No semantic matching between evidence
   and item text — an item must be correctly tagged to ever match.
6. **No temporal reasoning.** A change due in 2030 is weighted the same as one
   arriving next quarter.
7. **Single-article assessments.** No accumulation of evidence across many
   articles over time, which is arguably what real monitoring needs.

---

## Where to take it next

- Replace tag-overlap matching with semantic similarity between evidence and
  roadmap item text.
- Accumulate evidence over a rolling window instead of judging one article at a
  time.
- Weight impact by how close the affected item is in time.
- Evaluate against a real annotated news corpus.
- Add Thai-language support end to end.
