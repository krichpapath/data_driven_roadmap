[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/R0mj41T3)

**รหัสโครงงาน:** 68-1_22_nrc-r1

**ชื่อโครงงาน (ไทย):** โครงการศึกษาและพัฒนากลไกการประเมินผลกระทบจากปัจจัยและแนวโน้มสำหรับการติดตามสถานะแผนที่นำทางการวิจัยและพัฒนาเทคโนโลยี

**Project Title (Eng):** DRIVERS AND TRENDS IMPACT ASSESSMENT MECHANISM FOR DYNAMIC TECHNOLOGY ROADMAP STATUS MONITORING

**อาจารย์ที่ปรึกษาโครงงาน:** อ.ดร. นวฤกษ์ ชลารักษ์

**ผู้จัดทำโครงงาน:**
1. นายกฤชประพัตธ์ เลิศประเสริฐภากร  `6509681083`  `krichpapath.ler@dome.tu.ac.th`

---

# Roadmap Review Application

Paste a news article, get back whether your technology roadmap still holds:
**Maintain**, **Adjust**, or **Revise** — with the evidence behind the verdict.

The pipeline extracts key sentences, sorts them into PESTLE categories, scores
sentiment per category, computes a severity from 0.00 to 1.00, matches affected
roadmap items, and suggests a review action. Final judgment stays with the
roadmap owner.

> 📖 **New here? Read the [Developer Handbook](docs/index.md)** — it covers
> everything below in depth, plus how the code actually works.

---

## Requirements

| Software | Version | Needed for |
| --- | --- | --- |
| Python | 3.10+ | Everything |
| Git | any | Cloning |
| Web browser | any modern | The UI |
| Node.js | 18+ | Frontend tests only (optional) |

Disk: ~2 GB of Python packages, plus ~2.5 GB of AI models downloaded on first run.

---

## Install

```bash
git clone https://github.com/ComSciThammasatU/2568-2-cs403-final-submission-68-1_22_nrc-r1.git
```

```bash
cd 2568-2-cs403-final-submission-68-1_22_nrc-r1
```

Create and activate a virtual environment.

**Windows**

```bash
python -m venv venv && venv\Scripts\activate
```

**macOS / Linux**

