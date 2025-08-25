from sklearn.manifold import MDS
from sklearn.preprocessing import MinMaxScaler
import numpy as np
import math
import pandas as pd
import os

from config import (
    TYPE_METADATA,
)

import config


def intra_coupled_similarity(): 
    df = config.DATAFRAME
    cats = config.CATEGORICAL_COLUMNS

    categorical_columns = cats
    attribute_distributions = {}

    for col in categorical_columns:
        value_counts = df[col].value_counts(dropna=False)
        total_count = value_counts.sum()

        # Build probability dict
        prob_dict = {}
        for value, count in value_counts.items():
            prob = count / total_count
            prob_dict[value] = prob

        # Sort values descending by probability
        sorted_values = sorted(prob_dict.items(), key=lambda x: -x[1])
        values = [v for v, p in sorted_values]
        probs = [p for v, p in sorted_values]

        # Build similarity matrix for this attribute
        similarity_matrix = {}

        for i, vi in enumerate(values):
            similarity_matrix[vi] = {}  # nested dictionary per value
            for j, vj in enumerate(values):
                if vi == vj:
                    sim = 1.0
                else:
                    min_idx = min(i, j)
                    max_idx = max(i, j)

                    sum_prob = sum(probs[min_idx:max_idx+1])
                    log_sum_prob = np.log(sum_prob)

                    log_sum_logs = sum(np.log(probs[min_idx:max_idx+1]))
                    
                    if log_sum_logs == 0:
                        sim = 0.0
                    else:
                        sim = (2 * log_sum_prob) / log_sum_logs

                    sim = max(0.0, min(sim, 1.0))

                sim = round(sim, 4)
                similarity_matrix[vi][vj] = sim

        attribute_distributions[col] = similarity_matrix

    return attribute_distributions

def inter_coupled_similarity():
    """
    Dummy inter-similarity: set similarity of all pairs to 1, since we didn't consider it. May include the inter-similarity measure if interested.
    """
    df = config.DATAFRAME
    cats = config.CATEGORICAL_COLUMNS

    result = {}

    for attr_j in cats:
        values = sorted(df[attr_j].dropna().unique())
        similarity_matrix = {}

        for vjx in values:
            similarity_matrix[vjx] = {}
            for vjy in values:
                similarity_matrix[vjx][vjy] = 1.0  # all similarities = 1

        result[attr_j] = similarity_matrix

    return result


# def inter_coupled_similarity():
#     df = config.DATAFRAME
#     cats = config.CATEGORICAL_COLUMNS
#     ords = config.ORDINAL_COLUMNS

#     def phi_j_to_k(df, attr_j, attr_k, vj):
#         filtered_df = df[df[attr_j] == vj]
#         return set(filtered_df[attr_k].dropna().unique())

#     def P_k_given_j(df, attr_j, attr_k, vj, vk):
#         count_vj = len(df[df[attr_j] == vj])
#         if count_vj == 0:
#             return 0.0
#         count_vk_and_vj = len(df[(df[attr_j] == vj) & (df[attr_k] == vk)])
#         return count_vk_and_vj / count_vj

#     def IRSI_jk(df, attr_j, attr_k, vjx, vjy):
#         phi_x = phi_j_to_k(df, attr_j, attr_k, vjx)
#         phi_y = phi_j_to_k(df, attr_j, attr_k, vjy)
#         intersection = phi_x & phi_y

#         if not intersection:
#             return 0.0

#         similarities = []
#         for vk in intersection:
#             pkj_x = P_k_given_j(df, attr_j, attr_k, vjx, vk)
#             pkj_y = P_k_given_j(df, attr_j, attr_k, vjy, vk)
#             similarities.append(min(pkj_x, pkj_y))

#         return min(similarities)

#     def IRSI_full(df, attr_j, vjx, vjy, categorical_columns):
#         similarities = []
#         for attr_k in categorical_columns:
#             if attr_k == attr_j:
#                 continue
#             sim_jk = IRSI_jk(df, attr_j, attr_k, vjx, vjy)
#             similarities.append(sim_jk)
#         if not similarities:
#             return 0.0
#         return sum(similarities) / len(similarities)

#     categorical_columns = cats

#     BASE_DIR = os.path.dirname(os.path.abspath(__file__))

#     result = {}

#     for attr_j in categorical_columns:
#         values = sorted(df[attr_j].dropna().unique())
#         similarity_matrix = {}

#         for vjx in values:
#             similarity_matrix[vjx] = {}
#             for vjy in values:
#                 if vjx == vjy:
#                     similarity_matrix[vjx][vjy] = 1.0
#                 else:
#                     sim = IRSI_full(df, attr_j, vjx, vjy, categorical_columns)
#                     similarity_matrix[vjx][vjy] = round(sim, 4)

#         result[attr_j] = similarity_matrix

#     return result

