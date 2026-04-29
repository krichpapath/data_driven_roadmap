import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # add src/ to path

# app.py — Gradio UI, orchestrates the full pipeline
import json
import re
from collections import Counter, defaultdict

import gradio as gr
import plotly.graph_objects as go
import pandas as pd

from core.extractor import extract_article, extract_text
from core.keypoints import extract_keypoints, extract_keypoints_rich
from core.pestle import classify_pestle
from core.sentiment import classify_sentiment
from core.impact import aggregate_by_pestle, overall_impact, ddrm_status, point_impact
from config import KEYPOINTS_MAX, PESTLE_WEIGHTS, DDRM_THRESHOLDS


# ─────────────────────────────────────────────────────────────
# Product constants
# ─────────────────────────────────────────────────────────────

PESTLE_ORDER = [
    "Political",
    "Economic",
    "Social",
    "Technological",
    "Legal",
    "Environmental",
]

STATUS_MEANING = {
    "Maintain": {
        "meaning": "The roadmap can stay mostly unchanged.",
        "action": "Keep monitoring. No immediate roadmap meeting is required.",
        "review": "Low priority review",
    },
    "Adjust": {
        "meaning": "Some assumptions may need attention.",
        "action": "Review the affected roadmap sections with the relevant experts.",
        "review": "Focused roadmap review",
    },
    "Revise": {
        "meaning": "The roadmap may no longer fit the current environment.",
        "action": "Start a formal roadmap revision discussion.",
        "review": "Full roadmap review",
    },
}

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
    "has", "have", "had", "but", "not", "can", "will", "would", "should",
    "into", "their", "there", "about", "which", "when", "where", "also",
    "than", "then", "been", "being", "such", "more", "most", "over",
    "under", "between", "within", "without", "because", "through",
    "using", "used", "use", "new", "may", "its", "our", "your", "you",
    "they", "them", "his", "her", "she", "him", "who", "what", "why",
    "how", "all", "any", "each", "per", "one", "two", "three",
}


# ─────────────────────────────────────────────────────────────
# Small helpers
# ─────────────────────────────────────────────────────────────

def _empty_fig(height: int = 260) -> go.Figure:
    fig = go.Figure()
    fig.update_layout(
        height=height,
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis={"visible": False},
        yaxis={"visible": False},
    )
    return fig


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _sentiment_score(label: str) -> int:
    label = (label or "").strip().lower()
    if label in {"positive", "pos", "opportunity"}:
        return 1
    if label in {"negative", "neg", "risk"}:
        return -1
    return 0


def _normalise_sentiment(raw, pestle_label: str) -> dict:
    """
    Supports either:
    1) dict output:
       {"label": "...", "score": -1/0/+1, "confidence": 0..1, "model_id": "..."}
    2) tuple output:
       ("positive"/"neutral"/"negative", confidence)
    """
    if isinstance(raw, dict):
        label = raw.get("label") or raw.get("sentiment") or "Neutral"
        score = raw.get("score")
        if score is None:
            score = _sentiment_score(label)

        return {
            "label": str(label).title(),
            "score": int(score),
            "confidence": _safe_float(raw.get("confidence"), 0.0),
            "model_id": raw.get("model_id") or raw.get("model") or f"{pestle_label} sentiment model",
        }

    if isinstance(raw, tuple) and len(raw) >= 2:
        label = str(raw[0]).title()
        return {
            "label": label,
            "score": _sentiment_score(label),
            "confidence": _safe_float(raw[1], 0.0),
            "model_id": f"{pestle_label} sentiment model",
        }

    return {
        "label": "Neutral",
        "score": 0,
        "confidence": 0.0,
        "model_id": f"{pestle_label} sentiment model",
    }


def _normalise_pestle(raw) -> dict:
    """
    Supports normal dict output from classify_pestle.
    Falls back safely if output shape changes.
    """
    if isinstance(raw, dict):
        label = raw.get("label") or "Social"
        confidence = _safe_float(raw.get("confidence"), 0.0)
        top2 = raw.get("top2") or []
        return {
            "label": label,
            "confidence": confidence,
            "top2": top2,
        }

    if isinstance(raw, str):
        return {
            "label": raw,
            "confidence": 0.0,
            "top2": [],
        }

    return {
        "label": "Social",
        "confidence": 0.0,
        "top2": [],
    }


