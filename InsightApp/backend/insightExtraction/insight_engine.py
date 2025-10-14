import pandas as pd
from itertools import combinations
from config import (
    MINI_DATASET,
    COMPOUND_MINI_DATASET,
    THRESHOLD_SIG
)

from insightExtraction.type_sig import (
    test_change_point,
    test_correlation,
    test_dominance,
    test_evenness,
    test_outstanding_twin,
    test_skewness,
    test_temporal_correlation,
    test_trend
)
import config
import numpy as np

from insightExtraction.fast_detection import evaluate_type_fast


def generate_insights(verbose: bool = True, impact_threshold: float = 0.01, max_insights: int = None):
    """
    One-pass version:
      - Recursively builds integrated subspaces (filters with a single breakdown),
      - Immediately evaluates insight types for that subspace,
      - Appends to final results without storing all subspaces first.
    """
    insight_count = 0
    df = config.DATAFRAME
    cats = config.CATEGORICAL_COLUMNS
    ords = config.ORDINAL_COLUMNS
    nums = config.NUMERICAL_COLUMNS
    agg_map = getattr(config, "MEASURE_AGGS", {}) or {}

    categorical_columns = list(cats)
    ordinal_columns = set(ords)
    numerical_columns = list(nums)

    total_rows = len(df) if df is not None else 0
    if total_rows == 0:
        return []

    # Precompute aggregations and measure pairs
    all_num_aggs = {col: agg_map.get(col, 'sum') for col in numerical_columns}
    single_measures = list(numerical_columns)
    pair_measures = list(combinations(sorted(numerical_columns), 2))

    # Precompute unique levels per categorical column for DFS branching
    uniques = {c: df[c].dropna().unique().tolist() for c in categorical_columns}

    N = len(df)
    if N == 0 or total_rows <= 0:
        return []

    insights_set = []

    # ---------- helpers to compute insight(s) for a grouped subspace ----------
    def _emit_single_measure_insight(subspace_filter, breakdown, measure, grouped_df, impact):
        # values for the single measure
        nonlocal insight_count
        if measure not in grouped_df.columns:
            return
        values = pd.to_numeric(grouped_df[measure], errors="coerce").values
        vals = np.asarray(values, dtype=float)
        vals = vals[np.isfinite(vals)]
        if vals.size == 0:
            return

        insight_type = None
        significance = 0.0

        # 1) pick type quickly (evaluation)
        if breakdown not in ordinal_columns:
            insight_type = evaluate_type_fast(vals, breakdown, ordinal_columns)
        else:
            x = np.arange(len(vals))
            insight_type = evaluate_type_fast(vals, breakdown, ordinal_columns, x_index=x)

        # 2) then compute significance ONLY for that type
        if insight_type == "Dominance":
            significance = test_dominance(vals)
        elif insight_type == "Outstanding Twin":
            significance = test_outstanding_twin(vals)
        elif insight_type == "Evenness":
            significance = test_evenness(vals)
        elif insight_type == "Trend":
            trend_sig, _ = test_trend(x, vals)
            significance = trend_sig
        elif insight_type == "Skewness":
            _, _, skew_sig = test_skewness(vals)
            significance = 0.0 if skew_sig is None else skew_sig
        elif insight_type == "Change Point":
            cp_sig, _, _ = test_change_point(x, vals, window_size=3)
            significance = cp_sig
        else:
            significance = 0.0

        if significance < THRESHOLD_SIG:
            return

        # Record single insight
        if insight_type:
            score = significance * impact
            insights_set.append({
                'subspace': dict(subspace_filter),
                'breakdown': breakdown,
                'measure': measure,  # single str
                'type': insight_type,
                'score': score,
                'significance': significance,
                'modified_dataset': grouped_df[[breakdown, measure]].copy()
            })
            insight_count += 1
            if verbose:
                print("emitted single insight: ", insight_count)
            if max_insights is not None and insight_count >= max_insights:
                raise StopIteration

    def _emit_pair_measure_insight(subspace_filter, breakdown, m1, m2, grouped_df, impact):
        nonlocal insight_count
        if (m1 not in grouped_df.columns) or (m2 not in grouped_df.columns):
            return

        v1 = pd.to_numeric(grouped_df[m1], errors="coerce").values
        v2 = pd.to_numeric(grouped_df[m2], errors="coerce").values

        mask = np.isfinite(v1) & np.isfinite(v2)
        v1 = v1[mask]
        v2 = v2[mask]
        min_len = min(len(v1), len(v2))
        if min_len < COMPOUND_MINI_DATASET:
            return

        if breakdown in ordinal_columns:
            r, corr_sig = test_temporal_correlation(v1[:min_len], v2[:min_len])
            compound_type = "Temporal Correlation"
        else:
            r, corr_sig = test_correlation(v1[:min_len], v2[:min_len])
            compound_type = "Correlation"

        if abs(r) > 0.85:
            score = corr_sig * impact
            m1_, m2_ = tuple(sorted((m1, m2)))
            insights_set.append({
                'subspace': dict(subspace_filter),
                'breakdown': breakdown,
                'measure': (m1_, m2_),
                'type': compound_type,
                'score': score,
                'significance': corr_sig,
                'modified_dataset': grouped_df[[breakdown, m1_, m2_]].copy()
            })
            insight_count += 1
            if verbose:
                print("emitted _pair_ insight: ", insight_count)
            if max_insights is not None and insight_count >= max_insights:
                raise StopIteration

    def _evaluate_and_emit(subspace_filter, sub_df, impact):
        """
        At a DFS leaf (i.e., after deciding all categorical columns),
        try each '*' column as a breakdown, aggregate once for all measures,
        then immediately compute+emit insights for singles and pairs.
        """
        # Breakdown candidates are the columns left as '*'

        breakdown_candidates = [c for c, v in subspace_filter.items() if v == '*']
        if not breakdown_candidates:
            return

        for breakdown in breakdown_candidates:
            # One grouped aggregation for ALL numeric measures
            grouped = sub_df.groupby(breakdown, as_index=False).agg(all_num_aggs)

            # Emit singles
            for m in single_measures:
                if m in grouped.columns:
                    _emit_single_measure_insight(subspace_filter, breakdown, m, grouped, impact)

            # Emit unordered pairs
            for (m1, m2) in pair_measures:
                _emit_pair_measure_insight(subspace_filter, breakdown, m1, m2, grouped, impact)


    # ---------- DFS over categorical filters; compute insights on the fly ----------
    def dfs(col_idx: int, filt: dict, mask: np.ndarray):
        # Prune by size and impact early
        cur_rows = int(mask.sum())
        if cur_rows < MINI_DATASET:
            return
        coverage = cur_rows / float(total_rows)
        if coverage < impact_threshold:
            return

        # If all categorical columns are decided -> evaluate immediately
        if col_idx == len(categorical_columns):
            sub_df = df.loc[mask]
            _evaluate_and_emit(filt, sub_df, coverage)
            return

        col = categorical_columns[col_idx]

        # Option 1: keep wildcard '*'
        filt_star = dict(filt)
        filt_star[col] = '*'
        dfs(col_idx + 1, filt_star, mask)

        # Option 2: branch into each concrete value of this column
        vals = uniques[col]
        if len(vals) == 0:
            return

        col_values = df[col].values  # vectorized compare
        for v in vals:
            new_mask = mask & (col_values == v)
            if not new_mask.any():
                continue
            filt_val = dict(filt)
            filt_val[col] = v
            dfs(col_idx + 1, filt_val, new_mask)

    # Kick off with an "empty" mask (all True) and empty filter
    try:
        dfs(col_idx=0, filt={}, mask=np.ones(N, dtype=bool))
    except StopIteration:
        if verbose:
            print(f"Stopped early: reached max_insights={max_insights}")

    if verbose:
        print("insights size:", len(insights_set))

    return insights_set
