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
from polygonConstruction.spilt_collection import split_collection_by_filters, get_value_sequences
from polygonConstruction.polygon_split import recursive_polygon_split
from insightExtraction.insight_engine import generate_insights
from insightCollection.insight_collector import (
    group_insights,
    compute_collection_similarities,
    compute_distance_matrix,
    compute_mds_positions,
    avoid_overlap,
)
from insightSimilarity.insight_categorical_similarity import (
    intra_coupled_similarity,
    inter_coupled_similarity,
    compute_insight_positions,
)
import config
from pathlib import Path

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

# ========= Insight disk store (optional) =========
INSIGHT_STORE_DIR = Path("./precomputed_insights")
def _get_store_file() -> Path:
    """Use config.PRECOMPUTED_INSIGHTS_NAME if present, else 'insights'."""
    base = getattr(config, "PRECOMPUTED_INSIGHTS_NAME", "insights")
    safe_base = str(base).strip() or "insights"
    return INSIGHT_STORE_DIR / f"{safe_base}.json"

def _ensure_store_dir() -> None:
    INSIGHT_STORE_DIR.mkdir(parents=True, exist_ok=True)

def _save_insights_to_disk(insights: List[Dict[str, Any]]) -> None:
    """Best-effort write; never breaks the request if it fails."""
    try:
        _ensure_store_dir()
        file_path = _get_store_file()
        with file_path.open("w", encoding="utf-8") as f:
            json.dump(insights, f, ensure_ascii=False)
        logger.info("Insights persisted to %s", file_path)
    except Exception as e:
        logger.warning("Failed to persist insights to disk: %s", e)

def _load_insights_from_disk() -> Optional[List[Dict[str, Any]]]:
    """
    Load precomputed insights from ./precomputed_insights/<PRECOMPUTED_INSIGHTS_NAME>.json.
    Returns None if the file is missing or unreadable.
    """
    INSIGHT_STORE_DIR = Path("./precomputed_insights")
    base = getattr(config, "PRECOMPUTED_INSIGHTS_NAME", "insights")
    safe_base = str(base).strip() or "insights"
    file_path = INSIGHT_STORE_DIR / f"{safe_base}.json"

    if file_path.exists():
        try:
            with file_path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("Failed to read insights from disk (%s): %s", file_path, e)
    return None

# Simple processing state for the current dataset
_state = {
    "stage": "idle",          # idle | processing | ready | error
    "message": "Waiting for upload",
    "error": None,
    "rows": 0,
    "cols": 0,
}

# ========= Aggregation helpers/config =========
# Canonical names to use in pandas and downstream:
# - We accept "SUM, MAX, MIN, AVG, COUNT" from frontend, case-insensitive
# - Map to pandas-friendly names: sum, max, min, mean, count
_AGG_CANON = {
    "SUM": "sum",
    "MAX": "max",
    "MIN": "min",
    "AVG": "mean",
    "MEAN": "mean",
    "COUNT": "count",
}
_ALLOWED_FRONT_AGGS = set(_AGG_CANON.keys())

def _canon_agg(agg: str) -> str:
    key = (agg or "").strip().upper()
    if key not in _AGG_CANON:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported aggregation '{agg}'. Allowed: {sorted(_ALLOWED_FRONT_AGGS)}"
        )
    return _AGG_CANON[key]

