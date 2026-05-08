"""HTTP bridge for DDRM Builder -> impact pipeline -> roadmap guidance."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from ui.app import run_pipeline


class RecommendRequest(BaseModel):
    input_text: str = Field(..., min_length=1)
    input_mode: str = "Text"
    max_points: int = 5
    roadmap: Dict[str, Any]


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


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/recommend", response_model=RecommendResponse)
def recommend(req: RecommendRequest) -> RecommendResponse:
    try:
        mode = req.input_mode if req.input_mode in {"URL", "Text"} else "Text"
        result = run_pipeline(
            input_text=req.input_text,
            input_mode=mode,
            input_file=None,
            max_points=max(3, min(10, int(req.max_points))),
            roadmap_json=json.dumps(req.roadmap, ensure_ascii=False),
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

    uvicorn.run(app, host="127.0.0.1", port=7875)