def _read_text_file(file_path) -> tuple[str, str]:
    if not file_path:
        raise ValueError("Please upload a text file.")

    path = Path(file_path)
    if not path.exists():
        raise ValueError("Uploaded text file could not be found.")

    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            text = raw.decode(encoding).strip()
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", errors="replace").strip()

    if not text:
        raise ValueError("Uploaded text file is empty.")

    return path.name, text


def _load_input(input_text: str, input_mode: str, input_file=None) -> tuple[str, str]:
    if input_mode == "Text file":
        return _read_text_file(input_file)

    text = (input_text or "").strip()
    if not text:
        raise ValueError("Please provide a URL, article text, or text file.")

    if input_mode == "URL":
        return extract_article(text)

    extracted = extract_text(text)
    if isinstance(extracted, tuple) and len(extracted) >= 2:
        return extracted[0], extracted[1]

    return "Provided Text", str(extracted)


# ─────────────────────────────────────────────────────────────
# Pipeline
# ─────────────────────────────────────────────────────────────

def run_pipeline(input_text: str, input_mode: str, input_file, max_points: int) -> dict:
    title, text = _load_input(input_text, input_mode, input_file)

    keypoints = extract_keypoints_rich(text, max_points=int(max_points))

    evidence = []
    for idx, item in enumerate(keypoints, 1):
        sentence  = item["sentence"]
        relevance = _safe_float(item.get("relevance", 0.0), 0.0)
        context   = item.get("context") or sentence

        # Classify on context (better signal); display the bare sentence.
        pestle_raw = classify_pestle(context)
        pestle = _normalise_pestle(pestle_raw)

        sentiment_raw = classify_sentiment(context, pestle["label"])
        sentiment = _normalise_sentiment(sentiment_raw, pestle["label"])

        if pestle["label"] in PESTLE_ORDER:
            contribution = point_impact(
                sentiment["score"],
                sentiment["confidence"],
                pestle["confidence"],
                relevance,
            )
        else:
            contribution = 0.0

        signed_contribution = contribution
        if sentiment["score"] < 0:
            signed_contribution = -contribution
        elif sentiment["score"] == 0:
            signed_contribution = 0.0

        evidence.append({
            "rank": idx,
            "sentence": sentence,
            "relevance": relevance,

            "pestle": pestle["label"],
            "pestle_confidence": pestle["confidence"],
            "pestle_top2": pestle["top2"],

            "sentiment_label": sentiment["label"],
            "sentiment_score": sentiment["score"],
            "sentiment_confidence": sentiment["confidence"],
            "model_id": sentiment["model_id"],

            "impact_contribution": contribution,
            "signed_contribution": signed_contribution,
        })

    impact_points = [
        {
            "pestle": e["pestle"],
            "sentiment_score": e["sentiment_score"],
            "sent_confidence": e["sentiment_confidence"],
            "pestle_confidence": e["pestle_confidence"],
            "relevance": e["relevance"],
        }
        for e in evidence
    ]

    by_pestle = aggregate_by_pestle(impact_points)
    severity = overall_impact(impact_points)
    verdict, reason = ddrm_status(severity)

    return {
        "title": title,
        "verdict": verdict,
        "severity": severity,
        "reason": reason,
        "by_pestle": by_pestle,
        "evidence": evidence,
    }


# ─────────────────────────────────────────────────────────────
# User-facing summaries
# ─────────────────────────────────────────────────────────────

def build_decision_md(result: dict) -> str:
    verdict = result["verdict"]
    severity = _safe_float(result["severity"])
    info = STATUS_MEANING.get(verdict, STATUS_MEANING["Maintain"])

    return f"""
# {verdict}

**Severity:** `{severity:.2f} / 1.00`  
**Meaning:** {info["meaning"]}  
**Review type:** {info["review"]}

**Source:** {result.get("title") or "Untitled"}
"""


def build_action_md(result: dict) -> str:
    verdict = result["verdict"]
    info = STATUS_MEANING.get(verdict, STATUS_MEANING["Maintain"])

    top_driver = "No dominant driver"
    driver_df = build_driver_df(result)
    if not driver_df.empty:
        top_driver = str(driver_df.iloc[0]["Driver"])

    top_evidence = sorted(
        result["evidence"],
        key=lambda e: abs(_safe_float(e.get("signed_contribution"))),
        reverse=True,
    )

    main_reason = "No key evidence found."
    if top_evidence:
        main_reason = top_evidence[0]["sentence"]

    if len(main_reason) > 220:
        main_reason = main_reason[:220].rstrip() + "…"

    return f"""
## Recommended next step

{info["action"]}

**First area to check:** `{top_driver}`

**Main evidence:**  
{main_reason}

**System reason:**  
{result.get("reason", "")}
"""


