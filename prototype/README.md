# Drivers & Trends Impact Assessment (DDRM Pipeline)

A data-driven roadmapping tool that analyzes external trends and documents to produce governance-ready roadmap status recommendations.

## Overview

This project implements an operational **Data-Driven Roadmapping (DDRM)** workflow that:

1. Extracts content from URLs or raw text
2. Identifies key points using TF-IDF relevance scoring
3. Classifies each point into **PESTLE** domains (Political, Economic, Social, Technological, Legal, Environmental)
4. Routes to domain-specific sentiment models
5. Computes multi-criteria impact scores
6. Outputs a **Maintain / Adjust / Revise** recommendation with traceable evidence

## Project Structure

```
prototype/
├── src/
│   ├── __init__.py
│   ├── config.py              # Central configuration (models, weights, thresholds)
│   ├── core/                  # Pipeline modules
│   │   ├── __init__.py
│   │   ├── extractor.py       # Web scraping & text extraction
│   │   ├── keypoints.py       # TF-IDF key-point extraction
│   │   ├── pestle.py          # Zero-shot PESTLE classification
│   │   ├── router.py          # Model routing by PESTLE domain
│   │   ├── sentiment.py       # Domain-specific sentiment analysis
│   │   └── impact.py          # DDRM impact scoring & aggregation
│   ├── models/                # Reserved for fine-tuned models
│   └── ui/
│       ├── __init__.py
│       └── app.py             # Gradio web interface
├── assets/                    # Static assets & resources
├── infographic.html           # Research poster visualization
├── roadmap_builder.html       # Roadmap builder UI
├── requirements.txt           # Python dependencies
└── README.md                  # This file
```

## Installation

```bash
# Create virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate  # Windows
# or: source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt
```

## Usage

### Run the Web UI

```bash
python src/ui/app.py
```

Then open the URL shown in your terminal (typically `http://127.0.0.1:7860`).

### Programmatic Usage

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from ui.app import run_pipeline

# Analyze a URL
result = run_pipeline(
    input_text="https://example.com/news/article",
    input_mode="URL",
    max_points=5
)

print(f"Verdict: {result['verdict']}")
print(f"Severity: {result['severity']}")
```

## Pipeline Steps

| Step | Module | Description |
|------|--------|-------------|
| 1 | `extractor.py` | Fetch and clean article text from URL or raw input |
| 2 | `keypoints.py` | Extract top-N key sentences using TF-IDF scoring |
| 3 | `pestle.py` | Classify each sentence into PESTLE domains (zero-shot NLI) |
| 4 | `router.py` + `sentiment.py` | Route to domain-specific sentiment model |
| 5 | `impact.py` | Compute weighted impact scores and aggregate |
| 6 | `impact.py` | Map severity to Maintain/Adjust/Revise verdict |

## Configuration

Edit `src/config.py` to customize:

- **PESTLE_MODEL**: Zero-shot classifier for domain classification
- **PESTLE_MODELS**: Domain-specific sentiment models
- **PESTLE_WEIGHTS**: Base weights for each driver
- **TOLERANCE_BANDS**: Thresholds for minor/moderate/major impact
- **DDRM_THRESHOLDS**: Cut-offs for Maintain/Adjust/Revise

## Impact Scoring Formula

The scoring follows a two-layer MCDA approach:

1. **Magnitude**: `M_ij = |sentiment| × confidence × relevance`
2. **Discretization**: Map magnitude to 0/1/2 (minor/moderate/major)
3. **Within-driver aggregation**: `SKD_i = Σ(x_ij × w_ij)`
4. **Cross-driver aggregation**: `STRM = Σ(SKD_i × w_i*)`
5. **Verdict**: Compare `STRM/2` against thresholds

## Research Context

This work was presented at **ISPIM Connects Bangkok 2026**:

> Lertprasertphakorn, K. & Chalarak, N. (2026). Drivers & Trends Impact Assessment for Technology Roadmap Updating.

Key contributions:
- Operational DDRM workflow with traceable evidence
- PESTLE as governance structure (not just classification)
- Transparent tolerance logic with configurable parameters
- Human-in-the-loop design for expert validation

## License

Research prototype - Thammasat University
