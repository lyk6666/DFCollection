from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from spilt_collection import split_collection_by_filters

import numpy as np

from insight_engine import generate_insights
from insight_collector import (
    group_insights,
    compute_collection_similarities,
    compute_distance_matrix,
    compute_mds_positions,
    avoid_overlap
)

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from polygon_split import recursive_polygon_split

# Import your function here:
from insight_categorical_similarity import intra_coupled_similarity
from insight_categorical_similarity import inter_coupled_similarity

from spilt_collection import get_value_sequences

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory cache
_cached_insights = None
_cached_collections = None

# Add these global cache variables at the top
_cached_intra_similarity = None
_cached_inter_similarity = None

# Create caching access functions

def get_cached_intra_similarity():
    global _cached_intra_similarity
    if _cached_intra_similarity is None:
        _cached_intra_similarity = intra_coupled_similarity()
    return _cached_intra_similarity

def get_cached_inter_similarity():
    global _cached_inter_similarity
    if _cached_inter_similarity is None:
        _cached_inter_similarity = inter_coupled_similarity()
    return _cached_inter_similarity

def get_cached_insights():
    global _cached_insights
    if _cached_insights is None:
        _cached_insights = generate_insights()
    return _cached_insights

def get_cached_collections():
    global _cached_collections
    if _cached_collections is None:
        insights = get_cached_insights()
        _cached_collections = group_insights(insights)
    return _cached_collections

def serialize_similarity_result(attribute_distributions):
    serialized = {}
    for attr, matrix in attribute_distributions.items():
        serialized[attr] = {}
        for (val1, val2), sim in matrix.items():
            key = f"{val1}|||{val2}"  # safely serialize tuple to string
            serialized[attr][key] = sim
    return serialized

def convert_numpy(obj):
    if isinstance(obj, dict):
        return {convert_numpy(k): convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy(i) for i in obj]
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    else:
        return obj

@app.get("/api/intra_coupled_similarity")
def get_intra_coupled_similarity():
    result = get_cached_intra_similarity()  # Use cached version
    result_clean = convert_numpy(result)
    return JSONResponse(content=result_clean)

@app.get("/api/inter_coupled_similarity")
def get_inter_similarity():
    result = get_cached_inter_similarity()  # Use cached version
    result_clean = convert_numpy(result)
    return JSONResponse(content=result_clean)

@app.get("/api/value_sequence")
def value_sequence():
    sequences = get_value_sequences()
    return JSONResponse(content=sequences)

@app.get("/api/insights")
def get_insights():
    insights = get_cached_insights()

    # Convert DataFrames for frontend use
    json_ready = []
    for ins in insights:
        ins_copy = ins.copy()
        if hasattr(ins_copy['modified_dataset'], 'to_dict'):
            ins_copy['modified_dataset'] = ins_copy['modified_dataset'].to_dict(orient='records')
        json_ready.append(ins_copy)

    return JSONResponse(content=json_ready)

@app.get("/api/insight_collections")
def get_insight_collections():
    insights = get_cached_insights()
    collections = group_insights(insights)

    # Convert DataFrames in each insight
    for col in collections:
        for ins in col["insights"]:
            if hasattr(ins["modified_dataset"], "to_dict"):
                ins["modified_dataset"] = ins["modified_dataset"].to_dict(orient="records")

    # Compute MDS layout
    similarities = compute_collection_similarities(collections)
    positions = compute_mds_positions(similarities, len(collections))

    # Avoid overlap using total_score as proxy for size
    scores = [col["total_score"] for col in collections]
    positions = avoid_overlap(positions, scores)

    # Attach position to each collection
    for i, pos in enumerate(positions):
        collections[i]["position"] = pos

    return JSONResponse(content=collections)

@app.get("/api/collection_similarity")
def get_collection_similarity():
    insights = get_cached_insights()
    collections = group_insights(insights)

    for col in collections:
        for ins in col["insights"]:
            if hasattr(ins["modified_dataset"], "to_dict"):
                ins["modified_dataset"] = ins["modified_dataset"].to_dict(orient="records")

    similarities = compute_collection_similarities(collections)
    return JSONResponse(content=similarities)

@app.get("/api/distance_matrix")
def get_similarity_matrix():
    insights = get_cached_insights()
    collections = group_insights(insights)

    similarities = compute_collection_similarities(collections)
    distance_matrix = compute_distance_matrix(similarities, len(collections))

    return JSONResponse(content={
        "distance_matrix": distance_matrix,
        "size": len(collections)
    })

from pydantic import BaseModel

class SectionRequest(BaseModel):
    collection_id: int  # or str, depending on your id type
    filter_sequence: list

@app.post("/api/collection_sections")
async def get_collection_sections(req: SectionRequest):
    # 1. Fetch all insight collections from cache or DB
    collections = get_cached_collections()  # implement or use your cache

    # 2. Find the selected collection by id
    collection = next((c for c in collections if c['id'] == req.collection_id), None)
    if not collection:
        return JSONResponse(content={"error": "Collection not found"}, status_code=404)

    # 3. Pass insights + filter sequence to your section splitter
    result = split_collection_by_filters(collection, req.filter_sequence)

    # 4. Return the data for visualization
    return JSONResponse(content=result)


import logging
import json

logging.basicConfig(level=logging.INFO)  # Ensure info-level logs are shown
logger = logging.getLogger(__name__)     # Optional: module-specific logger

@app.post("/api/polygon_split")
async def polygon_split(request: Request):
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

    return JSONResponse(content={
        "segments": segments,
        "split_lines": split_lines
    })

from insight_categorical_similarity import compute_insight_positions
from pydantic import BaseModel
from typing import List, Dict, Any

class InsightListRequest(BaseModel):
    insights: List[Dict[str, Any]]

@app.post("/api/insight_similarity_layout")
async def insight_similarity_layout(req: InsightListRequest):
    intra_mat = get_cached_intra_similarity()
    inter_mat = get_cached_inter_similarity()
    
    result = compute_insight_positions(req.insights, intra_mat, inter_mat)
    return JSONResponse(content=result)