def build_top_reasons_md(result: dict, k: int = 5) -> str:
    evidence = result.get("evidence", [])
    if not evidence:
        return "## Why this result\nNo evidence was extracted."

    ranked = sorted(
        evidence,
        key=lambda e: abs(_safe_float(e.get("signed_contribution"))),
        reverse=True,
    )[:k]

    lines = ["## Why this result", ""]
    for i, e in enumerate(ranked, 1):
        direction = "Opportunity" if e["sentiment_score"] > 0 else "Risk" if e["sentiment_score"] < 0 else "Neutral"
        sentence = e["sentence"]
        if len(sentence) > 260:
            sentence = sentence[:260].rstrip() + "…"

        lines.append(
            f"**{i}. {e['pestle']} · {direction} · impact `{e['signed_contribution']:+.2f}`**  \n"
            f"{sentence}"
        )
        lines.append("")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────
# Tables
# ─────────────────────────────────────────────────────────────

def build_driver_df(result: dict) -> pd.DataFrame:
    rows = []
    evidence = result.get("evidence", [])

    for driver in PESTLE_ORDER:
        driver_evidence = [e for e in evidence if e["pestle"] == driver]
        by = result.get("by_pestle", {}).get(driver, {})

        avg_pestle_conf = 0.0
        avg_sent_conf = 0.0
        avg_signed = 0.0

        if driver_evidence:
            avg_pestle_conf = sum(e["pestle_confidence"] for e in driver_evidence) / len(driver_evidence)
            avg_sent_conf = sum(e["sentiment_confidence"] for e in driver_evidence) / len(driver_evidence)
            avg_signed = sum(e["signed_contribution"] for e in driver_evidence) / len(driver_evidence)

        rows.append({
            "Driver": driver,
            "Priority": round(_safe_float(by.get("skd")), 4),
            "Severity": round(_safe_float(by.get("avg_impact")), 4),
            "Evidence Count": int(by.get("n", 0)),
            "Avg Direction": round(avg_signed, 4),
            "PESTLE Confidence": round(avg_pestle_conf, 3),
            "Sentiment Confidence": round(avg_sent_conf, 3),
        })

    df = pd.DataFrame(rows)
    return df.sort_values(
        ["Priority", "Evidence Count", "PESTLE Confidence"],
        ascending=[False, False, False],
    ).reset_index(drop=True)


def build_evidence_df(result: dict) -> pd.DataFrame:
    evidence = result.get("evidence", [])
    rows = []

    for e in evidence:
        direction = "Opportunity" if e["sentiment_score"] > 0 else "Risk" if e["sentiment_score"] < 0 else "Neutral"

        rows.append({
            "#": e["rank"],
            "Key Evidence": e["sentence"],
            "Driver": e["pestle"],
            "Direction": direction,
            "Impact": round(_safe_float(e["signed_contribution"]), 4),
            "Relevance": round(_safe_float(e["relevance"]), 3),
            "PESTLE Conf.": round(_safe_float(e["pestle_confidence"]), 3),
            "Sentiment Conf.": round(_safe_float(e["sentiment_confidence"]), 3),
            "Model": e["model_id"],
            "Alternative Driver": _format_top2(e.get("pestle_top2")),
        })

    if not rows:
        return pd.DataFrame(columns=[
            "#", "Key Evidence", "Driver", "Direction", "Impact", "Relevance",
            "PESTLE Conf.", "Sentiment Conf.", "Model", "Alternative Driver"
        ])

    return pd.DataFrame(rows).sort_values(
        "Impact",
        key=lambda s: s.abs(),
        ascending=False,
    ).reset_index(drop=True)


def _format_top2(top2) -> str:
    if not top2:
        return ""

    parts = []
    for item in top2[:2]:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            parts.append(f"{item[0]} ({_safe_float(item[1]):.2f})")
        else:
            parts.append(str(item))

    return " / ".join(parts)


