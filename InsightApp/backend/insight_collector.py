from collections import defaultdict
from config import (
    W_FILTER, W_MEASURE, W_BREAKDOWN, W_TYPE, W_SCORE,
    MIN_RADIUS, MAX_RADIUS, OVERLAP_PADDING, EDGE_BUFFER, MDS_SEED
)

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

def jaccard_similarity(set1, set2):
    set1, set2 = set(set1), set(set2)
    if not set1 and not set2:
        return 1.0
    intersection = set1 & set2
    union = set1 | set2
    return len(intersection) / len(union)

def compute_collection_similarities(collections):
    from config import W_FILTER, W_MEASURE, W_BREAKDOWN, W_TYPE, W_SCORE
    similarities = []

    for i in range(len(collections)):
        for j in range(i + 1, len(collections)):
            col1 = collections[i]
            col2 = collections[j]

            # Jaccard similarities
            sim_filter = jaccard_similarity(col1["filter_set"], col2["filter_set"])
            sim_measure = jaccard_similarity(col1["measure_set"], col2["measure_set"])
            sim_breakdown = jaccard_similarity(col1["breakdown_set"], col2["breakdown_set"])
            sim_type = jaccard_similarity(col1["type_set"], col2["type_set"])
            
            # Total score similarity
            score1 = col1.get("total_score")
            score2 = col2.get("total_score")
            score_sim = 1 - abs(score1 - score2)  # assumes score ∈ [0,1]

            # Weighted combination
            weighted_similarity = (
                W_FILTER * sim_filter +
                W_MEASURE * sim_measure +
                W_BREAKDOWN * sim_breakdown +
                W_TYPE * sim_type +
                W_SCORE * score_sim
            )

            similarities.append({
                "collection_1": i,
                "collection_2": j,
                "similarity": weighted_similarity,
            })

    return similarities

import numpy as np

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

import numpy as np
from sklearn.manifold import MDS
import math
from sklearn.preprocessing import MinMaxScaler

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
    mds = MDS(n_components=2, dissimilarity="precomputed", random_state=42)
    coords = mds.fit_transform(distance_matrix)

    # Step 3: Normalize to [0, 1]
    x = coords[:, 0]
    y = coords[:, 1]
    x_norm = (x - x.min()) / (x.max() - x.min())
    y_norm = (y - y.min()) / (y.max() - y.min())

    return [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x_norm, y_norm)]

def avoid_overlap(positions, scores, padding=0.02):
    from sklearn.preprocessing import MinMaxScaler
    import math
    import numpy as np

    edge_buffer = EDGE_BUFFER

    size_scale = MinMaxScaler(feature_range=(MIN_RADIUS, MAX_RADIUS))
    radii = size_scale.fit_transform(np.array(scores).reshape(-1, 1)).flatten()

    updated = [{"x": p["x"], "y": p["y"], "r": r} for p, r in zip(positions, radii)]

    # 🔧 Initial clamping to prevent any starting violations
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
