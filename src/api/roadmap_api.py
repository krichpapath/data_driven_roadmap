"""HTTP bridge for DDRM Builder -> impact pipeline -> roadmap guidance."""

from __future__ import annotations

import json
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
from config import KEYPOINTS_MIN, KEYPOINTS_MAX  # noqa: E402

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
    mode = req.input_mode if req.input_mode in VALID_INPUT_MODES else DEFAULT_INPUT_MODE
    try:
        result = run_pipeline(
            input_text=req.input_text,
            input_mode=mode,
            input_file=None,
            max_points=_clamp(int(req.max_points), KEYPOINTS_MIN, KEYPOINTS_MAX),
            roadmap_json=json.dumps(req.roadmap, ensure_ascii=False),
            use_expert_workshop=bool(req.use_expert_workshop),
        )
        return RecommendResponse(result=result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Advisor failed unexpectedly. Check server logs.") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