def compute_coupled_distance_matrix(insights, intra_sim, inter_sim,
                                     weight_coupled=0.5, weight_breakdown=0.1, weight_measure=0.1,
                                     weight_type=0.2, weight_score=0.1):
    n = len(insights)
    distance_matrix = np.zeros((n, n))

    for i in range(n):
        for j in range(n):
            # Coupled similarity
            sim_total = 0
            count = 0
            all_attrs = insights[i]['subspace'].keys()

            for attr in all_attrs:
                v1 = insights[i]['subspace'].get(attr, '*')
                v2 = insights[j]['subspace'].get(attr, '*')

                if v1 == '*' or v2 == '*':
                    continue

                intra_val = intra_sim.get(attr, {}).get(v1, {}).get(v2, 0.0)
                inter_val = inter_sim.get(attr, {}).get(v1, {}).get(v2, 0.0)
                sim_attr = intra_val * inter_val

                sim_total += sim_attr
                count += 1

            coupled_similarity = (sim_total / count) if count > 0 else 0.0

            # Breakdown similarity (binary match)
            breakdown_i = insights[i].get('breakdown')
            breakdown_j = insights[j].get('breakdown')
            breakdown_sim = 1.0 if breakdown_i == breakdown_j else 0.0

            # Measure similarity (overlap for list or scalar)

            measure_i = insights[i].get('measure')
            measure_j = insights[j].get('measure')

            # normalize to list
            measure_i_list = measure_i if isinstance(measure_i, list) else [measure_i]
            measure_j_list = measure_j if isinstance(measure_j, list) else [measure_j]

            overlap_count = len(set(measure_i_list) & set(measure_j_list))
            total_count = len(set(measure_i_list + measure_j_list))
            measure_sim = overlap_count / total_count if total_count > 0 else 0.0

            # Type similarity
            type_i = insights[i].get('type')
            type_j = insights[j].get('type')
            type_sim = 1.0 if type_i == type_j else 0.0

            # Score similarity
            score_i = insights[i].get('score')
            score_j = insights[j].get('score')
            score_sim = 1.0 - abs(score_i - score_j)

            # Final weighted similarity
            total_similarity = (
                weight_coupled * coupled_similarity +
                weight_breakdown * breakdown_sim +
                weight_measure * measure_sim +
                weight_type * type_sim +
                weight_score * score_sim
            )

            # Convert to distance
            distance_matrix[i, j] = 1 - total_similarity

    return distance_matrix

def avoid_overlap(positions, scores, padding=None, r_fixed=None):
    import math

    N = max(1, len(scores) if scores is not None else len(positions))
    # Match frontend: r_norm = 1 / N
    r_fixed = (1.0 / N) ** 0.5 * 0.3 if r_fixed is None else r_fixed
    # Keep padding proportional so it behaves well for large N
    padding = (0.25 * r_fixed) if padding is None else padding

    # A tiny edge buffer; you can also tie this to r if you prefer
    edge_buffer = max(0.01, 0.5 * padding)

    radii = [r_fixed for _ in positions]
    updated = [{"x": p["x"], "y": p["y"], "r": r} for p, r in zip(positions, radii)]

    # Initial clamping
    for p in updated:
        p["x"] = min(max(edge_buffer + p["r"], p["x"]), 1.0 - edge_buffer - p["r"])
        p["y"] = min(max(edge_buffer + p["r"], p["y"]), 1.0 - edge_buffer - p["r"])

    def overlaps(a, b):
        dx = a["x"] - b["x"]
        dy = a["y"] - b["y"]
        dist = math.hypot(dx, dy)
        return dist < (a["r"] + b["r"] + padding)

    def movement_mask(p, dx, dy):
        mask_x, mask_y = 1.0, 1.0
        new_x, new_y = p["x"] + dx, p["y"] + dy
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
                    dist = max(math.hypot(dx, dy), 1e-6)
                    needed = (a["r"] + b["r"] + padding - dist)
                    move_x = needed * dx / dist
                    move_y = needed * dy / dist

                    axm, aym = movement_mask(a, move_x, move_y)
                    bxm, bym = movement_mask(b, -move_x, -move_y)

                    a["x"] += 0.5 * move_x * axm
                    a["y"] += 0.5 * move_y * aym
                    b["x"] -= 0.5 * move_x * bxm
                    b["y"] -= 0.5 * move_y * bym

                    moved = True
        if not moved:
            break

    return [{"x": p["x"], "y": p["y"], "r": p["r"]} for p in updated]


def compute_insight_positions(insights, intra_mat, inter_mat, seed=42):
    np.random.seed(seed)
    n = len(insights)
    if n == 0:
        return []

    dist_matrix = compute_coupled_distance_matrix(insights, intra_mat, inter_mat)

    # Step 2: MDS to 2D
    mds = MDS(n_components=2, dissimilarity="precomputed", random_state=seed, n_init=4)
    positions = mds.fit_transform(dist_matrix)

    # Step 3: Normalize x/y to [0, 1]
    scaler = MinMaxScaler(feature_range=(0, 1))
    positions_norm = scaler.fit_transform(positions)  # shape (n, 2)
    base_positions = [{"x": float(x), "y": float(y)} for x, y in positions_norm]

    # Step 4: Get scores for sizing
    scores = [ins.get("score") for ins in insights]

    # Step 5: Apply overlap avoidance
    adjusted = avoid_overlap(base_positions, scores)

    # Step 6: Combine with insight metadata
    output = []
    for i, adj in enumerate(adjusted):
        ins = insights[i]
        insight_type = ins.get("type", "")
        group, color = TYPE_METADATA.get(insight_type, ("Unknown", "#999999", "question"))
        output.append({
            "id": i,
            "x": adj["x"],
            "y": adj["y"],
            "r": adj["r"],
            "score": ins.get("score"),
            "type": insight_type,
            "measure": ins.get("measure"),
            "breakdown": ins.get("breakdown"),
            "subspace": ins.get("subspace"),
            "modified_dataset": ins.get("modified_dataset"),
            "group": group,
            "color": color,
        })

    return output