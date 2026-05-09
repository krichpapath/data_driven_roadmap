# sentiment.py — run sentiment on a sentence using the routed model

from typing import Dict

from core.router import get_model_config

# model_id -> transformers pipeline (loaded once per model on first use)
_pipeline_cache: Dict[str, object] = {}

# Map any model's raw label string -> canonical positive / negative / neutral
_LABEL_NORM = {
    "positive": "positive", "pos": "positive", "label_2": "positive",  # cardiffnlp
    "negative": "negative", "neg": "negative", "label_0": "negative",
    "neutral":  "neutral",  "neu": "neutral",  "label_1": "neutral",
}

# canonical label -> direction score
_LABEL_TO_SCORE = {"positive": 1, "neutral": 0, "negative": -1}


def _get_pipeline(model_id: str, max_length: int):
    if model_id not in _pipeline_cache:
        from transformers import pipeline
        _pipeline_cache[model_id] = pipeline(
            "text-classification",
            model=model_id,
            max_length=max_length,
            truncation=True,
            device=-1,   # CPU; set to 0 for GPU
        )
    return _pipeline_cache[model_id]


def _normalize_label(raw: str) -> str:
    return _LABEL_NORM.get(raw.lower(), "neutral")


def sentiment_to_score(label: str) -> int:
    """Canonical label -> direction score (+1, 0, -1)."""
    return _LABEL_TO_SCORE.get(label, 0)


def classify_sentiment(sentence: str, pestle_label: str) -> Dict:
    """
    Run the sentiment model routed for this PESTLE domain.

    Returns:
        {
            "label":      str    canonical label  (positive / negative / neutral)
            "score":      int    direction         (+1 / 0 / -1)
            "confidence": float  model confidence  (0..1)
            "model_id":   str    which model was used
        }
    """
    cfg          = get_model_config(pestle_label)
    model_id     = cfg["model_id"]
    max_len      = cfg.get("max_length", 512)
    label_map    = cfg.get("label_map") or {}
    neutral_thr  = cfg.get("neutral_threshold")  # only set for binary models

    pipe   = _get_pipeline(model_id, max_len)
    result = pipe(sentence)[0]   # {"label": ..., "score": ...}

    raw_label  = str(result["label"])
    confidence = round(float(result["score"]), 4)

    # 1. Per-driver label_map first (handles model-specific labels like
    #    "POSITIVE"/"NEGATIVE" or climate "opportunity"/"risk").
    mapped = label_map.get(raw_label) or label_map.get(raw_label.lower())
    label  = mapped if mapped else _normalize_label(raw_label)

    # 2. Synthesize neutral for binary-head models when confidence is low.
    if neutral_thr is not None and label in ("positive", "negative") and confidence < neutral_thr:
        label = "neutral"

    return {
        "label":      label,
        "score":      sentiment_to_score(label),
        "confidence": confidence,
        "model_id":   model_id,
    }
