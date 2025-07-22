# config.py

import os

# Base constants
MINI_DATASET = 2
COMPOUND_MINI_DATASET = 4
UNIFORMITY_CV_THRESHOLD = 0.30
THRESHOLD_SIG = 0.95

# Column definitions
CATEGORICAL_COLUMNS = ['Age', 'BusinessTravel', 'Department', 'EducationField', 'Gender', 'MaritalStatus']
ORDINAL_COLUMNS = ['Age']

# Dataset paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, 'original_datasets', 'HR_Employee_Attribution.csv')

# Type metadata
TYPE_METADATA = {
    "Dominance":            ("SinglePoint",     "#1f77b4", "*"),
    "Outstanding One":      ("SinglePoint",     "#1f77b4", "↑"),
    "Outstanding Twin":     ("SinglePoint",     "#1f77b4", "⇈"),
    "Uniformity":           ("SinglePoint",     "#1f77b4", "="),
    "Change Point":         ("SingleShape",     "#ff7f0e", "↷"),
    "Trend":                ("SingleShape",     "#ff7f0e", "/"),
    "Evenness":             ("SingleShape",     "#ff7f0e", "="),
    "Correlation":          ("Compound",        "#2ca02c", "∞"),
    "Cross-measure Correlation": ("Compound",   "#2ca02c", "⊗"),
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