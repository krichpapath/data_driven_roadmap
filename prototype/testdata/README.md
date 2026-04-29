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

| File | Driver mix | Expected verdict |
|------|-----------|------------------|
| `news_01_us_china_chip_war.txt` | Political (heavy), Legal, Technological, Economic | Adjust |
| `news_02_genai_asean_surge.txt` | Economic (heavy), Technological, Social | Adjust |
| `news_03_data_center_pdpa.txt`  | Environmental (heavy), Legal, Political | Adjust |
| `news_04_routine_industry_briefing_maintain.txt` | Economic, Technological, Legal | Maintain |
| `news_05_thai_genai_pilot_program_maintain.txt` | Technological, Environmental | Maintain |
| `news_06_multi_crisis_digital_collapse_revise.txt` | Legal, Economic, Technological, Political | Revise |
| `news_07_sweeping_thai_digital_mandate_revise.txt` | Technological, Legal, Economic | Revise |
| `news_08_routine_clmv_data_workshop_maintain.txt` | Technological, Legal, Economic | Maintain |
| `news_09_accelerated_industry_ai_sandbox_adjust.txt` | Technological, Economic, Legal, Social | Adjust |
| `news_10_foreign_ai_investment_data_rules_revise.txt` | Political, Economic, Technological, Legal, Environmental, Social | Revise |

## Roadmap sample

`industrial_digital_roadmap_sample.json` is a small exported-roadmap fixture for
testing roadmap matching and guidance. Paste it into the app's optional
"Roadmap JSON" field, then run any news article to see matched roadmap items.

## How to use

1. Open the keypoints lab: `python src/ui/keypoints_lab.py`. Paste a file's
   contents into "Text" mode to inspect picks, relevance, and context.
2. Open the main app: `python src/ui/app.py`. Paste the same text and
   compare per-driver SKD, STRM severity, and verdict.
3. If a verdict drifts (Maintain when Adjust expected, etc.), tune
   `TOLERANCE_BANDS` or `DDRM_THRESHOLDS` in `src/config.py`.
