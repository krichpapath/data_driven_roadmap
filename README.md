# Roadmapping

Research workspace for the **Drivers & Trends Impact Assessment** (DDRM)
prototype, presented at ISPIM Connects Bangkok 2026.

The active code lives in [`prototype/`](./prototype). See
[`prototype/README.md`](./prototype/README.md) for setup, usage, and the
pipeline architecture.

## Repository layout

```
.
├── prototype/        Operational DDRM pipeline (code, assets, requirements)
└── README.md         You are here
```

The local working tree also contains `docs/`, `references/`, `archive/`, and
`logs/` folders. These are intentionally not tracked by git (see
`.gitignore`) because they hold internal university reports, third-party
research papers, and runtime output that shouldn't be published.

## Quick start

```powershell
cd prototype
python -m venv venv
.\venv\Scripts\activate         # Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
python src\ui\app.py
```

Then open the URL Gradio prints in the terminal.

## Citation

Lertprasertphakorn, K. & Chalarak, N. (2026). *Drivers & Trends Impact
Assessment for Technology Roadmap Updating.* ISPIM Connects Bangkok.

## Copyright

Copyright (c) 2026. All rights reserved. Research prototype, Thammasat
University. No license is granted for reuse, modification, or
redistribution at this time.
