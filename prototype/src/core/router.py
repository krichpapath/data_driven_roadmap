# router.py — map a PESTLE label to its configured sentiment model

from config import PESTLE_MODELS, FALLBACK_SENTIMENT_MODEL


def get_model_id(pestle_label: str) -> str:
    """Return the sentiment model ID for a given PESTLE label."""
    entry = PESTLE_MODELS.get(pestle_label)
    if entry:
        return entry["model_id"]
    return FALLBACK_SENTIMENT_MODEL


def get_model_config(pestle_label: str) -> dict:
    """Return the full model config dict for a PESTLE label."""
    return PESTLE_MODELS.get(pestle_label, {"model_id": FALLBACK_SENTIMENT_MODEL, "max_length": 512})