```bash
python3 -m venv venv && source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Optional — tests, docs, and the Gradio dev UI:

```bash
pip install -r requirements-dev.txt
```

Optional — LLM-written advice. Without a key the app falls back to fixed
rule-based advice. Create `.env` in the project root:

```text
OPENROUTER_API_KEY=your_key_here
```

Never commit `.env`; it is already in `.gitignore`.

---

## Run

Two terminals, both with the venv activated.

**Terminal 1 — backend API** (port 7875)

```bash
python src/api/roadmap_api.py
```

**Terminal 2 — web UI** (port 8000)

```bash
cd roadmap_builder && python -m http.server 8000
```

Open <http://127.0.0.1:8000>.

Health check: <http://127.0.0.1:7875/api/health> returns `{"status":"ok"}`.

> ⏱️ The **first** assessment takes several minutes while models download.
> Later runs take 45–60 seconds.

### Using it

1. **New roadmap** → pick the **Industrial Digital** template.
2. Open the **Assess news** panel.
3. Paste article text, or switch to **News URL**.
4. Leave **Evidence points** at **7** — the scoring thresholds are calibrated
   at that value, and changing it shifts verdicts.
5. Click **Run**. Read the verdict, evidence, matched items, and advice.

Test articles with known answers live in `testdata/`; the filename states the
expected verdict, e.g. `adjust_01_chip_export_controls.txt`.

---

## Tests

```bash
pytest
```

```bash
cd roadmap_builder && npm test
```

End-to-end — replays all 10 `testdata/` scenarios through the live API and
checks every verdict. Needs the backend running:

```bash
python tools/e2e_check.py
```

| Suite | Count | Runtime |
| --- | --- | --- |
| Backend (pytest) | 54 | < 1 s |
| Frontend (Vitest) | 50 | < 1 s |
| End-to-end scenarios | 10 | ~8 min |

---

## Documentation

The **Developer Handbook** in `docs/` is the full guide. Read it as a website:

```bash
pip install -r requirements-dev.txt
```

```bash
mkdocs serve -a 127.0.0.1:8001
```

Open <http://127.0.0.1:8001>.

> ⚠️ Use port **8001** — port 8000 is taken by the roadmap builder.

Build a static copy into `site/`:

```bash
mkdocs build
```

Everything is plain Markdown, so it also reads fine on GitHub without
installing anything. Start at [`docs/index.md`](docs/index.md).

| Page | Covers |
| --- | --- |
| [Start here](docs/index.md) | What this is, where to go next |
| [Set up a new computer](docs/getting-started/prerequisites.md) | Bare machine → Python, Git, editor |
| [Install](docs/getting-started/installation.md) | Full installation walkthrough |
| [Run the app](docs/getting-started/first-run.md) | Both servers, explained |
| [First assessment](docs/getting-started/first-assessment.md) | Reading the results |
| [The problem it solves](docs/guide/the-problem.md) | Why roadmaps go stale |
| [How it works](docs/guide/how-it-works.md) | The seven pipeline stages |
| [The scoring maths](docs/guide/scoring.md) | Severity, with a worked example |
| [Codebase tour](docs/guide/codebase-tour.md) | What each file does |
| [Common tasks](docs/guide/common-tasks.md) | Recipes for likely changes |
| [Troubleshooting](docs/guide/troubleshooting.md) | Real failures, real causes |
| [Research background](docs/research/background.md) | DDRM, PESTLE, evaluation |

Deep dives: [Architecture](docs/ARCHITECTURE.md) · [Pipeline](docs/PIPELINE.md)
· [Frontend](docs/FRONTEND.md) · [Testing](docs/TESTING.md) ·
[Contributing](docs/CONTRIBUTING.md)

---

## Project layout

```text
src/config.py      every tunable number — thresholds, weights, model names
src/core/          the 7 pipeline stages, one file each
src/api/           FastAPI backend (2 endpoints)
src/ui/app.py      run_pipeline() — orchestrates the stages
roadmap_builder/   browser UI (React, no build step)
tests/             pytest suites
tools/             diagnostics + end-to-end check
testdata/          10 labelled news scenarios + roadmap fixture
docs/              developer handbook
final_reports/     submitted report and abstracts
```

`document/`, `references/`, and `archive/` hold report material, research
papers, and old snapshots. They are excluded from git by design.

---

## Command reference

| Command | Does |
| --- | --- |
| `python src/api/roadmap_api.py` | Start the backend |
| `cd roadmap_builder && python -m http.server 8000` | Start the UI |
| `mkdocs serve -a 127.0.0.1:8001` | Read the handbook |
| `mkdocs build` | Build the docs site into `site/` |
| `pytest` | Backend tests |
| `cd roadmap_builder && npm test` | Frontend tests |
| `python tools/e2e_check.py` | Verify all 10 scenarios |
| `python tools/diagnose_impact.py <file.txt>` | Dump the full scoring chain |

---

## Key settings

All in `src/config.py`. Re-run `python tools/e2e_check.py` after changing any of
them — they were calibrated together.

| Setting | Value | Meaning |
| --- | --- | --- |
| `KEYPOINTS_MAX` | 7 | Sentences extracted per article |
| `DDRM_THRESHOLDS` | 0.35 / 0.65 | Adjust / Revise cutoffs |
| `TOLERANCE_BANDS` | 0.35 / 0.60 | Minor / moderate / major buckets |
| `PESTLE_MIN_CONFIDENCE` | 0.65 | Below this, evidence is discarded |

---

## Final submission files

Report files in `final_reports/`, with these exact names:

```text
final_reports/68-1_CS403_68-1_22_nrc-r1.pdf
final_reports/68-1_CS403_68-1_22_nrc-r1_abstract_th.txt
final_reports/68-1_CS403_68-1_22_nrc-r1_abstract_en.txt
```

Demo video link in:

```text
demo/68-1_CS403_68-1_22_nrc-r1_demo_link.txt
```

Video named `68-1_CS403_68-1_22_nrc-r1_demo.mp4`, publicly accessible or
viewable by anyone with the link.

---

## License

CS403 research prototype, Department of Computer Science, Thammasat University.
See [LICENSE](LICENSE).