def _normalize_precomputed_insights(insights: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Ensure fields used as set/dict keys are hashable and shaped as expected by downstream code.
    Currently: make 'measure' hashable (string or tuple) if it came as a list.
    """
    normalized = []
    for ins in insights:
        d = dict(ins)
        m = d.get("measure")
        if isinstance(m, list):
            d["measure"] = tuple(m)
        normalized.append(d)
    return normalized

def _normalize_measure_aggs(raw: Any, numerical_cols: List[str]) -> Dict[str, str]:
    """
    Accepts multiple shapes and returns a mapping: {col_name: canonical_agg}
    Supported shapes:
      - dict: {"sales":"SUM", "profit":"AVG"}
      - list of pairs: [["sales","SUM"], ["profit","AVG"]]
      - list of objects: [{"column":"sales","agg":"SUM"}, ...]
      - None -> default SUM for all numerical_cols
    Non-numerical columns are ignored; invalid aggs raise HTTPException.
    """
    # Default: SUM if nothing provided
    if raw is None:
        return {col: _AGG_CANON["SUM"] for col in numerical_cols}

    out: Dict[str, str] = {}

    if isinstance(raw, dict):
        for col, agg in raw.items():
            if col in numerical_cols:
                out[col] = _canon_agg(str(agg))
        for col in numerical_cols:
            out.setdefault(col, _AGG_CANON["SUM"])
        return out

    if isinstance(raw, list):
        for entry in raw:
            if isinstance(entry, (list, tuple)) and len(entry) == 2:
                col, agg = entry
                if col in numerical_cols:
                    out[col] = _canon_agg(str(agg))
            elif isinstance(entry, dict) and "column" in entry and "agg" in entry:
                col = entry["column"]
                agg = entry["agg"]
                if col in numerical_cols:
                    out[col] = _canon_agg(str(agg))
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid measure_aggs list entry. Expect [col, agg] or {column, agg}."
                )
        for col in numerical_cols:
            out.setdefault(col, _AGG_CANON["SUM"])
        return out

    raise HTTPException(status_code=400, detail="Invalid measure_aggs payload type.")

# ======== Helpers ========
def _reset_runtime_cache() -> None:
    global _cached_insights, _cached_collections, _cached_intra_similarity, _cached_inter_similarity
    _cached_insights = None
    _cached_collections = None
    _cached_intra_similarity = None
    _cached_inter_similarity = None

def _require_ready_dataset() -> None:
    """
    Ensure a dataset is uploaded and column selections (including numerical) are set.
    Uses getattr for backward compatibility if config doesn't yet define MEASURE_AGGS.
    """
    if getattr(config, "DATAFRAME", None) is None:
        raise HTTPException(status_code=409, detail="No dataset uploaded yet. Upload a CSV first.")

    categorical_set = getattr(config, "CATEGORICAL_COLUMNS", None)
    ordinal_set = getattr(config, "ORDINAL_COLUMNS", None)
    numerical_set = getattr(config, "NUMERICAL_COLUMNS", None)

    if categorical_set is None or ordinal_set is None or numerical_set is None:
        raise HTTPException(
            status_code=409,
            detail="Columns not set. Submit categorical, ordinal & numerical selections."
        )

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

def _run_generate_insights(
    df: pd.DataFrame,
    categorical: List[str],
    ordinal: List[str],
    numerical: List[str],
    measure_aggs: Dict[str, str],
):
    sig = inspect.signature(generate_insights)
    kwargs: Dict[str, Any] = {}
    if "df" in sig.parameters:
        kwargs["df"] = df
    if "categorical" in sig.parameters:
        kwargs["categorical"] = categorical
    if "ordinal" in sig.parameters:
        kwargs["ordinal"] = ordinal
    if "numerical" in sig.parameters:
        kwargs["numerical"] = numerical
    if "measure_aggs" in sig.parameters:
        kwargs["measure_aggs"] = measure_aggs
    elif "numerical_aggs" in sig.parameters:
        kwargs["numerical_aggs"] = measure_aggs

    if kwargs:
        return generate_insights(**kwargs)

    return generate_insights()

def _process_pipeline():
    """
    Heavy lifting: compute insights & collections for the current (uploaded) dataset.
    Runs in a background task so /set-columns returns immediately.

    Modes:
      - LOAD=False, STORE=False: original behavior
      - LOAD=False, STORE=True: original behavior + persist to disk
      - LOAD=True: load precomputed insights from disk, DO NOT call generate_insights,
                   then compute collections/positions/similarities as usual
    """
    global _cached_insights, _cached_collections, _cached_intra_similarity, _cached_inter_similarity

    try:
        _state.update({"stage": "processing", "message": "Processing uploaded dataset...", "error": None})

        load_from_disk = bool(getattr(config, "LOAD_INSIGHTS_FROM_DISK", False))
        store_to_disk = bool(getattr(config, "STORE_INSIGHTS_TO_DISK", False))
        if load_from_disk and store_to_disk:
            raise HTTPException(
                status_code=400,
                detail="Both LOAD_INSIGHTS_FROM_DISK and STORE_INSIGHTS_TO_DISK are True. They are mutually exclusive."
            )

        # ===== LOAD mode: use precomputed insights, skip generation =====
        if load_from_disk:
            disk_insights = _load_insights_from_disk()
            if disk_insights is None:
                name = getattr(config, "PRECOMPUTED_INSIGHTS_NAME", "insights")
                _state.update({
                    "stage": "error",
                    "message": f"Precomputed insights '{name}' not found on disk.",
                    "error": "Missing precomputed insights file",
                })
                logger.error("LOAD mode enabled but no precomputed insights found.")
                return

            # Build collections/layout from precomputed insights
            insights = _normalize_precomputed_insights(disk_insights)
            collections = group_insights(insights)

            similarities = compute_collection_similarities(collections)
            positions = compute_mds_positions(similarities, len(collections))
            scores = [col["total_score"] for col in collections]
            positions = avoid_overlap(positions, scores)
            for i, pos in enumerate(positions):
                collections[i]["position"] = pos

            _cached_intra_similarity = intra_coupled_similarity()
            _cached_inter_similarity = inter_coupled_similarity()

            _cached_insights = insights
            _cached_collections = to_jsonable(collections)

            name = getattr(config, "PRECOMPUTED_INSIGHTS_NAME", "insights")
            _state.update({"stage": "ready", "message": f"Loaded precomputed insights '{name}' from disk", "error": None})
            logger.info("✅ Loaded precomputed insights '%s' from disk. Skipping generate_insights().", name)
            return

        # ===== Normal compute path (LOAD is False) =====
        df = config.DATAFRAME
        categorical = getattr(config, "CATEGORICAL_COLUMNS", []) or []
        ordinal = getattr(config, "ORDINAL_COLUMNS", []) or []
        numerical = getattr(config, "NUMERICAL_COLUMNS", []) or []
        if df is None:
            raise RuntimeError("DATAFRAME is None during processing")

        cfg_aggs = getattr(config, "MEASURE_AGGS", None)
        measure_aggs = _normalize_measure_aggs(cfg_aggs, numerical)

        # 1) Generate insights
        insights = _run_generate_insights(df, categorical, ordinal, numerical, measure_aggs)

        json_ready_insights: List[Dict[str, Any]] = []
        for ins in insights:
            ins_copy = dict(ins)
            if hasattr(ins_copy.get("modified_dataset", None), "to_dict"):
                ins_copy["modified_dataset"] = ins_copy["modified_dataset"].to_dict(orient="records")
            json_ready_insights.append(ins_copy)

        # 2) Build collections/layout from insights
        collections = group_insights(json_ready_insights)
        similarities = compute_collection_similarities(collections)
        positions = compute_mds_positions(similarities, len(collections))
        scores = [col["total_score"] for col in collections]
        positions = avoid_overlap(positions, scores)
        for i, pos in enumerate(positions):
            collections[i]["position"] = pos

        _cached_intra_similarity = intra_coupled_similarity()
        _cached_inter_similarity = inter_coupled_similarity()

        _cached_insights = json_ready_insights
        _cached_collections = to_jsonable(collections)

        # STORE mode → persist computed insights to disk, prepare for precomputed version
        if store_to_disk:
            _save_insights_to_disk(_cached_insights)

        _state.update({"stage": "ready", "message": "Processing complete", "error": None})
        logger.info("✅ Pipeline processing complete.")
    except HTTPException:
        raise
    except Exception as e:
        _state.update({"stage": "error", "message": "Processing failed", "error": str(e)})
        logger.exception("❌ Processing failed: %s", e)

# ========= Schemas =========
class ColumnSelections(BaseModel):
    categorical: List[str]
    ordinal: List[str]
    numerical: List[str]
    measure_aggs: Optional[Any] = None

class SectionRequest(BaseModel):
    collection_id: int
    filter_sequence: list

class InsightListRequest(BaseModel):
    insights: List[Dict[str, Any]]

# ========= Upload & configure =========
@app.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    try:
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
    if getattr(config, "DATAFRAME", None) is None:
        raise HTTPException(status_code=409, detail="No CSV uploaded yet.")

    numerical_cols = sel.numerical or []
    norm_aggs = _normalize_measure_aggs(sel.measure_aggs, numerical_cols)

    # Save the selections (introspect for backward compatibility)
    set_cols_fn = getattr(config, "set_column_selections", None)
    if set_cols_fn is None or not callable(set_cols_fn):
        raise HTTPException(status_code=500, detail="config.set_column_selections() not found.")

    sig = inspect.signature(set_cols_fn)
    kwargs: Dict[str, Any] = {}
    if "categorical" in sig.parameters:
        kwargs["categorical"] = sel.categorical
    if "ordinal" in sig.parameters:
        kwargs["ordinal"] = sel.ordinal
    if "numerical" in sig.parameters:
        kwargs["numerical"] = sel.numerical
    # Pass measure_aggs under whatever name the config expects
    if "measure_aggs" in sig.parameters:
        kwargs["measure_aggs"] = norm_aggs
    elif "numerical_aggs" in sig.parameters:
        kwargs["numerical_aggs"] = norm_aggs

    try:
        if kwargs:
            set_cols_fn(**kwargs)
        else:
            # Fall back to old (categorical, ordinal)
            set_cols_fn(sel.categorical, sel.ordinal)  # type: ignore[misc]
    except TypeError:
        # As an absolute fallback, try (categorical, ordinal, numerical)
        set_cols_fn(sel.categorical, sel.ordinal, sel.numerical)  # type: ignore[misc]

    # If config has a MEASURE_AGGS attribute, store the normalized map
    try:
        if hasattr(config, "MEASURE_AGGS"):
            setattr(config, "MEASURE_AGGS", norm_aggs)
    except Exception:
        # Non-fatal; config may be immutable
        pass

    logger.info(
        "Received categorical=%s ordinal=%s numerical=%s measure_aggs=%s",
        sel.categorical, sel.ordinal, sel.numerical, norm_aggs
    )

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
