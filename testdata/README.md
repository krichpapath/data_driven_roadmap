# Test data for the DDRM impact pipeline

Synthetic English news articles for end-to-end testing of the impact-score
system. Each file targets a different PESTLE-driver mix so the pipeline can be
validated against expected verdicts.

The articles are loosely modelled on factors discussed in the Thai 2024 review
of the Digital Industry roadmap (2022-2030): generative AI surge, US-China
chip war, EU/India trade restrictions, Thai PDPA enforcement, data-center
energy load, ASEAN/CLMV digital expansion, AI workforce displacement.

Articles are **synthetic** — facts, figures, and quotes are fabricated.
Do not redistribute as real reporting.

## Files

`baseline.json` contains the ten expected verdicts, four-decimal severity scores
and SHA-256 hashes of the UTF-8 article text with LF line endings. Full run
reports and machine-specific package lists stay outside the fixture.

| File | Driver mix | Expected verdict |
|------|-----------|------------------|
| `maintain_01_routine_industry_briefing.txt` | Economic, Technological, Legal | Maintain |
| `maintain_02_thai_genai_pilot.txt` | Technological, Environmental | Maintain |
| `maintain_03_clmv_data_workshop.txt` | Technological, Legal, Economic | Maintain |
| `adjust_01_chip_export_controls.txt` | Political, Legal, Technological, Economic | Adjust |
| `adjust_02_genai_asean_surge.txt` | Economic, Technological, Social | Adjust |
| `adjust_03_data_center_pdpa.txt` | Environmental, Legal, Political | Adjust |
| `adjust_04_industry_ai_sandbox.txt` | Technological, Economic, Legal, Social | Adjust |
| `revise_01_multi_crisis_pdpa_penalties.txt` | Legal, Economic, Technological, Political | Revise |
| `revise_02_sweeping_digital_mandate.txt` | Technological, Legal, Economic | Revise |
| `revise_03_foreign_ai_investment_rules.txt` | Political, Economic, Technological, Legal, Environmental, Social | Revise |

## Roadmap sample

`industrial_digital_roadmap_sample.json` is a small exported-roadmap fixture for
testing roadmap matching and guidance. Paste it into the app's optional
"Roadmap JSON" field, then run any news article to see matched roadmap items.

## How to use

1. Run `python tools/diagnose_impact.py testdata/<file>.txt` to inspect picks,
   relevance, context, per-driver SKD, STRM severity, and verdict.
2. If a verdict drifts (Maintain when Adjust expected, etc.), tune
   `TOLERANCE_BANDS` or `DDRM_THRESHOLDS` in `src/config.py`.
