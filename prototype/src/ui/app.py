import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # add src/ to path

# app.py — Gradio UI, orchestrates the full pipeline
import json
import gradio as gr
import plotly.graph_objects as go
import pandas as pd

from core.extractor import extract_article, extract_text
from core.keypoints import extract_keypoints
from core.pestle    import classify_pestle
from core.sentiment import classify_sentiment
from core.impact    import aggregate_by_pestle, overall_impact, ddrm_status, point_impact
from config         import KEYPOINTS_MAX, PESTLE_WEIGHTS, DDRM_THRESHOLDS


# ── core pipeline ─────────────────────────────────────────────────────────────

def run_pipeline(input_text: str, input_mode: str, max_points: int) -> dict:
    """
    Run the full pipeline on a URL or raw text.
    Returns a structured result dict (used by both UI and JSON export).
    """
    # 1. Extract
    if input_mode == "URL":
        title, text = extract_article(input_text.strip())
    else:
        title, text = extract_text(input_text)

    # 2. Key points
    keypoints = extract_keypoints(text, max_points=int(max_points))

    # 3–5. PESTLE → route → sentiment for each key point
    evidence = []
    for sentence, relevance in keypoints:
        pestle_result    = classify_pestle(sentence)
        sentiment_result = classify_sentiment(sentence, pestle_result["label"])

        evidence.append({
            # traceability
            "sentence":         sentence,
            "relevance":        relevance,
            # PESTLE
            "pestle":           pestle_result["label"],
            "pestle_conf":      pestle_result["confidence"],
            "pestle_top2":      pestle_result["top2"],
            # sentiment
            "sentiment_label":  sentiment_result["label"],
            "sentiment_score":  sentiment_result["score"],
            "sent_confidence":  sentiment_result["confidence"],
            "model_id":         sentiment_result["model_id"],
            # impact contribution
            "impact_contribution": point_impact(
                sentiment_result["score"],
                sentiment_result["confidence"],
                pestle_result["confidence"],
                relevance,
            ),
        })

    # 6. Impact scoring
    # Reshape for impact.py
    points_for_impact = [
        {
            "pestle":           e["pestle"],
            "sentiment_score":  e["sentiment_score"],
            "sent_confidence":  e["sent_confidence"],
            "relevance":        e["relevance"],
        }
        for e in evidence
    ]

    by_pestle    = aggregate_by_pestle(points_for_impact)
    severity     = overall_impact(points_for_impact)
    verdict, why = ddrm_status(severity)

    return {
        "title":      title,
        "verdict":    verdict,
        "severity":   severity,
        "reason":     why,
        "by_pestle":  {k: v for k, v in by_pestle.items() if v["n"] > 0},
        "evidence":   evidence,
    }


# ── UI renderers ──────────────────────────────────────────────────────────────

VERDICT_EMOJI = {"Maintain": "🟢", "Adjust": "🟡", "Revise": "🔴"}

def _format_summary(result: dict) -> str:
    v = result["verdict"]
    lines = [
        f"## {VERDICT_EMOJI.get(v, '')} {v}",
        f"**Severity:** {result['severity']:.2f} / 1.00",
        f"_{result['reason']}_",
        "",
        "### PESTLE breakdown",
    ]
    for pestle, data in result["by_pestle"].items():
        bar   = "█" * int(data["avg_impact"] * 10) + "░" * (10 - int(data["avg_impact"] * 10))
        lines.append(f"- **{pestle}** `{bar}` SKD={data['skd']:.2f}  (n={data['n']})")
    return "\n".join(lines)


def _format_evidence(result: dict) -> str:
    rows = ["| # | Sentence | PESTLE | Sentiment | Relevance | Contribution |",
            "|---|----------|--------|-----------|-----------|--------------|"]
    for i, e in enumerate(result["evidence"], 1):
        short = e["sentence"][:80] + "…" if len(e["sentence"]) > 80 else e["sentence"]
        rows.append(
            f"| {i} | {short} | {e['pestle']} ({e['pestle_conf']:.2f}) "
            f"| {e['sentiment_label']} ({e['sent_confidence']:.2f}) "
            f"| {e['relevance']:.2f} | {e['impact_contribution']:.4f} |"
        )
    return "\n".join(rows)


# ── Gradio handler ────────────────────────────────────────────────────────────

def analyse(input_text: str, input_mode: str, max_points: int):
    if not input_text.strip():
        return "⚠️ Please provide a URL or text.", "", "{}"

    try:
        result = run_pipeline(input_text, input_mode, max_points)
    except Exception as exc:
        return f"❌ Error: {exc}", "", "{}"

    summary  = _format_summary(result)
    evidence = _format_evidence(result)
    json_out = json.dumps(result, indent=2, ensure_ascii=False)

    return summary, evidence, json_out


# ── Gradio UI layout ──────────────────────────────────────────────────────────

with gr.Blocks(title="Drivers & Trends Impact Assessment") as demo:
    gr.Markdown("# Drivers & Trends Impact Assessment\nPaste a news URL or raw text to assess roadmap impact.")

    with gr.Row():
        input_mode = gr.Radio(["URL", "Text"], value="URL", label="Input mode")
        max_points = gr.Slider(3, KEYPOINTS_MAX, value=5, step=1, label="Max key points")

    input_box = gr.Textbox(lines=4, placeholder="https://... or paste article text", label="Input")
    run_btn   = gr.Button("Analyse", variant="primary")

    verdict_md  = gr.Markdown(label="Verdict & PESTLE breakdown")
    evidence_md = gr.Markdown(label="Evidence trail")
    json_out    = gr.Code(language="json", label="JSON export")

    run_btn.click(
        fn=analyse,
        inputs=[input_box, input_mode, max_points],
        outputs=[verdict_md, evidence_md, json_out],
    )

if __name__ == "__main__":
    demo.launch()