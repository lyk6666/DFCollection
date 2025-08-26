import pandas as pd
from itertools import combinations
from config import (
    MINI_DATASET,
    COMPOUND_MINI_DATASET,
    UNIFORMITY_THRESHOLD,
    THRESHOLD_SIG
)

from type_sig import (
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
    ordinal_columns = set(ords)       # faster membership
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

        if breakdown not in ordinal_columns:
            # Non-ordinal breakdown (single point patterns)
            total = float(np.sum(vals))
            if total <= 0:
                return
            sorted_vals = np.sort(vals)[::-1]
            percents = sorted_vals / total * 100.0
            top1 = percents[0]
            top2 = percents[1] if percents.size > 1 else 0.0

            # Rule 1: Dominance
            if top1 > 60:
                dom_sig = test_dominance(vals)
                if dom_sig > THRESHOLD_SIG:
                    insight_type = "Dominance"
                    significance = dom_sig

            # Rule 2: Outstanding Twin
            if (insight_type is None) and (top1 > 30 and top2 > 30):
                otwin_sig = test_outstanding_twin(vals)
                if otwin_sig > THRESHOLD_SIG:
                    insight_type = "Outstanding Twin"
                    significance = otwin_sig

            # Rule 3: Evenness
            if insight_type is None:
                evenness_sig = test_evenness(vals)
                if evenness_sig > UNIFORMITY_THRESHOLD:
                    insight_type = "Evenness"
                    significance = evenness_sig

        else:
            # Ordinal breakdown (single shape patterns)
            x = np.arange(len(vals))
            if len(x) >= 3:
                trend_sig, turbulence = test_trend(x, vals)
            else:
                trend_sig, turbulence = (0.0, np.inf)

            if turbulence < 0.5:
                # 1) Trend
                if trend_sig > THRESHOLD_SIG:
                    insight_type = "Trend"
                    significance = trend_sig
                else:
                    # 2) Skewness
                    _, skew_p, skew_sig = test_skewness(vals)
                    if (skew_p is not None) and (skew_sig > THRESHOLD_SIG):
                        insight_type = "Skewness"
                        significance = skew_sig
                    else:
                        # 3) Change Point
                        cp_sig, cp_idx, _ = test_change_point(x, vals, window_size=3)
                        if cp_sig > THRESHOLD_SIG:
                            insight_type = "Change Point"
                            significance = cp_sig
            else:
                # Turbulent: Skewness -> Change Point
                _, skew_p, skew_sig = test_skewness(vals)
                if (skew_p is not None) and (skew_sig > THRESHOLD_SIG):
                    insight_type = "Skewness"
                    significance = skew_sig
                else:
                    cp_sig, cp_idx, _ = test_change_point(x, vals, window_size=3)
                    if cp_sig > THRESHOLD_SIG:
                        insight_type = "Change Point"
                        significance = cp_sig

        # Record single insight
        if insight_type:
            score = significance * impact
            insights_set.append({
                'subspace': dict(subspace_filter),
                'breakdown': breakdown,
                'measure': measure,  # single str
                'type': insight_type,
                'score': score,
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
            corr_sig = test_temporal_correlation(v1[:min_len], v2[:min_len])
            compound_type = "Temporal Correlation"
        else:
            corr_sig = test_correlation(v1[:min_len], v2[:min_len])
            compound_type = "Correlation"

        if corr_sig > THRESHOLD_SIG:
            score = corr_sig * impact
            m1_, m2_ = tuple(sorted((m1, m2)))
            insights_set.append({
                'subspace': dict(subspace_filter),
                'breakdown': breakdown,
                'measure': (m1_, m2_),  # store as tuple (unordered)
                'type': compound_type,
                'score': score,
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
        impact = cur_rows / float(total_rows)
        if impact < impact_threshold:
            return

        # If all categorical columns are decided -> evaluate immediately
        if col_idx == len(categorical_columns):
            sub_df = df.loc[mask]
            _evaluate_and_emit(filt, sub_df, impact)
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
