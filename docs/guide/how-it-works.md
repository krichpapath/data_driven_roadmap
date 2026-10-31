# How it works

Seven stages, each one its own Python file in `src/core/`. If you understand
this page you can find any bug in the backend.

For the exhaustive technical version, see [Backend pipeline](../PIPELINE.md).
This page is the plain-language tour.

---

## The whole thing at a glance

```text
   news URL or pasted text
             │
   ┌─────────▼──────────┐
   │ 1. extractor.py    │  get clean article text out of a web page
   └─────────┬──────────┘
   ┌─────────▼──────────┐
   │ 2. keypoints.py    │  pick the ~7 most meaningful sentences
   └─────────┬──────────┘
   ┌─────────▼──────────┐
   │ 3. pestle.py       │  sort each into P/E/S/T/L/En — or bin it
   └─────────┬──────────┘
   ┌─────────▼──────────┐
   │ 4. sentiment.py    │  good news or bad news? (per category)
   └─────────┬──────────┘
   ┌─────────▼──────────┐
   │ 5. impact.py       │  the maths → severity 0.0–1.0 → verdict
   └─────────┬──────────┘
   ┌─────────▼──────────┐
   │ 6. roadmap_        │  which of YOUR items does this hit?
   │    matcher.py      │
   └─────────┬──────────┘
   ┌─────────▼──────────┐
   │ 7. guidance.py     │  what should be done about each one
   └─────────┬──────────┘
             ▼
    Maintain / Adjust / Revise + evidence + matches + advice
```

The file that runs this chain in order is
**`src/ui/app.py` → `run_pipeline()`**. Start reading there.

---

## Stage 1 — Get the text

**File:** `src/core/extractor.py`

If you gave it a URL, it has to pull the article out of a web page full of ads,
navigation and cookie banners. It tries four different libraries in order and
takes the first result that is at least 200 characters:

1. `trafilatura` — best general purpose, handles many languages
2. `readability-lxml` — the Firefox "reader mode" algorithm
3. `BeautifulSoup` — crude fallback, just grabs `<p>` tags

If all three fail, it takes the longest partial result. If everything is empty,
it raises an error.

If you pasted text instead of a URL, this stage does nothing at all.

??? question "Why four libraries instead of one?"
    Web scraping is genuinely unreliable. Every extractor fails on some sites.
    Chaining four cheap attempts is far more robust than perfecting one. This is
    a pragmatic choice, not over-engineering.

---

## Stage 2 — Pick the important sentences

**File:** `src/core/keypoints.py`

A news article has 30–60 sentences. Most are filler. This stage picks the
**7 most useful** ones. (Seven is `KEYPOINTS_MAX` in `src/config.py`.)

How it decides:

1. **Split into sentences**, being careful about `Mr.`, `e.g.`, `U.S.` and
   friends. Sentences that are too short or too long get dropped.
2. **Turn every sentence into a vector** using an embedding model, and do the
   same for six sentences describing what each PESTLE category means.
3. **Score each sentence** on: how central it is to the article, how close it is
   to any PESTLE topic, and a small penalty for being unusually long.
4. **Pick the top 7 with a diversity rule** (called MMR) so you do not end up
   with seven sentences that all say the same thing.
5. **Record a relevance score** for each — how close it landed to its nearest
   PESTLE category. This number matters a lot later.

