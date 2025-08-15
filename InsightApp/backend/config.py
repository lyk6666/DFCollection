# config.py
from __future__ import annotations
from typing import Optional, List
import pandas as pd

# Base constants
MINI_DATASET = 3
COMPOUND_MINI_DATASET = 3
UNIFORMITY_CV_THRESHOLD = 0.30
THRESHOLD_SIG = 0.95


# # Column definitions
# CATEGORICAL_COLUMNS = ['Age', 'BusinessTravel', 'Department', 'EducationField', 'Gender', 'MaritalStatus']
# ORDINAL_COLUMNS = ['Age']

# # Dataset paths
# BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# CSV_PATH = os.path.join(BASE_DIR, 'original_datasets', 'HR_Employee_Attribution.csv')


"""
Central place to hold the current dataset and user selections,
replacing the old hard-coded CSV_PATH. Everything starts as None.
"""

# === Current dataset & selections (mutable globals) ===
DATAFRAME: Optional[pd.DataFrame] = None
CATEGORICAL_COLUMNS: Optional[List[str]] = None
ORDINAL_COLUMNS: Optional[List[str]] = None

# Kept only for legacy compatibility; always None in upload mode.
CSV_PATH: Optional[str] = None

def set_uploaded_dataset(df: pd.DataFrame) -> None:
    """
    Store the uploaded dataset in memory and clear previous selections.
    """
    global DATAFRAME, CATEGORICAL_COLUMNS, ORDINAL_COLUMNS
    DATAFRAME = df
    CATEGORICAL_COLUMNS = None
    ORDINAL_COLUMNS = None

def set_column_selections(categorical: List[str], ordinal: List[str]) -> None:
    """
    Save user selections for categorical and ordinal columns.
    """
    global CATEGORICAL_COLUMNS, ORDINAL_COLUMNS
    CATEGORICAL_COLUMNS = categorical
    ORDINAL_COLUMNS = ordinal

def clear_all() -> None:
    """
    Reset everything to 'no upload' state.
    """
    global DATAFRAME, CATEGORICAL_COLUMNS, ORDINAL_COLUMNS
    DATAFRAME = None
    CATEGORICAL_COLUMNS = None
    ORDINAL_COLUMNS = None


# Type metadata
TYPE_METADATA = {
    "Dominance":            ("SinglePoint",     "#1f77b4", "*"),
    # "Outstanding One":      ("SinglePoint",     "#1f77b4", "↑"),
    "Outstanding Twin":     ("SinglePoint",     "#1f77b4", "⇈"),
    "Evenness":           ("SinglePoint",     "#1f77b4", "="),
    "Change Point":         ("SingleShape",     "#ff7f0e", "↷"),
    "Trend":                ("SingleShape",     "#ff7f0e", "/"),
    # "Evenness":             ("SingleShape",     "#ff7f0e", "="),
    "Temporal Correlation":          ("Compound",        "#2ca02c", "∞"),
    "Correlation": ("Compound",   "#2ca02c", "⊗"),
}

# Weights for similarity components (can be adjusted centrally)
W_FILTER = 0.3
W_MEASURE = 0.2
W_BREAKDOWN = 0.2
W_TYPE = 0.2
W_SCORE = 0.1

# Circle radius limits for layout sizing
MIN_RADIUS = 0.02
MAX_RADIUS = 0.07

# Padding for overlap avoidance
OVERLAP_PADDING = 0.02
EDGE_BUFFER = 0.01

# MDS random state (for reproducibility)
MDS_SEED = 42