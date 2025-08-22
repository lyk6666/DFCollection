# config.py
from __future__ import annotations
from typing import Optional, List, Dict
import pandas as pd

# Base constants
MINI_DATASET = 3
COMPOUND_MINI_DATASET = 3
UNIFORMITY_THRESHOLD = 0.90
THRESHOLD_SIG = 0.95

"""
Central place to hold the current dataset and user selections,
replacing the old hard-coded CSV_PATH. Everything starts as None.
"""

# === Current dataset & selections (mutable globals) ===
DATAFRAME: Optional[pd.DataFrame] = None
CATEGORICAL_COLUMNS: Optional[List[str]] = None
ORDINAL_COLUMNS: Optional[List[str]] = None
NUMERICAL_COLUMNS: Optional[List[str]] = None
MEASURE_AGGS: Optional[Dict[str, str]] = None  # canonicalized in backend; stored here

def set_uploaded_dataset(df: pd.DataFrame) -> None:
    """
    Store the uploaded dataset in memory and clear previous selections.
    """
    global DATAFRAME, CATEGORICAL_COLUMNS, ORDINAL_COLUMNS, NUMERICAL_COLUMNS, MEASURE_AGGS
    DATAFRAME = df
    CATEGORICAL_COLUMNS = None
    ORDINAL_COLUMNS = None
    NUMERICAL_COLUMNS = None
    MEASURE_AGGS = None

def set_column_selections(
    categorical: List[str],
    ordinal: List[str],
    numerical: List[str],
    *,
    measure_aggs: Optional[Dict[str, str]] = None,
    numerical_aggs: Optional[Dict[str, str]] = None,  # alias for compatibility
) -> None:
    """
    Save user selections for columns and (optionally) per-measure aggregation methods.

    Arguments:
        categorical: list of categorical/subspace columns
        ordinal: list of ordinal columns
        numerical: list of measure columns
        measure_aggs: mapping {column: agg_name} where agg_name is canonical (e.g., "sum","mean","max","min","count")
        numerical_aggs: alias for measure_aggs (if caller uses a different param name)

    Note: canonicalization/validation of agg names is handled in the backend before calling this function.
    """
    global CATEGORICAL_COLUMNS, ORDINAL_COLUMNS, NUMERICAL_COLUMNS, MEASURE_AGGS
    CATEGORICAL_COLUMNS = categorical
    ORDINAL_COLUMNS = ordinal
    NUMERICAL_COLUMNS = numerical
    # Prefer explicit measure_aggs, fall back to numerical_aggs if provided
    MEASURE_AGGS = measure_aggs if measure_aggs is not None else numerical_aggs

def clear_all() -> None:
    """
    Reset everything to 'no upload' state.
    """
    global DATAFRAME, CATEGORICAL_COLUMNS, ORDINAL_COLUMNS, NUMERICAL_COLUMNS, MEASURE_AGGS
    DATAFRAME = None
    CATEGORICAL_COLUMNS = None
    ORDINAL_COLUMNS = None
    NUMERICAL_COLUMNS = None
    MEASURE_AGGS = None

# Type metadata
TYPE_METADATA = {
    "Dominance":            ("SinglePoint",     "#1f77b4", "*"),
    "Outstanding Twin":     ("SinglePoint",     "#1f77b4", "⇈"),
    "Evenness":             ("SinglePoint",     "#1f77b4", "="),
    "Change Point":         ("SingleShape",     "#ff7f0e", "↷"),
    "Trend":                ("SingleShape",     "#ff7f0e", "/"),
    "Temporal Correlation": ("Compound",        "#2ca02c", "∞"),
    "Correlation":          ("Compound",        "#2ca02c", "⊗"),
}

# Weights for similarity components (can be adjusted centrally)
W_FILTER = 0.4
W_TYPE = 0.4
# W_SCORE = 0.1
BETA_FILTER = 0.5
BETA_TYPE = 0.5

# Circle radius limits for layout sizing
MIN_RADIUS = 0.04
MAX_RADIUS = 0.1

# Padding for overlap avoidance
OVERLAP_PADDING = 0.01
EDGE_BUFFER = 0.01

# MDS random state (for reproducibility)
MDS_SEED = 42
