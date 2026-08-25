# The problem it solves

If you only read one conceptual page, read this one. Everything in the codebase
exists to serve the problem described here.

---

## Technology roadmaps go stale

A **technology roadmap** is a planning document. It lays out, on a timeline,
what an organisation intends to build, research, and deploy — often across five
or ten years. Governments use them for national industry planning; companies use
them for product strategy.

They typically look like a grid:

```text
                 2024–2026        2027–2030        Beyond 2030
              ┌───────────────┬───────────────┬───────────────┐
Business      │  Digital      │  Regional     │  Global       │
Drivers       │  adoption     │  expansion    │  integration  │
              ├───────────────┼───────────────┼───────────────┤
Products      │  Data         │  AI-enabled   │  Autonomous   │
              │  platform     │  services     │  operations   │
              ├───────────────┼───────────────┼───────────────┤
R&D           │  ML pilots    │  Applied AI   │  Frontier     │
              └───────────────┴───────────────┴───────────────┘
```

The problem is right there in the picture: **the roadmap is a static document
describing a moving world.**

A roadmap written in 2024 assumed certain things about trade policy, data
protection law, energy costs, and how fast AI would arrive. When those
assumptions break, the roadmap silently becomes wrong.

---

## Why the review cycle does not save you

Organisations review roadmaps on a schedule — often annually. That creates a gap:

```text
   Roadmap written                        Scheduled review
        │                                        │
        ▼                                        ▼
   ─────┬────────────────────────────────────────┬─────►  time
        │         ▲                              │
        │         │                              │
        │    A new law passes. The roadmap is    │
        │    now partly invalid — but nobody     │
        │    will formally notice for 8 months.  │
        └────────────────────────────────────────┘
                    ↑ this gap is the problem
```

The research phrase for this is that roadmaps *"lose value when external
conditions change faster than scheduled review cycles."*

---

## The obvious fix, and why it does not work

The obvious answer is: *have a human read the news and flag anything relevant.*

In practice this fails because:

- **Volume.** Far too much is published to read it all.
- **Inconsistency.** Two analysts reading the same article reach different
  conclusions, and neither can fully explain why.
- **No audit trail.** "I think this matters" is not something you can defend in
  a planning meeting or reproduce six months later.

So the need is not just *detection*. It is **traceable, repeatable detection**.

---

## What this project actually contributes

There is existing academic work — **Data-Driven Roadmapping (DDRM)** — that says
roadmap status *should* be monitored using data. What it does not give you is
the operational detail: how, concretely, do you turn a messy paragraph of news
prose into a defensible status recommendation?

That gap is what this project fills. It defines a **workflow**:

```text
  unstructured text  →  key sentences  →  PESTLE categories
        →  sentiment direction  →  impact score  →  roadmap matching
              →  one of three status labels
```

And crucially, **every step keeps its receipts.** The final severity number can
be traced back to the specific sentences that produced it, with the confidence
of each judgement along the way.

---

## The three labels

The output is deliberately small. Not a percentage, not a ranking — three
actions a roadmap owner can actually take.

| Label | Meaning | What a human does next |
| --- | --- | --- |
| **Maintain** | Impact is low | Keep monitoring. No meeting needed. |
| **Adjust** | Impact is material | Focused review of the affected items. |
| **Revise** | Impact is high | Start a formal roadmap revision. |

---

## The boundary: it does not decide

This is the most important design constraint in the project, and it is easy to
accidentally violate when adding features.

!!! danger "The system prepares evidence. Humans decide."
    The tool never approves, rejects, or rewrites a roadmap. It assembles
    evidence and proposes a review action so a human expert can make a faster,
    better-informed decision. The research states plainly that *final roadmap
    judgment remains with experts.*

Two concrete places this shows up in the code:

1. **The language model cannot pick the action.** Even when LLM advice is
   enabled, the action label comes from the severity maths. The model only
   writes the explanation. See `src/core/guidance.py`.
2. **Off-domain evidence is discarded, not forced.** If a sentence does not
   clearly belong to a PESTLE category, it is labelled `Unclassified` and
   dropped rather than being pushed into the nearest box. See
   `src/core/pestle.py`.

If you add a feature that quietly makes the system more decisive, you have
broken the project's central claim.

---

## How it was evaluated

For your report, the evaluation was:

- **10 synthetic Digital Industry scenarios** with known expected verdicts.
  All ten produce the expected label.
- **1 roadmap fixture** for testing item matching.
- **104 automated tests** — 54 backend, 50 frontend.
- **1 manual expert review** by a roadmap domain expert, which supported the
  workflow's usefulness for review preparation.

Details in [Research background](../research/background.md).

---

Next: [How it works](how-it-works.md) — the seven stages, in plain language.
