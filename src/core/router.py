# router.py — map a PESTLE label to its configured sentiment model, and the
# shared precision/device settings every model loader uses.

from config import PESTLE_MODELS, FALLBACK_SENTIMENT_MODEL


def get_model_id(pestle_label: str) -> str:
    """Return the sentiment model ID for a given PESTLE label."""
    entry = PESTLE_MODELS.get(pestle_label)
    if entry:
        return entry["model_id"]
    return FALLBACK_SENTIMENT_MODEL


def model_load_args() -> dict:
    """float32 on the GPU when PyTorch can use one, else on the CPU.

    Transformers 5 otherwise keeps a checkpoint's saved dtype; the float16 PESTLE
    checkpoint made every CPU assessment take minutes.
    """
    import torch
    return {"dtype": torch.float32, "device": 0 if torch.cuda.is_available() else -1}


def get_model_config(pestle_label: str) -> dict:
    """Return the full model config dict for a PESTLE label."""
    return PESTLE_MODELS.get(pestle_label, {"model_id": FALLBACK_SENTIMENT_MODEL, "max_length": 512})
