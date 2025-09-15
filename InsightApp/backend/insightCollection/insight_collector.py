from collections import defaultdict
import numpy as np
from sklearn.manifold import MDS
import math
from sklearn.preprocessing import MinMaxScaler
from config import R_BETA
import config  # <-- add this import

EDGE_BUFFER = 0.01

# --- dynamic radius helpers (depend on current categorical selection) ---

def _num_categories():
    """
    Return count of categorical columns currently configured in config.
    Falls back to 1 so min<max even before columns are set.
    """
    try:
        cats = getattr(config, "CATEGORICAL_COLUMNS", None) or []
        n = len(cats)
        return n if n > 0 else 1
    except Exception:
        return 1

def _radius_bounds():
    """
    Compute (min_radius, max_radius) from R_BETA and N = #categorical columns.
    Adjust to your taste; guarantees max > min even when N == 1.
    """
    n = _num_categories()      
    max_r = 0.4 / n * R_BETA
    min_r = max_r * 0.25
    return min_r, max_r


def group_insights(insights):

    def filter_key(insight):
        return frozenset(k for k, v in insight['subspace'].items() if v != '*')

    grouped = defaultdict(list)
    for insight in insights:
        key = filter_key(insight)
        grouped[key].append(insight)

    insight_collections = []

    id = 0

    for filter_cols, group in grouped.items():
        total_score = sum(ins['score'] for ins in group)

        breakdown_set = set()
        measure_set = set()
        type_set = set()

        for ins in group:
            breakdown_set.add(ins['breakdown'])
            measure_set.add(ins['measure'])
            type_set.add(ins['type'])

        id += 1

        insight_collections.append({
            "filter_set": list(filter_cols),
            "total_score": total_score,
            "breakdown_set": list(breakdown_set),
            "measure_set": list(measure_set),
            "type_set": list(type_set),
            "insights": group,
            "id": id
        })

    return insight_collections

def size_similarity(a, b):
    a, b = set(a), set(b)
    n1, n2 = len(a), len(b)
    if n1 == 0 and n2 == 0:
        return 1.0
    if n1 == 0 or n2 == 0:
        return 0.0
    return min(n1, n2) / max(n1, n2)


def overlap_coefficient(a, b):
    a, b = set(a), set(b)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def hybrid_similarity(a, b, beta=0.5):
    """
    beta ∈ [0,1]: weight on size similarity vs. overlap coefficient.
    beta=0.5 gives equal weight.
    """
    ss = size_similarity(a, b)
    oc = overlap_coefficient(a, b)
    return beta * ss + (1 - beta) * oc


def compute_collection_similarities(collections):
    # Config now only needs W_FILTER, W_TYPE, W_SCORE and the betas:
    #   BETA_FILTER, BETA_TYPE  (defaults provided if absent)
    from config import W_FILTER, W_TYPE
    try:
        from config import BETA_FILTER, BETA_TYPE
    except Exception:
        BETA_FILTER, BETA_TYPE = 0.5, 0.5

    similarities = []

    for i in range(len(collections)):
        for j in range(i + 1, len(collections)):
            col1 = collections[i]
            col2 = collections[j]

            # HYBRID similarities for "subspace/filter" and "type"
            sim_filter = hybrid_similarity(
                col1.get("filter_set", []),
                col2.get("filter_set", []),
                beta=BETA_FILTER,
            )
            sim_type = hybrid_similarity(
                col1.get("type_set", []),
                col2.get("type_set", []),
                beta=BETA_TYPE,
            )

            # Total score similarity (assumes score ∈ [0,1])
            score1 = col1.get("total_score")
            score2 = col2.get("total_score")
            if score1 is None or score2 is None:
                score_sim = 0.0
            else:
                score_sim = 1 - abs(score1 - score2)
                # clamp to [0,1] for safety
                if score_sim < 0:
                    score_sim = 0.0
                elif score_sim > 1:
                    score_sim = 1.0

            # Weighted combination (measure/breakdown removed)
            weighted_similarity = (
                W_FILTER * sim_filter +
                W_TYPE * sim_type +
                (1 - W_FILTER - W_TYPE) * score_sim
            )

            similarities.append({
                "collection_1": i,
                "collection_2": j,
                "similarity": weighted_similarity,
                "components": {
                    "filter_hybrid": sim_filter,
                    "type_hybrid": sim_type,
                    "score_sim": score_sim,
                },
            })

    return similarities


