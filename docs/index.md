# Start here

Welcome. You have just inherited this project. This handbook is written for a
student who has never seen the codebase before, so nothing is assumed except
that you can open a terminal and you know a little Python.

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

Every one of those seven steps is a separate Python file in `src/core/`. That is
the single most useful fact about this codebase — see
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

-   **Writing the report / need the theory?**

    Read [Research background](research/background.md).

-   **Want the deep technical detail?**

    The Reference section has the original developer deep-dives:
    [Architecture](ARCHITECTURE.md), [Pipeline](PIPELINE.md),
    [Frontend](FRONTEND.md), [Testing](TESTING.md).

</div>

---

## Project facts you will be asked about

| | |
| --- | --- |
| **Project code** | `68-1_22_nrc-r1` |
| **Title (EN)** | Drivers and Trends Impact Assessment Mechanism for Dynamic Technology Roadmap Status Monitoring |
| **Course** | CS403, Department of Computer Science, Thammasat University |
| **Advisor** | อ.ดร. นวฤกษ์ ชลารักษ์ |
| **Language** | Python 3.10+ backend, React (no build step) frontend |
| **Tests** | 54 backend + 50 frontend = 104 automated, plus a 10-scenario end-to-end check |
| **Runs offline?** | The pipeline does. The web page currently needs internet — see [Troubleshooting](guide/troubleshooting.md#the-web-page-needs-an-internet-connection). |

"DDRM" appears everywhere in the code. It stands for **Data-Driven
Roadmapping**, the research approach this project builds on. See
[Research background](research/background.md).
