[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/R0mj41T3)
**<ins>Note</ins>: Students must update this `README.md` file to be an installation manual or a README file for their own CS403 projects.**

**รหัสโครงงาน:** 68-1_22_nrc-r1

**ชื่อโครงงาน (ไทย):** โครงการศึกษาและพัฒนากลไกการประเมินผลกระทบจากปัจจัยและแนวโน้มสำหรับการติดตามสถานะแผนที่นำทางการวิจัยและพัฒนาเทคโนโลยี

**Project Title (Eng):** DRIVERS AND TRENDS IMPACT ASSESSMENT MECHANISM FOR DYNAMIC TECHNOLOGY ROADMAP STATUS MONITORING

**อาจารย์ที่ปรึกษาโครงงาน:** อ.ดร. นวฤกษ์ ชลารักษ์

**ผู้จัดทำโครงงาน:**
1. นายกฤชประพัตธ์ เลิศประเสริฐภากร  `6509681083`  `krichpapath.ler@dome.tu.ac.th`

Manual / Instructions for your projects starts here !

# Drivers and Trends Impact Assessment Mechanism for Dynamic Technology Roadmap Status Monitoring

This repository contains the final CS403 project submission for project `68-1_22_nrc-r1`.

The project is a Python-based prototype for monitoring the status of a technology roadmap. It accepts news text or a news URL, extracts key evidence, classifies the evidence by PESTLE category, estimates impact direction and severity, matches the result to roadmap items, and recommends one of three roadmap review statuses: `Maintain`, `Adjust`, or `Revise`.

The system includes:

- a FastAPI backend for roadmap impact assessment,
- a browser-based roadmap builder interface,
- deterministic fallback guidance when no LLM API key is configured,
- optional LLM-powered expert guidance through OpenRouter,
- automated Python and frontend tests.

## Directory Tree

```text
.
|-- README.md
|-- demo/
|   `-- 68-1_CS403_68-1_22_nrc-r1_demo_link.txt
|-- final_reports/
|   |-- 68-1_CS403_68-1_22_nrc-r1.pdf
|   |-- 68-1_CS403_68-1_22_nrc-r1_abstract_en.txt
|   `-- 68-1_CS403_68-1_22_nrc-r1_abstract_th.txt
|-- docs/
|   |-- ARCHITECTURE.md
|   |-- CONTRIBUTING.md
|   |-- FRONTEND.md
|   |-- PIPELINE.md
|   `-- TESTING.md
|-- roadmap_builder/
|   |-- index.html
|   |-- app.jsx
|   |-- data.jsx
|   |-- impact-advisor.jsx
|   |-- modals.jsx
|   |-- roadmap-grid.jsx
|   |-- start-screen.jsx
|   |-- styles.css
|   |-- tweaks-panel.jsx
|   |-- primitives.jsx
|   |-- coach-rail.jsx
|   |-- lib/
|   |   `-- exports.js
|   |-- __tests__/
|   |   |-- exports.test.js
|   |   `-- reducers.test.js
|   |-- package.json
|   `-- package-lock.json
|-- src/
|   |-- __init__.py
|   |-- config.py
|   |-- api/
|   |   `-- roadmap_api.py
|   |-- core/
|   |   |-- __init__.py
|   |   |-- extractor.py
|   |   |-- guidance.py
|   |   |-- impact.py
|   |   |-- keypoints.py
|   |   |-- pestle.py
|   |   |-- roadmap_matcher.py
|   |   |-- router.py
|   |   `-- sentiment.py
|   `-- ui/
|       |-- __init__.py
|       |-- app.py
|       `-- keypoints_lab.py
|-- testdata/
|   |-- README.md
|   |-- industrial_digital_roadmap_sample.json
|   `-- sample news scenario files
|-- tests/
|   |-- conftest.py
|   |-- test_guidance.py
|   |-- test_impact.py
|   |-- test_keypoints.py
|   `-- test_roadmap_matcher.py
|-- tools/
|   `-- diagnose_impact.py
|-- requirements.txt
|-- requirements-dev.txt
|-- CHANGELOG.md
|-- IMPACT_VALUES_GUIDE.md
`-- LICENSE
```

## Required Software

Install the following software before running the project.

| Software | Purpose | Recommended version |
| --- | --- | --- |
| Git | Clone the repository | Latest stable version |
| Python | Run the backend and impact assessment pipeline | Python 3.10 or later |
| pip | Install Python packages | Included with Python |
| Web browser | Open the roadmap builder UI | Chrome, Edge, Firefox, or Safari |
| Node.js and npm | Run frontend tests only | Node.js 18 or later |

