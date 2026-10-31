import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # add src/ to path

# app.py — pipeline orchestration. Pure Python + core/: no UI framework here, so
# the FastAPI backend can import run_pipeline without pulling in gradio/plotly/
# pandas.
import json
import threading

from core.extractor import extract_article, extract_text
from core.keypoints import extract_keypoints_rich
from core.pestle import classify_pestle
from core.sentiment import classify_sentiment
from core.impact import aggregate_by_pestle, overall_impact, ddrm_status, point_impact
from core.roadmap_matcher import match_roadmap_items
from core.guidance import generate_guidance, generate_expert_guidance
from config import DDRM_THRESHOLDS
from core.guidance import resolve_guidance_model


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


# ─────────────────────────────────────────────────────────────
# Small helpers
# ─────────────────────────────────────────────────────────────
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


def _normalise_sentiment(raw: dict) -> dict:
    return {
        "label": str(raw["label"]).title(),
        "score": int(raw["score"]),
        "confidence": _safe_float(raw.get("confidence"), 0.0),
        "model_id": raw["model_id"],
    }


def _require_english_script(text: str) -> None:
    # shortcut: catches non-Latin scripts only, so French still gets scored; use a language model if that matters.
    letters = [c for c in text if c.isalpha()]
    if letters and sum(c.isascii() for c in letters) / len(letters) < 0.5:
        raise ValueError("The scoring models understand English only. Add an approved English translation and assess that.")


def _load_input(input_text: str, input_mode: str) -> tuple[str, str]:
    text = (input_text or "").strip()
    if not text:
        raise ValueError("Please provide a URL or article text.")

    title, text = extract_article(text) if input_mode == "URL" else extract_text(text)
    _require_english_script(text)
    return title, text


# ─────────────────────────────────────────────────────────────
# Pipeline
# ─────────────────────────────────────────────────────────────

def _parse_roadmap_json(roadmap_json: str) -> dict | None:
    text = (roadmap_json or "").strip()
    if not text:
        return None
    roadmap = json.loads(text)
    if not isinstance(roadmap, dict) or not all(k in roadmap for k in ("categories", "bands", "items")):
        raise ValueError("Roadmap JSON must include categories, bands, and items.")
    for key in ("categories", "bands", "items"):
        if not isinstance(roadmap[key], list) or not all(isinstance(entry, dict) for entry in roadmap[key]):
            raise ValueError(f"Roadmap {key} must be a list of objects.")
    if not all(isinstance(item.get(key) or [], list) for item in roadmap["items"] for key in ("pestle", "bands")):
        raise ValueError("Roadmap item pestle and bands must be lists.")
    return roadmap


_PIPELINE_LOCK = threading.Lock()


def warm_models() -> None:
    """Load every model once at API start, so the first assessment does not wait about a minute."""
    from config import PESTLE_MODELS
    from core.keypoints import _get_embedder
    from core.pestle import _get_classifier
    from core.sentiment import _get_pipeline
    with _PIPELINE_LOCK:  # same dtype race as run_pipeline: never load beside an assessment
        _get_embedder()
        _get_classifier()
        for cfg in PESTLE_MODELS.values():
            _get_pipeline(cfg["model_id"], cfg.get("max_length", 512))


def _score_evidence(text: str, max_points: int) -> list:
    keypoints = extract_keypoints_rich(text, max_points=int(max_points))

    evidence = []
    for idx, item in enumerate(keypoints, 1):
        sentence  = item["sentence"]
        relevance = _safe_float(item.get("relevance", 0.0), 0.0)
        context   = item.get("context") or sentence

        # Classify on context (better signal); display the bare sentence.
        pestle_raw = classify_pestle(context)
        pestle = {"label": pestle_raw["label"], "confidence": _safe_float(pestle_raw.get("confidence")), "top2": pestle_raw.get("top2") or []}

        sentiment_raw = classify_sentiment(context, pestle["label"])
        sentiment = _normalise_sentiment(sentiment_raw)

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
            "id": f"K{idx}",
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
    return evidence


def run_pipeline(input_text: str, input_mode: str, max_points: int, roadmap_json: str = "", use_expert_workshop: bool = True, llm_model: str | None = None, allow_external_ai: bool = False) -> dict:
    model = resolve_guidance_model(llm_model)
    roadmap = _parse_roadmap_json(roadmap_json)
    title, text = _load_input(input_text, input_mode)  # a slow website must not hold the lock

    # shortcut: one scoring run at a time suits a single local user; use isolated model workers for a shared service.
    # Transformers initialization changes shared dtype state and cannot race another assessment.
    with _PIPELINE_LOCK:
        evidence = _score_evidence(text, max_points)

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

    result = {
        "title": title,
        "verdict": verdict,
        "severity": severity,
        "thresholds": dict(DDRM_THRESHOLDS),
        "reason": reason,
        "by_pestle": by_pestle,
        "evidence": evidence,
        "roadmap_matches": [],
        "guidance": {},
    }

    if roadmap:
        matches = match_roadmap_items(result, roadmap)
        result["roadmap_title"] = roadmap.get("title") or "Untitled roadmap"
        result["roadmap_matches"] = matches
        if use_expert_workshop:
            result["guidance"] = generate_expert_guidance(result, roadmap, matches, llm_model=model, allow_external_ai=allow_external_ai)
        else:
            result["guidance"] = generate_guidance(result, matches, llm_model=model, allow_external_ai=allow_external_ai)

    return result

