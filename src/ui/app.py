import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # add src/ to path

# app.py — pipeline orchestration. Pure Python + core/: no UI framework here, so
# the FastAPI backend can import run_pipeline without pulling in gradio/plotly/
# pandas. The Gradio development UI lives in ui/gradio_app.py.
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

def _parse_roadmap_json(roadmap_json: str) -> dict | None:
    text = (roadmap_json or "").strip()
    if not text:
        return None
    roadmap = json.loads(text)
    if not all(k in roadmap for k in ("categories", "bands", "items")):
        raise ValueError("Roadmap JSON must include categories, bands, and items.")
    return roadmap


_PIPELINE_LOCK = threading.Lock()


def run_pipeline(input_text: str, input_mode: str, input_file, max_points: int, roadmap_json: str = "", use_expert_workshop: bool = True, llm_model: str | None = None, allow_external_ai: bool = False) -> dict:
    # ponytail: serialize this local prototype; use isolated model workers for concurrent service deployment.
    # Transformers initialization changes shared dtype state and cannot race another assessment.
    with _PIPELINE_LOCK:
        return _run_pipeline(input_text, input_mode, input_file, max_points, roadmap_json,
                             use_expert_workshop, llm_model, allow_external_ai)


def _run_pipeline(input_text, input_mode, input_file, max_points, roadmap_json, use_expert_workshop, llm_model, allow_external_ai):
    model = resolve_guidance_model(llm_model)
    roadmap = _parse_roadmap_json(roadmap_json)
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