!!! warning "This stage decides the answer more than you would expect"
    Changing how many sentences you extract changes the final verdict. The
    thresholds downstream were tuned assuming 7. See
    [Troubleshooting](troubleshooting.md#the-verdicts-are-wrong).

---

## Stage 3 — Sort into PESTLE boxes

**File:** `src/core/pestle.py`

Each selected sentence gets classified into one of six categories:

| | Category | Roughly means |
| --- | --- | --- |
| **P** | Political | Government policy, regulation, political stability |
| **E** | Economic | Markets, funding, trade, GDP |
| **S** | Social | Demographics, culture, workforce attitudes |
| **T** | Technological | Innovation pace, R&D, infrastructure |
| **L** | Legal | Compliance, IP, data privacy law |
| **En** | Environmental | Sustainability, climate, resource use |

This uses a **zero-shot classifier** — a model that can sort text into
categories it was never specifically trained on.

Two details that matter:

**It uses full sentences as category descriptions, not single words.** Instead
of asking "is this Political?", it asks whether the text entails *"This news
text is primarily about political affairs, government policy…"*. Bare words like
"Political" and "Social" sit too close together in the model's understanding to
separate reliably; the longer descriptions work much better.

**Low-confidence results are thrown away.** If the classifier is less than 65%
sure (`PESTLE_MIN_CONFIDENCE`), the sentence is marked `Unclassified` and
silently dropped from the scoring.

!!! success "Why throwing evidence away is the right call"
    Without this gate, a movie review or football report would have every
    sentence forced into the nearest PESTLE box, producing a confident and
    completely meaningless severity score. Discarding weak evidence is what
    stops off-topic news from generating false alarms.

---

## Stage 4 — Good news or bad news?

**Files:** `src/core/sentiment.py` and `src/core/router.py`

Now: is each sentence positive, negative, or neutral? The clever part is that
**different categories get different models**, because a model trained on
product reviews is bad at reading central-bank statements.

| Category | Model | Why |
| --- | --- | --- |
| Political, Social, Technological, Legal | **SiEBERT** | Strong general accuracy on prose |
| Economic | **FinBERT** | Trained on financial news |
| Environmental | **ClimateBERT** | Understands climate risk vs opportunity |

`router.py` is the tiny file that just picks which model to use. It is 16 lines.

SiEBERT only outputs positive or negative, with no neutral option. So if its
confidence is below a threshold, the answer is converted to neutral. This is how
a neutral class is manufactured from a two-way model.

Results are normalised to: positive = `+1`, neutral = `0`, negative = `-1`.

!!! note "Neutral means zero impact"
    A neutral sentence contributes **nothing** to severity, because the maths in
    the next stage multiplies by this value. This is why an article full of
    factual, non-evaluative reporting scores low.

---

## Stage 5 — The maths

**File:** `src/core/impact.py`

This produces the severity number. It gets its own page:
**[The scoring maths](scoring.md)**.

The short version: each sentence's strength is `sentiment × confidence ×
relevance`, those get bucketed into minor/moderate/major, combined within each
PESTLE category, then combined across categories using weights — giving a
severity from 0.0 to 1.0, which is compared against two thresholds to get the
verdict.

---

## Stage 6 — Match your roadmap

**File:** `src/core/roadmap_matcher.py`

Now connect the news to the user's actual roadmap.

1. Find the **active drivers** — PESTLE categories with real evidence behind
   them.
2. Flatten the roadmap the frontend sent, expanding short tags (`P`, `T`) into
   full names.
3. For each roadmap item, check whether its PESTLE tags **overlap** with the
   active drivers. No overlap means the item is dropped.
4. Score the survivors, mostly on severity of the overlapping drivers plus the
   item's own priority. Return the top 10.

!!! question "Why do I get zero matches?"
    Because matching is purely tag overlap. If the news is Legal and
    Environmental but every roadmap item is tagged Technological, nothing
    matches. This is correct behaviour, not a bug.

---

## Stage 7 — Write the advice

**File:** `src/core/guidance.py` (the biggest file in `core/`, ~710 lines)

Two modes.

**Deterministic mode** — used when there is no API key, no matches, or the LLM
calls failed. Looks the verdict up in a fixed table:

| Verdict | Review type | Action |
| --- | --- | --- |
| Maintain | monitor | monitor |
| Adjust | focused review | rescope |
| Revise | formal revision | revise |

**Expert workshop mode** — used when the verdict is not Maintain, an API key is
set, and there are matches. For each active PESTLE category it asks a language
model to write advice *as an expert in that domain*, running the categories in
parallel.

Two safeguards worth knowing:

- The model must **cite one of the extracted sentences** as its evidence, and
  the API is configured so it literally cannot invent a citation — the allowed
  values are restricted to the real sentence IDs.
- The model **cannot choose the action label**. That always comes from the
  severity maths.

---

## Where the frontend fits

Everything above is backend. The browser UI's job is to let you build a roadmap,
send it as JSON, and display what comes back.

```text
 roadmap_builder/  ──── HTTP POST /api/recommend ────►  src/api/roadmap_api.py
 (React in browser)                                              │
                                                                 ▼
                                                    src/ui/app.py run_pipeline()
                                                                 │
                                                        the 7 stages above
```

See [Frontend deep dive](../FRONTEND.md) for the UI internals.

---

Next: [The scoring maths](scoring.md).