Node.js is not required for normal application use. It is only required for running the frontend test suite in `roadmap_builder/`.

## Installation and Setup

Follow these steps from a new machine or clean folder.

### 1. Clone the repository

```bash
git clone https://github.com/ComSciThammasatU/2568-2-cs403-final-submission-68-1_22_nrc-r1.git
cd 2568-2-cs403-final-submission-68-1_22_nrc-r1
```

### 2. Create a Python virtual environment

On Windows:

```bash
python -m venv venv
venv\Scripts\activate
```

On macOS or Linux:

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

For development and Python testing, also install:

```bash
pip install -r requirements-dev.txt
```

### 4. Configure optional LLM guidance

The application can run without an API key. If no API key is configured, it uses deterministic fallback guidance.

To enable LLM-powered expert guidance, create a file named `.env` in the repository root:

```text
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Do not commit `.env` to GitHub.

## Running the Application

The application uses two local processes:

1. a FastAPI backend on port `7875`,
2. a static web server for the browser UI on port `8000`.

### 1. Start the backend API

Open a terminal at the repository root and run:

```bash
python src/api/roadmap_api.py
```

The backend will start at:

```text
http://127.0.0.1:7875
```

Check the backend by opening this URL in a browser:

```text
http://127.0.0.1:7875/api/health
```

Expected response:

```json
{"status":"ok"}
```

### 2. Start the roadmap builder UI

Open a second terminal at the repository root and run:

```bash
cd roadmap_builder
python -m http.server 8000
```

Open the application in a web browser:

```text
http://127.0.0.1:8000
```

## How to Use the Application

1. Open `http://127.0.0.1:8000` in a browser.
2. Select or load a roadmap template.
3. Review or edit roadmap items in the roadmap builder.
4. Open the news impact assessment panel.
5. Enter either a news article URL or pasted news text.
6. Choose the number of key points to extract.
7. Run the impact assessment.
8. Review the output:
   - extracted evidence,
   - PESTLE categories,
   - sentiment direction,
   - impact score,
   - matched roadmap items,
   - recommended status: `Maintain`, `Adjust`, or `Revise`,
   - review guidance for affected roadmap items.
9. Use the recommendation as decision support for roadmap review preparation.

The final roadmap decision should remain with the roadmap owner or domain expert.

## Running Tests

### Python tests

From the repository root:

```bash
pytest
```

### Frontend tests

Node.js is required for these tests.

```bash
cd roadmap_builder
npm install
npm test
```

The test suites cover impact scoring logic, roadmap matching, guidance logic, frontend state reducers, and import/export helpers.

## Important Files and Folders

| Path | Description |
| --- | --- |
| `README.md` | Installation, setup, usage, and repository structure |
| `final_reports/` | Final signed report PDF and Thai/English abstract files |
| `demo/` | Public demonstration video link |
| `src/api/roadmap_api.py` | FastAPI backend entry point |
| `src/core/` | Core impact assessment pipeline |
| `src/ui/app.py` | Pipeline orchestration and Gradio development UI |
| `roadmap_builder/` | Browser-based roadmap builder interface |
| `testdata/` | Sample roadmap and news scenarios |
| `tests/` | Python unit tests |
| `docs/` | Developer documentation |

## Final Submission Files

The final report files must be placed in `final_reports/` with these exact names:

```text
final_reports/68-1_CS403_68-1_22_nrc-r1.pdf
final_reports/68-1_CS403_68-1_22_nrc-r1_abstract_th.txt
final_reports/68-1_CS403_68-1_22_nrc-r1_abstract_en.txt
```

The demonstration video link must be stored in:

```text
demo/68-1_CS403_68-1_22_nrc-r1_demo_link.txt
```

The demonstration video file or hosted video should be named:

```text
68-1_CS403_68-1_22_nrc-r1_demo.mp4
```

The video must be publicly accessible or set to allow anyone with the link to view it.

## Additional Documentation

More technical details are available in `docs/`:

- `docs/ARCHITECTURE.md` explains the system architecture.
- `docs/PIPELINE.md` explains the impact assessment workflow.
- `docs/FRONTEND.md` explains the browser UI.
- `docs/TESTING.md` explains the test strategy.
- `docs/CONTRIBUTING.md` explains the development workflow.

## License

This project is a CS403 research prototype submitted to the Department of Computer Science, Thammasat University.
