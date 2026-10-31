# router.py — map a PESTLE label to its configured sentiment model, and the
# shared precision/device settings every model loader uses.

from functools import lru_cache

from config import PESTLE_MODELS, FALLBACK_SENTIMENT_MODEL

# All models together measured 3.3 GB of VRAM; the margin avoids out-of-memory crashes.
MIN_FREE_VRAM_BYTES = 4 * 1024**3


@lru_cache(maxsize=1)  # decide once: every model must land on the same device
def select_device() -> str:
    """Return "cuda" if a GPU has room for all the models, else "cpu"."""
    import torch
    if not torch.cuda.is_available():
        print("Running on CPU: no usable GPU found.", flush=True)
        return "cpu"
    try:
        free = torch.cuda.mem_get_info()[0]
        name = torch.cuda.get_device_name(0)
    except RuntimeError as exc:  # driver problem: the CPU still gives the same results
        print(f"Running on CPU: GPU could not be read ({exc}).", flush=True)
        return "cpu"
    if free < MIN_FREE_VRAM_BYTES:
        print(f"Running on CPU: {name} has {free / 1024**3:.1f} GB free, needs {MIN_FREE_VRAM_BYTES / 1024**3:.0f} GB.", flush=True)
        return "cpu"
    print(f"Running on GPU: {name}.", flush=True)
    return "cuda"


def model_load_args() -> dict:
    """float32 on the selected device.

    Transformers 5 otherwise keeps a checkpoint's saved dtype; the float16 PESTLE
    checkpoint made every CPU assessment take minutes.
    """
    import torch
    return {"dtype": torch.float32, "device": select_device()}


def get_model_config(pestle_label: str) -> dict:
    """Return the full model config dict for a PESTLE label."""
    return PESTLE_MODELS.get(pestle_label, {"model_id": FALLBACK_SENTIMENT_MODEL, "max_length": 512})
