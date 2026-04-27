# keypoints_lab.py — standalone Gradio UI for tuning & testing keypoint extraction.
# Run:  python src/ui/keypoints_lab.py
#
# Lets you:
#   - paste raw text OR fetch from URL
#   - tweak alpha / beta / gamma / MMR lambda / word bounds at runtime
#   - inspect picked sentences + scores side-by-side with TF-IDF baseline
#   - see which sentences were filtered out and why

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # add src/ to path

from typing import List, Tuple

import gradio as gr
import pandas as pd

from core.extractor import extract_article, extract_text
import core.keypoints as kp
from config import KEYPOINTS_MIN, KEYPOINTS_MAX, PESTLE_LABELS


def _override_knobs(alpha, beta, gamma, mmr_lambda, min_words, max_words):
    """Patch module-level knobs in keypoints.py for this run."""
    kp.KEYPOINTS_ALPHA = float(alpha)
    kp.KEYPOINTS_BETA = float(beta)
    kp.KEYPOINTS_GAMMA = float(gamma)
    kp.KEYPOINTS_MMR_LAMBDA = float(mmr_lambda)
    kp.KEYPOINTS_MIN_WORDS = int(min_words)
    kp.KEYPOINTS_MAX_WORDS = int(max_words)


def _load_text(input_text: str, mode: str) -> str:
    if mode == "URL":
        url = (input_text or "").strip()
        if not url:
            raise gr.Error("Provide a URL.")
        _title, body = extract_article(url)
        return body or ""
    _title, body = extract_text(input_text or "")
    return body or ""


def _tfidf_baseline(sentences: List[str], k: int) -> List[Tuple[str, float]]:
    """Old behavior for side-by-side comparison."""
    import numpy as np
    scores = kp._tfidf_fallback_scores(sentences)
    order = np.argsort(scores)[::-1][:k].tolist()
    max_s = max(float(scores[i]) for i in order) or 1.0
    order_sorted = sorted(order)
    return [(sentences[i], round(float(scores[i]) / max_s, 4)) for i in order_sorted]


def _filter_report(text: str) -> pd.DataFrame:
    """Show every raw sentence + whether kept or filtered (and why)."""
    import re
    raw_text = re.sub(r"\s+", " ", text or "").strip()
    if not raw_text:
        return pd.DataFrame(columns=["#", "kept", "reason", "words", "sentence"])
    protected = kp._protect_abbrevs(raw_text)
    raw = kp._SENT_END.split(protected)

    rows = []
    for i, s in enumerate(raw, 1):
        s = kp._restore_abbrevs(s).strip()
        if not s:
            continue
        n = len(s.split())
        if n < kp.KEYPOINTS_MIN_WORDS:
            kept, reason = False, f"too short (<{kp.KEYPOINTS_MIN_WORDS} words)"
        elif n > kp.KEYPOINTS_MAX_WORDS:
            kept, reason = False, f"too long (>{kp.KEYPOINTS_MAX_WORDS} words)"
        else:
            kept, reason = True, "kept"
        rows.append({"#": i, "kept": kept, "reason": reason, "words": n, "sentence": s})
    return pd.DataFrame(rows)


