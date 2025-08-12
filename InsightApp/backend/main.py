from __future__ import annotations

import json
import logging
from typing import List, Dict, Any, Optional
import inspect

import numpy as np
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ==== Your domain modules (unchanged) ====
from spilt_collection import split_collection_by_filters, get_value_sequences
from polygon_split import recursive_polygon_split
from insight_engine import generate_insights
from insight_collector import (
    group_insights,
    compute_collection_similarities,
    compute_distance_matrix,
    compute_mds_positions,
    avoid_overlap,
)
from insight_categorical_similarity import (
    intra_coupled_similarity,
    inter_coupled_similarity,
    compute_insight_positions,
)

# ==== Dynamic dataset/config ====
import config  # uses the new upload-first config.py

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # lock this down in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# ========= Runtime cache & status =========
_cached_insights: Optional[List[Dict[str, Any]]] = None
_cached_collections: Optional[List[Dict[str, Any]]] = None
_cached_intra_similarity: Optional[Dict[str, Any]] = None
_cached_inter_similarity: Optional[Dict[str, Any]] = None

# Simple processing state for the current dataset
_state = {
    "stage": "idle",          # idle | processing | ready | error
    "message": "Waiting for upload",
    "error": None,
    "rows": 0,
    "cols": 0,
}

# ======== Helpers ========
def _reset_runtime_cache() -> None:
    global _cached_insights, _cached_collections, _cached_intra_similarity, _cached_inter_similarity
    _cached_insights = None
    _cached_collections = None
    _cached_intra_similarity = None
    _cached_inter_similarity = None

def _require_ready_dataset() -> None:
    if config.DATAFRAME is None:
        raise HTTPException(status_code=409, detail="No dataset uploaded yet. Upload a CSV first.")
    if config.CATEGORICAL_COLUMNS is None:
        raise HTTPException(status_code=409, detail="Columns not set. Submit categorical & ordinal selections.")

def _convert_numpy(obj):
    if isinstance(obj, dict):
        return { _convert_numpy(k): _convert_numpy(v) for k, v in obj.items() }
    if isinstance(obj, list):
        return [ _convert_numpy(i) for i in obj ]
    if isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    if isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    return obj