def build_keyword_df(result: dict, top_n: int = 15) -> pd.DataFrame:
    evidence = result.get("evidence", [])

    keyword_counts = Counter()
    keyword_impact = defaultdict(float)
    keyword_drivers = defaultdict(Counter)

    for e in evidence:
        words = re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", e["sentence"].lower())
        for word in words:
            if word in STOPWORDS:
                continue

            keyword_counts[word] += 1
            keyword_impact[word] += abs(_safe_float(e["signed_contribution"]))
            keyword_drivers[word][e["pestle"]] += 1

    rows = []
    for word, count in keyword_counts.most_common(top_n):
        dominant_driver = ""
        if keyword_drivers[word]:
            dominant_driver = keyword_drivers[word].most_common(1)[0][0]

        rows.append({
            "Keyword": word,
            "Mentions": count,
            "Impact Weight": round(keyword_impact[word], 4),
            "Main Driver": dominant_driver,
        })

    if not rows:
        return pd.DataFrame(columns=["Keyword", "Mentions", "Impact Weight", "Main Driver"])

    return pd.DataFrame(rows).sort_values(
        ["Impact Weight", "Mentions"],
        ascending=[False, False],
    ).reset_index(drop=True)


def build_audit_md(result: dict, max_points: int) -> str:
    weights = ", ".join(
        f"{k}: {v:.2f}" for k, v in PESTLE_WEIGHTS.items()
    )

    return f"""
## Audit summary

**Input title:** {result.get("title") or "Untitled"}  
**Key points used:** {len(result.get("evidence", []))} / requested {max_points}  
**Adjust threshold:** `{DDRM_THRESHOLDS.get("adjust", 0.35)}`  
**Revise threshold:** `{DDRM_THRESHOLDS.get("revise", 0.70)}`  

**PESTLE weights:**  
{weights}

**Traceability chain:**  
Input text → key points → PESTLE driver → sentiment direction → impact contribution → roadmap status
"""


# ─────────────────────────────────────────────────────────────
# Charts
# ─────────────────────────────────────────────────────────────

def build_impact_plot(result: dict) -> go.Figure:
    severity = _safe_float(result.get("severity"))
    adjust = _safe_float(DDRM_THRESHOLDS.get("adjust"), 0.35)
    revise = _safe_float(DDRM_THRESHOLDS.get("revise"), 0.70)

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=[severity],
        y=["Roadmap impact"],
        orientation="h",
        text=[f"{severity:.2f}"],
        textposition="outside",
        hovertemplate="Severity: %{x:.2f}<extra></extra>",
    ))

    fig.add_vline(x=adjust, line_dash="dash", annotation_text="Adjust")
    fig.add_vline(x=revise, line_dash="dash", annotation_text="Revise")

    fig.update_layout(
        title="Decision threshold view",
        xaxis=dict(range=[0, 1], title="Severity"),
        yaxis=dict(title=""),
        height=220,
        margin=dict(l=20, r=30, t=50, b=30),
        showlegend=False,
    )

    return fig


def build_heatmap(result: dict) -> go.Figure:
    driver_df = build_driver_df(result)

    if driver_df.empty:
        return _empty_fig(320)

    metrics = ["Severity", "Evidence Count", "PESTLE Confidence", "Sentiment Confidence"]
    z = []

    max_count = max(1, int(driver_df["Evidence Count"].max()))

    for _, row in driver_df.iterrows():
        z.append([
            _safe_float(row["Severity"]),
            _safe_float(row["Evidence Count"]) / max_count,
            _safe_float(row["PESTLE Confidence"]),
            _safe_float(row["Sentiment Confidence"]),
        ])

    fig = go.Figure(data=go.Heatmap(
        z=z,
        x=metrics,
        y=driver_df["Driver"],
        hovertemplate="<b>%{y}</b><br>%{x}: %{z:.2f}<extra></extra>",
    ))

    fig.update_layout(
        title="Where attention is needed",
        height=360,
        margin=dict(l=20, r=20, t=50, b=40),
    )

    return fig


# ─────────────────────────────────────────────────────────────
# Gradio handler
# ─────────────────────────────────────────────────────────────

def blank_outputs(message: str):
    return (
        f"# {message}",
        "No recommendation yet.",
        pd.DataFrame(),
        _empty_fig(220),
        _empty_fig(360),
        "## Why this result\nNo analysis yet.",
        pd.DataFrame(),
        pd.DataFrame(),
        "## Audit summary\nNo analysis yet.",
        "{}",
    )