def run_extraction(
    input_text, input_mode, max_points,
    alpha, beta, gamma, mmr_lambda,
    min_words, max_words,
    show_baseline,
):
    if max_words <= min_words:
        raise gr.Error("max_words must exceed min_words.")

    _override_knobs(alpha, beta, gamma, mmr_lambda, min_words, max_words)
    raw = _load_text(input_text, input_mode)

    if not raw.strip():
        raise gr.Error("Empty text after extraction.")

    semantic = kp.extract_keypoints_rich(raw, max_points=int(max_points))
    sem_df = pd.DataFrame(
        [
            (i + 1, item["relevance"], item["composite"], item["sentence"], item["context"])
            for i, item in enumerate(semantic)
        ],
        columns=["rank", "relevance", "composite", "sentence", "context"],
    )

    base_df = pd.DataFrame(columns=["rank", "weight", "sentence"])
    if show_baseline:
        sentences = kp._split_sentences(raw)
        if len(sentences) > int(max_points):
            base = _tfidf_baseline(sentences, int(max_points))
            base_df = pd.DataFrame(
                [(i + 1, w, s) for i, (s, w) in enumerate(base)],
                columns=["rank", "weight", "sentence"],
            )

    filt_df = _filter_report(raw)

    stats = {
        "raw_chars": len(raw),
        "raw_sentences_total": int(len(filt_df)),
        "kept_after_filter": int(filt_df["kept"].sum()) if not filt_df.empty else 0,
        "picked": len(semantic),
        "knobs": {
            "alpha": alpha, "beta": beta, "gamma": gamma,
            "mmr_lambda": mmr_lambda,
            "min_words": min_words, "max_words": max_words,
            "embed_model": kp.KEYPOINTS_EMBED_MODEL,
            "pestle_labels": PESTLE_LABELS,
        },
    }
    return sem_df, base_df, filt_df, stats, raw[:4000]


def build_ui():
    with gr.Blocks(title="Keypoints Lab") as demo:
        gr.Markdown(
            "# Keypoints Lab\n"
            "Tune & test the keypoint extractor in isolation. Knob changes apply only to this session."
        )

        with gr.Row():
            with gr.Column(scale=2):
                input_mode = gr.Radio(["Text", "URL"], value="Text", label="Input mode")
                input_text = gr.Textbox(
                    label="Text or URL",
                    lines=10,
                    placeholder="Paste article text, or switch to URL mode and paste a link.",
                )
                max_points = gr.Slider(KEYPOINTS_MIN, KEYPOINTS_MAX, value=5, step=1, label="max_points")
                show_baseline = gr.Checkbox(value=True, label="Show TF-IDF baseline (side-by-side)")

            with gr.Column(scale=1):
                gr.Markdown("### Scoring weights")
                alpha = gr.Slider(0.0, 1.0, value=kp.KEYPOINTS_ALPHA, step=0.05, label="alpha — centroid sim")
                beta = gr.Slider(0.0, 1.0, value=kp.KEYPOINTS_BETA, step=0.05, label="beta — PESTLE prior")
                gamma = gr.Slider(0.0, 1.0, value=kp.KEYPOINTS_GAMMA, step=0.05, label="gamma — length penalty")
                mmr_lambda = gr.Slider(0.0, 1.0, value=kp.KEYPOINTS_MMR_LAMBDA, step=0.05,
                                       label="MMR lambda (1=relevance, 0=diversity)")
                min_words = gr.Slider(1, 30, value=kp.KEYPOINTS_MIN_WORDS, step=1, label="min_words")
                max_words = gr.Slider(20, 120, value=kp.KEYPOINTS_MAX_WORDS, step=5, label="max_words")

        run_btn = gr.Button("Extract", variant="primary")

        with gr.Tab("Semantic picks"):
            sem_out = gr.Dataframe(
                headers=["rank", "relevance", "composite", "sentence", "context"],
                wrap=True, label="Semantic + PESTLE + MMR (relevance = raw PESTLE-sim)",
            )
        with gr.Tab("TF-IDF baseline"):
            base_out = gr.Dataframe(
                headers=["rank", "weight", "sentence"],
                wrap=True, label="Old behavior (mean TF-IDF)",
            )
        with gr.Tab("Filter report"):
            filt_out = gr.Dataframe(
                headers=["#", "kept", "reason", "words", "sentence"],
                wrap=True, label="Every raw sentence + filter decision",
            )
        with gr.Tab("Stats / knobs"):
            stats_out = gr.JSON(label="Run stats")
        with gr.Tab("Raw text (preview)"):
            raw_out = gr.Textbox(lines=20, label="First 4000 chars after extraction")

        run_btn.click(
            run_extraction,
            inputs=[
                input_text, input_mode, max_points,
                alpha, beta, gamma, mmr_lambda,
                min_words, max_words,
                show_baseline,
            ],
            outputs=[sem_out, base_out, filt_out, stats_out, raw_out],
        )

    return demo


if __name__ == "__main__":
    build_ui().launch()
