# pestle.py — classify each sentence into a PESTLE domain via zero-shot NLI.
#
# Uses verbalized hypotheses (e.g. "This news text is primarily about political
# affairs, government policy, elections, or geopolitics.") instead of the bare
# single-word labels. This raises zero-shot confidence and reduces same-vector
# collisions between abstract labels (e.g. Political vs Social).
#
# The NLI model returns the verbalized phrase as its top label; we back-map
# positionally to the canonical one-word PESTLE label exposed to the rest of
# the pipeline.

from typing import Dict
from config import (
    PESTLE_MODEL,
    PESTLE_LABELS,
    PESTLE_LABEL_VERBALIZED,
    PESTLE_HYPOTHESIS_TEMPLATE,
)

_classifier = None   # loaded once on first call

# Verbalized phrase → canonical short label (positional pairing in config).
_VERBALIZED_TO_LABEL = dict(zip(PESTLE_LABEL_VERBALIZED, PESTLE_LABELS))


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
            "label":      str    primary canonical PESTLE label
            "confidence": float  score for the primary label (0..1)
            "top2":       list   top-2 [(canonical_label, score), ...] for audit
        }
    """
    clf = _get_classifier()
    out = clf(
        sentence,
        PESTLE_LABEL_VERBALIZED,
        hypothesis_template=PESTLE_HYPOTHESIS_TEMPLATE,
        multi_label=False,
    )

    # out["labels"] / out["scores"] sorted highest→lowest, but contain
    # the verbalized phrases — back-map to canonical PESTLE labels.
    canonical = [_VERBALIZED_TO_LABEL.get(lbl, lbl) for lbl in out["labels"]]

    label      = canonical[0]
    confidence = round(out["scores"][0], 4)
    top2       = [(canonical[i], round(out["scores"][i], 4))
                  for i in range(min(2, len(canonical)))]

    return {
        "label":      label,
        "confidence": confidence,
        "top2":       top2,
    }
