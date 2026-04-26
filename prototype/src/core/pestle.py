# pestle.py — classify each sentence into a PESTLE domain via zero-shot NLI

from typing import Tuple, List, Dict
from config import PESTLE_MODEL, PESTLE_LABELS

_classifier = None   # loaded once on first call


def _get_classifier():
    global _classifier
    if _classifier is None:
        from transformers import pipeline
        _classifier = pipeline(
            "zero-shot-classification",
            model=PESTLE_MODEL,
            device=-1,          # CPU; set to 0 for GPU
        )
    return _classifier


def classify_pestle(sentence: str) -> Dict:
    """
    Classify one sentence into a PESTLE domain.

    Returns:
        {
            "label":      str    primary PESTLE label
            "confidence": float  score for the primary label (0..1)
            "top2":       list   top-2 [(label, score), ...] for audit
        }
    """
    clf = _get_classifier()
    out = clf(sentence, PESTLE_LABELS, multi_label=False)

    # out["labels"] and out["scores"] are sorted highest→lowest
    label      = out["labels"][0]
    confidence = round(out["scores"][0], 4)
    top2       = [(out["labels"][i], round(out["scores"][i], 4)) for i in range(min(2, len(out["labels"])))]

    return {
        "label":      label,
        "confidence": confidence,
        "top2":       top2,
    }