def compute_distance_matrix(similarities, num_collections):
    # Initialize with 1.0 distances (max distance by default)
    distance_matrix = np.ones((num_collections, num_collections))

    for sim in similarities:
        i = sim["collection_1"]
        j = sim["collection_2"]
        distance = 1.0 - sim["similarity"]
        distance_matrix[i][j] = distance
        distance_matrix[j][i] = distance  # symmetric

    # Distance to self is 0
    np.fill_diagonal(distance_matrix, 0)

    return distance_matrix.tolist()  # for JSON serialization

def compute_mds_positions(similarities, num_collections):
    # Step 1: Build full distance matrix
    distance_matrix = np.ones((num_collections, num_collections))
    for sim in similarities:
        i, j = sim["collection_1"], sim["collection_2"]
        dist = 1.0 - sim["similarity"]
        distance_matrix[i][j] = dist
        distance_matrix[j][i] = dist
    np.fill_diagonal(distance_matrix, 0)

    # Step 2: Apply MDS
    mds = MDS(n_components=2, dissimilarity="precomputed", random_state=42, n_init=4)
    coords = mds.fit_transform(distance_matrix)

    # Step 3: Normalize to [0, 1]
    x = coords[:, 0]
    y = coords[:, 1]
    x_norm = (x - x.min()) / (x.max() - x.min())
    y_norm = (y - y.min()) / (y.max() - y.min())

    return [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_norm, y_norm)]

def avoid_overlap(positions, scores, padding=0):

    edge_buffer = EDGE_BUFFER

    min_r, max_r = _radius_bounds()
    size_scale = MinMaxScaler(feature_range=(min_r, max_r))
    radii = size_scale.fit_transform(np.array(scores).reshape(-1, 1)).flatten()

    updated = [{"x": p["x"], "y": p["y"], "r": r} for p, r in zip(positions, radii)]

    for p in updated:
        p["x"] = min(max(edge_buffer + p["r"], p["x"]), 1.0 - edge_buffer - p["r"])
        p["y"] = min(max(edge_buffer + p["r"], p["y"]), 1.0 - edge_buffer - p["r"])

    def overlaps(a, b):
        dx = a["x"] - b["x"]
        dy = a["y"] - b["y"]
        dist = math.hypot(dx, dy)
        return dist < (a["r"] + b["r"] + padding)

    def movement_mask(p, dx, dy):
        mask_x = 1.0
        mask_y = 1.0

        new_x = p["x"] + dx
        new_y = p["y"] + dy

        if new_x - p["r"] < edge_buffer or new_x + p["r"] > 1.0 - edge_buffer:
            mask_x = 0.0

        if new_y - p["r"] < edge_buffer or new_y + p["r"] > 1.0 - edge_buffer:
            mask_y = 0.0

        return mask_x, mask_y

    max_iters = 500
    for _ in range(max_iters):
        moved = False
        for i in range(len(updated)):
            for j in range(i + 1, len(updated)):
                a, b = updated[i], updated[j]
                if overlaps(a, b):
                    dx = a["x"] - b["x"]
                    dy = a["y"] - b["y"]
                    dist = math.hypot(dx, dy) or 0.001
                    shift = (a["r"] + b["r"] + padding - dist)

                    move_x = shift * dx / dist
                    move_y = shift * dy / dist

                    ax_mask, ay_mask = movement_mask(a, move_x, move_y)
                    bx_mask, by_mask = movement_mask(b, -move_x, -move_y)

                    a["x"] += 0.5 * move_x * ax_mask
                    a["y"] += 0.5 * move_y * ay_mask
                    b["x"] -= 0.5 * move_x * bx_mask
                    b["y"] -= 0.5 * move_y * by_mask

                    moved = True
        if not moved:
            break

    return [{"x": p["x"], "y": p["y"], "r": p["r"]} for p in updated]
