"""HTTP bridge for DDRM Builder -> impact pipeline -> roadmap guidance."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Make `src/` importable so `from ui.app import ...` resolves when this file
# is run directly (e.g. `python src/api/roadmap_api.py`).
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from ui.app import run_pipeline  # noqa: E402  (import after sys.path mutation)
from config import KEYPOINTS_MIN, KEYPOINTS_MAX, DDRM_THRESHOLDS, GUIDANCE_MODELS  # noqa: E402
from core.guidance import resolve_guidance_model  # noqa: E402

VALID_INPUT_MODES = {"URL", "Text"}
DEFAULT_INPUT_MODE = "Text"
# Keypoint bounds come from config.py — the tolerance bands and DDRM thresholds
# are calibrated against KEYPOINTS_MAX, so a different default here silently
# shifts every verdict. Do not re-declare them.
DEFAULT_KEYPOINTS = KEYPOINTS_MAX
HOST = "127.0.0.1"
PORT = 7875


class RecommendRequest(BaseModel):
    input_text: str = Field(..., min_length=1)
    input_mode: str = DEFAULT_INPUT_MODE
    max_points: int = DEFAULT_KEYPOINTS
    roadmap: Dict[str, Any]
    use_expert_workshop: bool = True
    llm_model: str | None = None
    allow_external_ai: bool = False


class RecommendResponse(BaseModel):
    result: Dict[str, Any]


app = FastAPI(title="DDRM Roadmap Advisor API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/recommend", response_model=RecommendResponse)
def recommend(req: RecommendRequest) -> RecommendResponse:
    try:
        if req.input_mode not in VALID_INPUT_MODES:
            raise ValueError("Input mode must be Text or URL.")
        model = resolve_guidance_model(req.llm_model)
        result = run_pipeline(
            input_text=req.input_text,
            input_mode=req.input_mode,
            input_file=None,
            max_points=_clamp(int(req.max_points), KEYPOINTS_MIN, KEYPOINTS_MAX),
            roadmap_json=json.dumps(req.roadmap, ensure_ascii=False),
            use_expert_workshop=bool(req.use_expert_workshop),
            llm_model=model,
            allow_external_ai=req.allow_external_ai,
        )
        return RecommendResponse(result=result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logging.getLogger(__name__).exception("Advisor failed")
        raise HTTPException(status_code=500, detail="Advisor failed unexpectedly. Check server logs.") from exc


@app.get("/api/config")
def public_config() -> Dict[str, Any]:
    return {"guidance_models": list(GUIDANCE_MODELS), "thresholds": DDRM_THRESHOLDS,
            "keypoints_min": KEYPOINTS_MIN, "keypoints_max": KEYPOINTS_MAX,
            "external_ai_default": False}


def _warm_models() -> None:
    from ui.app import warm_models
    try:
        warm_models()
    except Exception:  # an assessment still reports the actionable "model unavailable" error
        logging.getLogger(__name__).exception("Model warm-up failed")


if __name__ == "__main__":
    import threading
    import uvicorn

    threading.Thread(target=_warm_models, daemon=True).start()  # serve /api/health while models load
    uvicorn.run(app, host=HOST, port=PORT)
