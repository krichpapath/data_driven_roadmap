"""HTTP bridge for DDRM Builder -> impact pipeline -> roadmap guidance."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, Path as PathParam
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Make `src/` importable so `from ui.app import ...` resolves when this file
# is run directly (e.g. `python src/api/roadmap_api.py`).
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from ui.app import run_pipeline  # noqa: E402  (import after sys.path mutation)
from config import KEYPOINTS_MIN, KEYPOINTS_MAX, DDRM_THRESHOLDS, GUIDANCE_MODELS  # noqa: E402
from core.guidance import resolve_guidance_model  # noqa: E402
from core.extractor import extract_article  # noqa: E402
from api import history_store  # noqa: E402

VALID_INPUT_MODES = {"URL", "Text"}
DEFAULT_INPUT_MODE = "Text"
# Keypoint bounds come from config.py — the tolerance bands and DDRM thresholds
# are calibrated against KEYPOINTS_MAX, so a different default here silently
# shifts every verdict. Do not re-declare them.
DEFAULT_KEYPOINTS = KEYPOINTS_MAX
HOST = "127.0.0.1"
PORT = 7875


class SourceReference(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    revision: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=300)


class ExtractRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)


class RecommendRequest(BaseModel):
    input_text: str = Field(..., min_length=1, max_length=200_000)
    input_mode: str = DEFAULT_INPUT_MODE
    max_points: int = DEFAULT_KEYPOINTS
    roadmap: Dict[str, Any]
    use_expert_workshop: bool = True
    llm_model: str | None = None
    allow_external_ai: bool = False
    source_ref: SourceReference | None = None


class RecommendResponse(BaseModel):
    result: Dict[str, Any]


class HistoryEvent(BaseModel, extra="allow"):
    # The whole event is stored as sent; these are the fields the store indexes on.
    event_id: str = Field(min_length=1, max_length=120)
    timestamp: str = Field(min_length=10, max_length=40)
    item_id: str | None = Field(default=None, max_length=200)
    item_name_snapshot: str | None = Field(default=None, max_length=1000)
    event_type: str | None = Field(default=None, max_length=40)
    origin_type: str | None = Field(default=None, max_length=40)
    actor_id: str | None = Field(default=None, max_length=120)
    fields: List[str] = Field(default_factory=list, max_length=20)
    important: bool = False
    search_text: str = Field(default="", max_length=400_000)


class HistoryBatch(BaseModel):
    events: List[HistoryEvent] = Field(max_length=1000)


RoadmapId = PathParam(min_length=1, max_length=200)


app = FastAPI(title="DDRM Roadmap Advisor API")
app.add_middleware(
    CORSMiddleware,
    # Only the local web page may call the API: any other site open in the browser must not read or write history.
    allow_origin_regex=r"^http://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/extract")
def extract(req: ExtractRequest) -> Dict[str, str]:
    """Stateless HTML extraction through the same bounded, SSRF-safe fetcher."""
    try:
        title, text = extract_article(req.url)
        if len(text) > 200_000:
            raise ValueError("Article exceeds 200,000 characters; import a shorter excerpt.")
        return {"title": title, "text": text, "url": req.url, "method": "html"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logging.getLogger(__name__).exception("Source extraction failed")
        raise HTTPException(status_code=502, detail="Could not extract this page. Retry or paste its readable text.") from exc


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
        if req.source_ref is not None:
            result["source_ref"] = req.source_ref.model_dump()
        return RecommendResponse(result=result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logging.getLogger(__name__).exception("Advisor failed")
        raise HTTPException(status_code=500, detail="Advisor failed unexpectedly. Check server logs.") from exc


@app.post("/api/history/{roadmap_id}/events")
def add_history(req: HistoryBatch, roadmap_id: str = RoadmapId) -> Dict[str, int]:
    conn = history_store.connect()
    try:
        return {"stored": history_store.add_events(conn, roadmap_id, [e.model_dump() for e in req.events])}
    finally:
        conn.close()


@app.get("/api/history/{roadmap_id}")
def get_history(roadmap_id: str = RoadmapId, q: str = "", item_id: str = "", event_type: str = "", origin_type: str = "",
                actor_id: str = "", field: str = "", important: bool = False, since: str = "", until: str = "",
                sort: str = "desc", offset: int = 0, limit: int = 50) -> Dict[str, Any]:
    filters = {"q": q.strip(), "item_id": item_id, "event_type": event_type, "origin_type": origin_type, "actor_id": actor_id,
               "field": field, "important": important, "since": since, "until": until, "sort": sort}
    conn = history_store.connect()
    try:
        return history_store.query(conn, roadmap_id, filters, max(0, offset), _clamp(limit, 0, 200))
    finally:
        conn.close()


@app.delete("/api/history/{roadmap_id}")
def delete_history(roadmap_id: str = RoadmapId) -> Dict[str, int]:
    """Called when a roadmap is deleted, so its change log does not outlive it."""
    conn = history_store.connect()
    try:
        return {"deleted": history_store.delete_roadmap(conn, roadmap_id)}
    finally:
        conn.close()


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