def analyse(input_text: str, input_mode: str, input_file, max_points: int):
    if input_mode == "Text file":
        if not input_file:
            return blank_outputs("Upload a text file to begin.")
    elif not (input_text or "").strip():
        return blank_outputs("Provide a URL or text to begin.")

    try:
        result = run_pipeline(input_text, input_mode, input_file, max_points)

        decision_md = build_decision_md(result)
        action_md = build_action_md(result)
        driver_df = build_driver_df(result)
        impact_plot = build_impact_plot(result)
        heatmap_plot = build_heatmap(result)
        reasons_md = build_top_reasons_md(result)
        keyword_df = build_keyword_df(result)
        evidence_df = build_evidence_df(result)
        audit_md = build_audit_md(result, max_points)

        json_out = json.dumps(result, indent=2, ensure_ascii=False)

        return (
            decision_md,
            action_md,
            driver_df,
            impact_plot,
            heatmap_plot,
            reasons_md,
            keyword_df,
            evidence_df,
            audit_md,
            json_out,
        )

    except Exception as exc:
        return blank_outputs(f"Analysis failed: {exc}")


# ─────────────────────────────────────────────────────────────
# Gradio 6 UI
# ─────────────────────────────────────────────────────────────

def update_input_controls(input_mode: str):
    file_mode = input_mode == "Text file"
    placeholder = "Paste a news URL or report URL here."
    if input_mode == "Text":
        placeholder = "Paste article text here."

    return (
        gr.update(visible=not file_mode, placeholder=placeholder),
        gr.update(visible=file_mode),
    )


slider_max = max(3, int(KEYPOINTS_MAX))
slider_default = min(5, slider_max)

with gr.Blocks(title="Roadmap Impact Review") as demo:
    gr.Markdown(
        "# Roadmap Impact Review\n"
        "A simple decision-support view for checking whether new evidence suggests "
        "**Maintain**, **Adjust**, or **Revise** for a technology roadmap."
    )

    with gr.Row():
        with gr.Column(scale=1):
            input_mode = gr.Radio(
                choices=["URL", "Text", "Text file"],
                value="URL",
                label="Input type",
            )

            input_box = gr.Textbox(
                label="Evidence source",
                lines=8,
                placeholder="Paste a news URL, report URL, or article text here.",
            )

            input_file = gr.File(
                label="Text file",
                file_types=[".txt"],
                type="filepath",
                visible=False,
            )

            max_points = gr.Slider(
                minimum=3,
                maximum=slider_max,
                value=slider_default,
                step=1,
                label="Evidence points to review",
            )

            run_btn = gr.Button(
                "Assess roadmap impact",
                variant="primary",
            )

        with gr.Column(scale=1):
            decision_md = gr.Markdown("# Provide a URL or text to begin.")
            action_md = gr.Markdown("No recommendation yet.")

    with gr.Tabs():
        with gr.Tab("Attention"):
            gr.Markdown("## Driver priority")
            driver_table = gr.Dataframe(
                interactive=False,
                wrap=True,
                label="Drivers ranked by roadmap attention priority",
            )

            impact_plot = gr.Plot(label="Decision threshold view")
            heatmap_plot = gr.Plot(label="Attention heatmap")

        with gr.Tab("Reason"):
            reasons_md = gr.Markdown("## Why this result\nNo analysis yet.")

            gr.Markdown("## Keywords")
            keyword_table = gr.Dataframe(
                interactive=False,
                wrap=True,
                label="Keywords ranked by impact weight",
            )

        with gr.Tab("Evidence"):
            evidence_table = gr.Dataframe(
                interactive=False,
                wrap=True,
                label="Traceable evidence table",
            )

        with gr.Tab("Export"):
            audit_md = gr.Markdown("## Audit summary\nNo analysis yet.")
            json_out = gr.Code(
                language="json",
                label="Full JSON output",
            )

    input_mode.change(
        fn=update_input_controls,
        inputs=[input_mode],
        outputs=[input_box, input_file],
    )

    run_btn.click(
        fn=analyse,
        inputs=[input_box, input_mode, input_file, max_points],
        outputs=[
            decision_md,
            action_md,
            driver_table,
            impact_plot,
            heatmap_plot,
            reasons_md,
            keyword_table,
            evidence_table,
            audit_md,
            json_out,
        ],
    )


if __name__ == "__main__":
    demo.launch()
