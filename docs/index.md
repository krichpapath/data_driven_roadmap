# Start here

This handbook describes the current application and how to develop it.
Start with the codebase tour for structure, or the setup pages to run it locally.
Completed university work is preserved under `archive/university/`; see
`archive/README.md` in the repository for its contents and tracking status.

Read this page, then go to [Set up a new computer](getting-started/prerequisites.md)
if the machine is bare, or straight to
[Install everything](getting-started/installation.md) if you already have
Python and Git.

---

## What is this thing, in one paragraph?

Organisations write **technology roadmaps** — multi-year plans that say things
like "build a national data centre by 2027, adopt AI in manufacturing by 2029".
Then the world changes. A new law passes, a trade war starts, a technology
arrives early. The roadmap is now partly wrong, but nobody notices until the
next scheduled review, which might be a year away.

**This project reads the news and tells you whether your roadmap still holds.**

You give it a news article. It gives you back one of three verdicts:

| Verdict | What it means |
| --- | --- |
| **Maintain** | Nothing important changed. Keep monitoring. |
| **Adjust** | Something real happened. Review the affected roadmap items. |
| **Revise** | Big change. This roadmap needs a formal rewrite. |

It also shows *why* — which sentences it used as evidence, which categories they
fell into, and which of your roadmap items are affected.

!!! note "It is decision support, not a decision maker"
    The system never decides anything on its own. It prepares evidence so a human
    roadmap owner can make a faster, better-informed call. Keep that framing —
    it is the core claim of the research behind the project.

---

## What it looks like in practice

```
      You paste a news article
                 │
                 ▼
   ┌─────────────────────────────┐
   │  1  Get the text            │   scrape a URL, or take pasted text
   │  2  Pick key sentences      │   ~7 most meaningful sentences
   │  3  Sort into PESTLE boxes  │   Political / Economic / Social /
   │                             │   Technological / Legal / Environmental
   │  4  Good news or bad news?  │   sentiment, per category
   │  5  Do the maths            │   → a severity score, 0.0 to 1.0
   │  6  Match your roadmap      │   which items does this hit?
   │  7  Write advice            │   what to do about each one
   └─────────────────────────────┘
                 │
                 ▼
    Maintain  /  Adjust  /  Revise
```

The stages live in `src/core/` and are connected by `src/ui/app.py` — see
[How it works](guide/how-it-works.md).

---

## The two things you actually run

This project is **two programs at once**. You need both running in two separate
terminals:

1. **The backend** — a Python API that does all the thinking.
   `python src/api/roadmap_api.py` on port `7875`.
2. **The frontend** — a web page where you draw your roadmap and see results.
   A plain static file server on port `8000`.

That is it. There is no database, no Docker, no build step, no bundler.

---

## Where to go next

<div class="grid cards" markdown>

-   **Starting from a bare machine?**

    [0. Set up a new computer](getting-started/prerequisites.md) installs
    Python, Git, and an editor from scratch.

-   **Just want it running?**

    Go to [1. Install everything](getting-started/installation.md), then
    [2. Run the app](getting-started/first-run.md).

-   **Want to understand it first?**

    Read [The problem it solves](guide/the-problem.md) and
    [How it works](guide/how-it-works.md).

-   **Need to change some code?**

    Read [Tour of the codebase](guide/codebase-tour.md) and
    [Common tasks](guide/common-tasks.md).

-   **Something is broken?**

    Go straight to [Troubleshooting](guide/troubleshooting.md).

-   **Need to understand the scoring?**

    Read [The scoring maths](guide/scoring.md). Historical research and
    evaluation notes are preserved under `archive/university/`.

-   **Want the deep technical detail?**

    The Reference section has the original developer deep-dives:
    [Architecture](ARCHITECTURE.md), [Pipeline](PIPELINE.md),
    [Frontend](FRONTEND.md), [Testing](TESTING.md).

</div>

---

## Current baseline and limits

| | |
| --- | --- |
| **Language** | Python 3.14.8 verified backend, React (no build step) frontend |
| **Unit tests** | 54 backend + 50 frontend passed on 2026-10-15; models and browser interactions are outside their coverage |
| **Local startup** | API health and static UI serving verified on 2026-10-15 |
| **Model evaluation** | Ten labelled scenarios are available; not rerun during the archive cleanup |
| **Storage** | Browser `localStorage`; export roadmaps for backup |
| **Offline use** | Text assessment requires cached models and rule-based advice. URL extraction and OpenRouter need network access. The browser loads CDN scripts — see [Troubleshooting](guide/troubleshooting.md#the-web-page-needs-an-internet-connection). |

"DDRM" appears everywhere in the code. It stands for **Data-Driven
Roadmapping**, the research approach this project builds on. Historical
research claims and evaluation results remain in the archive; rerun the
relevant checks before treating them as evidence for a new version.