def to_jsonable(x):
    if isinstance(x, pd.DataFrame):
        return x.to_dict(orient="records")
    if isinstance(x, pd.Series):
        return x.to_dict()
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.floating,)):
        return float(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    if isinstance(x, (list, tuple)):
        return [to_jsonable(v) for v in x]
    if isinstance(x, dict):
        return {k: to_jsonable(v) for k, v in x.items()}
    return x

def _df_preview(df: pd.DataFrame, n: int = 3):
    return df.head(n).to_dict(orient="records")

# Try to call generate_insights with df & selections if supported
def _run_generate_insights(df: pd.DataFrame, categorical: List[str], ordinal: List[str]):
    sig = inspect.signature(generate_insights)
    kwargs = {}
    if "df" in sig.parameters:
        kwargs["df"] = df
    if "categorical" in sig.parameters:
        kwargs["categorical"] = categorical
    if "ordinal" in sig.parameters:
        kwargs["ordinal"] = ordinal
    if kwargs:
        return generate_insights(**kwargs)  # type: ignore[arg-type]
    # Fallback to old behavior (maybe generate_insights imports from config internally)
    return generate_insights()

def _process_pipeline():
    """
    Heavy lifting: compute insights & collections for the current (uploaded) dataset.
    Runs in a background task so /set-columns returns immediately.
    """
    global _cached_insights, _cached_collections, _cached_intra_similarity, _cached_inter_similarity

    try:
        _state.update({"stage": "processing", "message": "Processing uploaded dataset...", "error": None})

        df = config.DATAFRAME
        categorical = config.CATEGORICAL_COLUMNS or []
        ordinal = config.ORDINAL_COLUMNS or []
        if df is None:
            raise RuntimeError("DATAFRAME is None during processing")

        # 1) insights
        insights = _run_generate_insights(df, categorical, ordinal)
        # 2) collections
        collections = group_insights(insights)

        # Convert any pandas objects inside insights for frontend
        json_ready_insights = []
        for ins in insights:
            ins_copy = dict(ins)
            if hasattr(ins_copy.get("modified_dataset", None), "to_dict"):
                ins_copy["modified_dataset"] = ins_copy["modified_dataset"].to_dict(orient="records")
            json_ready_insights.append(ins_copy)

        # Pre-compute collection positions/layout
        similarities = compute_collection_similarities(collections)
        positions = compute_mds_positions(similarities, len(collections))
        scores = [col["total_score"] for col in collections]
        positions = avoid_overlap(positions, scores)
        for i, pos in enumerate(positions):
            collections[i]["position"] = pos

        # Optionally precompute categorical similarities
        _cached_intra_similarity = intra_coupled_similarity()
        _cached_inter_similarity = inter_coupled_similarity()

        _cached_insights = json_ready_insights
        _cached_collections = to_jsonable(collections)

        _state.update({"stage": "ready", "message": "Processing complete", "error": None})
        logger.info("✅ Pipeline processing complete.")
    except Exception as e:
        _state.update({"stage": "error", "message": "Processing failed", "error": str(e)})
        logger.exception("❌ Processing failed: %s", e)

# ========= Schemas =========
class ColumnSelections(BaseModel):
    categorical: List[str]
    ordinal: List[str]

class SectionRequest(BaseModel):
    collection_id: int  # or str, depending on your id type
    filter_sequence: list

class InsightListRequest(BaseModel):
    insights: List[Dict[str, Any]]

# ========= Upload & configure =========
@app.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    try:
        # Read directly from stream
        df = pd.read_csv(file.file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read CSV: {e}")

    config.set_uploaded_dataset(df)
    _reset_runtime_cache()

    _state.update({
        "stage": "idle",
        "message": "File uploaded. Waiting for column selections.",
        "error": None,
        "rows": len(df),
        "cols": len(df.columns),
    })

    cols = list(df.columns)
    dtypes = {c: str(df[c].dtype) for c in cols}
    sample = _df_preview(df, n=3)

    return {
        "ok": True,
        "columns": cols,
        "dtypes": dtypes,
        "preview": sample,
        "rows": len(df),
    }

@app.post("/set-columns")
async def set_columns(sel: ColumnSelections, background: BackgroundTasks):
    if config.DATAFRAME is None:
        raise HTTPException(status_code=409, detail="No CSV uploaded yet.")

    # Save the selections
    config.set_column_selections(sel.categorical, sel.ordinal)
    logger.info("Received categorical=%s ordinal=%s", sel.categorical, sel.ordinal)

    # Kick off pipeline in the background to avoid blocking the request
    _state.update({"stage": "processing", "message": "Starting processing...", "error": None})
    background.add_task(_process_pipeline)

    return {"ok": True, "message": "Columns saved. Processing started."}

@app.get("/api/status")
def get_status():
    """
    Simple status endpoint the frontend can poll if needed.
    stage: idle | processing | ready | error
    """
    return JSONResponse(content=_state)

# ========= Data / Insights APIs =========
@app.get("/api/value_sequence")
def value_sequence():
    _require_ready_dataset()
    sequences = get_value_sequences()
    return JSONResponse(content=sequences)

@app.get("/api/insights")
def get_insights():
    _require_ready_dataset()
    if _cached_insights is None:
        raise HTTPException(status_code=202, detail="Processing not finished yet.")
    return JSONResponse(content=_cached_insights)

@app.get("/api/insight_collections")
def get_insight_collections():
    _require_ready_dataset()
    if _cached_collections is None:
        raise HTTPException(status_code=202, detail="Processing not finished yet.")
    return JSONResponse(content=_cached_collections)

@app.get("/api/collection_similarity")
def get_collection_similarity():
    _require_ready_dataset()
    if _cached_collections is None:
        raise HTTPException(status_code=202, detail="Processing not finished yet.")
    similarities = compute_collection_similarities(_cached_collections)
    return JSONResponse(content=similarities)

@app.get("/api/distance_matrix")
def get_similarity_matrix():
    _require_ready_dataset()
    if _cached_collections is None:
        raise HTTPException(status_code=202, detail="Processing not finished yet.")
    similarities = compute_collection_similarities(_cached_collections)
    distance_matrix = compute_distance_matrix(similarities, len(_cached_collections))
    return JSONResponse(content={"distance_matrix": distance_matrix, "size": len(_cached_collections)})

# ========= Layout/geometry endpoints =========
@app.post("/api/collection_sections")
async def get_collection_sections(req: SectionRequest):
    _require_ready_dataset()
    if _cached_collections is None:
        raise HTTPException(status_code=202, detail="Processing not finished yet.")

    collection = next((c for c in _cached_collections if c["id"] == req.collection_id), None)
    if not collection:
        return JSONResponse(content={"error": "Collection not found"}, status_code=404)

    result = split_collection_by_filters(collection, req.filter_sequence)
    return JSONResponse(content=result)

@app.post("/api/polygon_split")
async def polygon_split(request: Request):
    _require_ready_dataset()
    data = await request.json()
    polygon = data["polygon"]
    section_data = data["section_data"]
    filter_sequence = data["filter_sequence"]
    filter_colors = data["filter_colors"]

    segments, split_lines = recursive_polygon_split(
        polygon,
        section_data,
        filter_sequence,
        filter_colors,
        base_id="root",
    )
    return JSONResponse(content={"segments": segments, "split_lines": split_lines})

@app.post("/api/insight_similarity_layout")
async def insight_similarity_layout(req: InsightListRequest):
    _require_ready_dataset()
    # if not precomputed yet, compute on demand
    intra_mat = _cached_intra_similarity or intra_coupled_similarity()
    inter_mat = _cached_inter_similarity or inter_coupled_similarity()
    result = compute_insight_positions(req.insights, intra_mat, inter_mat)
    return JSONResponse(content=result)

# ========= Similarity (direct) =========
@app.get("/api/intra_coupled_similarity")
def get_intra_coupled_similarity():
    _require_ready_dataset()
    result = _cached_intra_similarity or intra_coupled_similarity()
    return JSONResponse(content=_convert_numpy(result))

@app.get("/api/inter_coupled_similarity")
def get_inter_similarity():
    _require_ready_dataset()
    result = _cached_inter_similarity or inter_coupled_similarity()
    return JSONResponse(content=_convert_numpy(result))

# ========= Admin/utility =========
@app.post("/api/reset")
def reset_backend():
    config.clear_all()
    _reset_runtime_cache()
    _state.update({"stage": "idle", "message": "Reset. Upload a CSV to begin.", "error": None, "rows": 0, "cols": 0})
    return {"ok": True, "message": "Reset complete"}
