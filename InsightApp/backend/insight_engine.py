import pandas as pd
from itertools import product, combinations

from config import (
    MINI_DATASET,
    COMPOUND_MINI_DATASET,
    UNIFORMITY_THRESHOLD,
    THRESHOLD_SIG
)

import config
import pandas as pd
from scipy.stats import skew, skewtest
import numpy as np

def generate_insights():
    df = config.DATAFRAME
    cats = config.CATEGORICAL_COLUMNS
    ords = config.ORDINAL_COLUMNS
    nums = config.NUMERICAL_COLUMNS
    agg_map = getattr(config, "MEASURE_AGGS", {}) or {}

    categorical_columns = cats
    ordinal_columns = ords
    numerical_columns = nums

    total_rows = len(df) if df is not None else 0
    if total_rows == 0:
        return []

    # Create dataset with only categorical columns
    df_cat = df[categorical_columns]

    # For each categorical column, get its unique values + '*'
    possible_values = {
        col: df_cat[col].unique().tolist() + ['*'] 
        for col in df_cat.columns
    }

    # Get all combinations using itertools.product; keep only those with at least one wildcard
    filters = [
        values for values in product(*[possible_values[col] for col in df_cat.columns])
        if any(val == '*' for val in values)
    ]

    # Convert each filter to a dictionary for easier use
    filter_dicts = [
        dict(zip(df_cat.columns, values)) 
        for values in filters
    ]

    def apply_filter(df, filter_dict):
        mask = pd.Series([True] * len(df))
        for col, val in filter_dict.items():
            if val != '*':
                mask &= (df[col] == val)
        return df[mask]

    filtered_datasets = []
    for filt in filter_dicts:
        filt_df = apply_filter(df, filt)
        if len(filt_df) < MINI_DATASET:
            continue
        filtered_datasets.append((filt, filt_df))

    # {filter, filtered_dataset}
    # --------------------------------------------------------------------------------------------------------------------------

    integrated_subspaces = []

    def analyze_subspace(filtered_df, filt, breakdown, measure):
        """
        measure can be:
        - a single column name (str), or
        - an iterable of column names (list/tuple/set) of length 2

        We aggregate each measure column by its configured aggregation method in `agg_map`
        and store a canonical representation:
        - single: keep as str
        - pair: store as a sorted tuple (unordered)

        We also store the subspace size to compute impact as COUNT(subspace)/COUNT(*).
        """
        # normalize to list of columns to aggregate
        if isinstance(measure, (list, tuple, set)):
            cols = list(measure)
        else:
            cols = [measure]

        # build per-column aggregation mapping; default to 'sum' if missing
        col_aggs = {col: agg_map.get(col, 'sum') for col in cols}

        grouped = (
            filtered_df
            .groupby(breakdown, as_index=False)
            .agg(col_aggs)
        )

        # canonicalize the 'measure' field: tuple for pairs, str for singles
        canonical_measure = cols[0] if len(cols) == 1 else tuple(sorted(cols))

        result = {
            'filter': filt,
            'breakdown': breakdown,
            'measure': canonical_measure,
            'modified_sub_df': grouped,
            # impact is subspace-based; carry subspace count to avoid recomputing
            'subspace_count': int(len(filtered_df)),
        }
        integrated_subspaces.append(result)

    for filt, filt_df in filtered_datasets:
        breakdown_candidates = [col for col, val in filt.items() if val == '*']

        # prepare all single measures and all unordered pairs
        single_measures = [(m,) for m in numerical_columns]
        pair_measures = list(combinations(sorted(numerical_columns), 2))

        for breakdown in breakdown_candidates:
            # singles
            for (m,) in single_measures:
                analyze_subspace(filt_df, filt, breakdown, m)
            # unordered pairs (length 2)
            for m_pair in pair_measures:
                analyze_subspace(filt_df, filt, breakdown, list(m_pair))

    # {Subspace, breakdown, measure, modified_filtered_dataset, subspace_count}
    # -------------------------------------------------------------------------------------------------------------------------------

    import numpy as np
    from scipy.stats import norm, linregress, t

    def test_dominance(values, beta=0.9):
        values = np.array(values)
        if len(values) < MINI_DATASET:
            return 0.0

        sorted_values = np.sort(values)[::-1]
        y = sorted_values[1:]
        ranks = np.arange(2, len(sorted_values)+1)

        if len(y) == 0 or np.any(y <= 0) or np.isnan(y).any():
            return 0.0
        log_y = np.log(y)
        log_rank = np.log(ranks)
        alpha_hat = np.exp(np.mean(log_y + beta*log_rank))

        y_hat = alpha_hat * ranks.astype(float)**(-beta)
        residuals = y - y_hat
        if len(residuals) < 2:
            return 0.0
        mu_resid = np.nanmean(residuals)
        std_resid = np.nanstd(residuals, ddof=1)
        if std_resid == 0 or np.isnan(std_resid):
            return 0.0
        
        x_max = sorted_values[0]
        x1_hat = alpha_hat * 1**(-beta)
        R = x_max - x1_hat

        p_value = 1 - norm.cdf(R, loc=mu_resid, scale=std_resid)
        significance = 1 - p_value
        return significance

    def test_outstanding_twin(values, beta=0.9):
        values = np.array(values)
        if len(values) < MINI_DATASET + 1:
            return 0.0

        sorted_values = np.sort(values)[::-1]
        y = sorted_values[2:]
        ranks = np.arange(2, len(sorted_values))

        if len(y) == 0 or np.any(y <= 0) or np.isnan(y).any():
            return 0.0
        log_y = np.log(y)
        log_rank = np.log(ranks)
        alpha_hat = np.exp(np.mean(log_y + beta*log_rank))

        y_hat = alpha_hat * ranks**(-beta)
        residuals = y - y_hat
        if len(residuals) < 2:
            return 0.0
        mu_resid = np.nanmean(residuals)
        std_resid = np.nanstd(residuals, ddof=1)
        if std_resid == 0 or np.isnan(std_resid):
            return 0.0
        
        x_max = sorted_values[0] + sorted_values[1]
        x1_hat = alpha_hat * (1**(-beta))
        R = x_max - x1_hat

        p_value = 1 - norm.cdf(R, loc=mu_resid, scale=std_resid)
        significance = 1 - p_value
        return significance

    def test_evenness(values, eps=1e-12):
        x = np.asarray(values, dtype=float)
        x = x[np.isfinite(x)]
        n = x.size
        if n < max(2, MINI_DATASET):
            return 0.0

        mu = np.nanmean(x)
        if not np.isfinite(mu) or abs(mu) < eps:
            return 0.0

        s = np.nanstd(x, ddof=0)
        if not np.isfinite(s):
            return 0.0

        cv = s / abs(mu)
        score = 1.0 - cv
        return float(np.clip(score, 0.0, 1.0))

    def test_change_point(x, y, window_size=3):
        x = np.asarray(x, float)
        y = np.asarray(y, float)
        N, n = len(y), int(window_size)
        if N < 2*n + 1 or n < 1:
            return 0.0, None, {}

        best_sig = 0.0
        best_k = None
        details = {}

        for k in range(n, N - n):
            xL, yL = x[k-n:k], y[k-n:k]
            xR, yR = x[k:k+n], y[k:k+n]
            if not (np.all(np.isfinite(yL)) and np.all(np.isfinite(yR))):
                continue

            mL = float(np.mean(yL))
            mR = float(np.mean(yR))
            yF = np.concatenate([yL, yR])
            Ey, Ey2 = np.mean(yF), np.mean(yF**2)
            varY = Ey2 - Ey**2
            if not np.isfinite(varY) or varY <= 0:
                continue

            sigma_Y = np.sqrt(varY)
            sigma_mu_Y = sigma_Y / np.sqrt(n)
            kmean = abs(mL - mR) / sigma_mu_Y if sigma_mu_Y > 0 else np.inf
            p_mean = 2 * (1 - norm.cdf(kmean))
            sig_mean = float(np.clip(1 - p_mean, 0.0, 1.0))

            try:
                resL = linregress(xL, yL)
                resR = linregress(xR, yR)
            except Exception:
                continue

            bL, bR = resL.slope, resR.slope
            seL, seR = resL.stderr, resR.stderr
            if seL is None or seR is None or (seL == 0 and seR == 0):
                continue

            k_slope = abs(bL - bR) / np.sqrt(seL**2 + seR**2)
            p_slope = 2 * (1 - norm.cdf(k_slope))
            sig_slope = float(np.clip(1 - p_slope, 0.0, 1.0))

            sig_combined = min(sig_mean, sig_slope)

            details[k] = {
                "mean_left": mL,
                "mean_right": mR,
                "kmean": kmean,
                "p_mean": p_mean,
                "sig_mean": sig_mean,
                "slope_left": bL,
                "slope_right": bR,
                "k_slope": k_slope,
                "p_slope": p_slope,
                "sig_slope": sig_slope,
                "sig_combined": sig_combined,
            }

            if sig_combined > best_sig:
                best_sig = sig_combined
                best_k = k

        return best_sig, best_k, details

    def test_trend(x, y):
        x = np.asarray(x, dtype=float)
        y = np.asarray(y, dtype=float)

        if len(x) != len(y) or len(x) < MINI_DATASET:
            return 0.0, np.inf

        mask = np.isfinite(x) & np.isfinite(y)
        if mask.sum() < MINI_DATASET:
            return 0.0, np.inf
        x, y = x[mask], y[mask]
        n = len(x)
        if n < 3:
            return 0.0, np.inf

        res = linregress(x, y)
        slope = res.slope
        intercept = res.intercept
        se = res.stderr

        if not np.isfinite(slope) or not np.isfinite(se) or se <= 0:
            return 0.0, np.inf

        t_stat = slope / se
        dfree = n - 2
        if dfree <= 0:
            return 0.0, np.inf
        p_value = 2 * (1 - t.cdf(abs(t_stat), df= dfree))
        significance = float(np.clip(1 - p_value, 0.0, 1.0))

        y_hat = intercept + slope * x
        residuals = y - y_hat
        sse = float(np.sum((residuals) ** 2))
        rmse = np.sqrt(sse / max(n - 2, 1))

        span_x = float(np.max(x) - np.min(x))
        amplitude = abs(slope) * span_x
        rel_turbulence = (rmse / amplitude) if (np.isfinite(rmse) and amplitude > 0) else np.inf

        return significance, rel_turbulence

    def test_skewness(values):
        """
        Test skewness of a numeric distribution.
        Returns p-value and significance score (1 - p).
        """
        values = np.array(values, dtype=float)
        values = values[~np.isnan(values)]  # drop NaNs

        if len(values) < 8:  # skewtest requires n >= 8
            return None, None, None

        # Compute skewness coefficient
        skewness_value = skew(values)

        # Hypothesis test: H0 -> skewness = 0 (normal symmetry)
        stat, p_value = skewtest(values)

        # Significance: higher when p-value is small
        significance = 1 - p_value

        return skewness_value, p_value, significance

    def test_temporal_correlation(x, y):
        x = np.array(x)
        y = np.array(y)
        n = len(x)
        if n != len(y) or n < MINI_DATASET:
            return 0.0
        x_mean = np.mean(x)
        y_mean = np.mean(y)
        numerator = np.sum((x - x_mean) * (y - y_mean))
        denominator = np.sqrt(np.sum((x - x_mean) ** 2) * np.sum((y - y_mean) ** 2))
        if denominator == 0 or np.isnan(denominator):
            return 0.0
        r = numerator / denominator
        if abs(r) == 1 or np.isnan(r):
            return 0.0
        t_stat = r * np.sqrt((n - 2) / (1 - r ** 2))
        p_value = 2 * (1 - t.cdf(abs(t_stat), df=n-2))
        significance = 1 - p_value
        return significance

    def test_correlation(measure1, measure2):
        x = np.array(measure1)
        y = np.array(measure2)
        n = len(x)
        if n != len(y) or n < MINI_DATASET:
            return 0.0
        x_mean = np.mean(x)
        y_mean = np.mean(y)
        numerator = np.sum((x - x_mean) * (y - y_mean))
        denominator = np.sqrt(np.sum((x - x_mean) ** 2) * np.sum((y - y_mean) ** 2))
        if denominator == 0 or np.isnan(denominator):
            return 0.0
        r = numerator / denominator
        if abs(r) == 1 or np.isnan(r):
            return 0.0
        t_stat = r * np.sqrt((n - 2) / (1 - r ** 2))
        p_value = 2 * (1 - t.cdf(abs(t_stat), df=n-2))
        significance = 1 - p_value
        return significance

    # ---------------------------insight type test functions above-----------------------------------------------------

    insights_set = []

    for item in integrated_subspaces:
        subspace = item['filter']
        breakdown = item['breakdown']
        measure = item['measure']              # str for single, tuple for pair
        aggregated_df = item['modified_sub_df']
        subspace_count = item.get('subspace_count', 0)
        # Impact is subspace-based
        impact = (subspace_count / total_rows) if total_rows > 0 else 0.0

        # ---------- SINGLE MEASURE ----------
        if not isinstance(measure, (tuple, list)):
            values = pd.to_numeric(aggregated_df[measure], errors="coerce").values
            vals = np.asarray(values, dtype=float)
            vals = vals[np.isfinite(vals)]
            if vals.size == 0:
                continue

            insight_type = None
            significance = 0.0

            # Non-ordinal (Single Point)
            if breakdown not in ordinal_columns:
                total = float(np.sum(vals))
                if total <= 0:
                    continue

                sorted_vals = np.sort(vals)[::-1]
                percents = sorted_vals / total * 100.0
                top1 = percents[0]
                top2 = percents[1] if percents.size > 1 else 0.0

                # --- rule 1: top1 > 60% -> Dominance ---
                if top1 > 60:
                    dom_sig = test_dominance(vals)
                    if dom_sig > THRESHOLD_SIG:
                        insight_type = "Dominance"
                        significance = dom_sig

                # --- rule 2: (else) top1 > 30% and top2 > 30% -> Outstanding Twin ---
                if insight_type is None and (top1 > 30 and top2 > 30):
                    otwin_sig = test_outstanding_twin(vals)
                    if otwin_sig > THRESHOLD_SIG:
                        insight_type = "Outstanding Twin"
                        significance = otwin_sig

                # --- rule 3: (else) Evenness ---
                if insight_type is None:
                    evenness_sig = test_evenness(vals)
                    if evenness_sig > UNIFORMITY_THRESHOLD:
                        insight_type = "Evenness"
                        significance = evenness_sig

            # Ordinal (Single Shape)
            else:
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
                    # Turbulent: 1) Skewness -> 2) Change Point
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
                    'subspace': subspace,
                    'breakdown': breakdown,
                    'measure': measure,  # single str
                    'type': insight_type,
                    'impact': impact,
                    'significance': significance,
                    'score': score,
                    'aggregated_df': aggregated_df[[breakdown, measure]]
                })

        # ---------- COMPOUND (PAIR OF MEASURES, UNORDERED) ----------
        else:
            m1, m2 = tuple(sorted(list(measure)))
            if m1 not in aggregated_df.columns or m2 not in aggregated_df.columns:
                continue

            v1 = pd.to_numeric(aggregated_df[m1], errors="coerce").values
            v2 = pd.to_numeric(aggregated_df[m2], errors="coerce").values

            mask = np.isfinite(v1) & np.isfinite(v2)
            v1 = v1[mask]
            v2 = v2[mask]

            min_len = min(len(v1), len(v2))
            if min_len < COMPOUND_MINI_DATASET:
                continue

            if breakdown in ordinal_columns:
                corr_sig = test_temporal_correlation(v1[:min_len], v2[:min_len])
                compound_type = "Temporal Correlation"
            else:
                corr_sig = test_correlation(v1[:min_len], v2[:min_len])
                compound_type = "Correlation"

            if corr_sig > THRESHOLD_SIG:
                score = corr_sig * impact
                insights_set.append({
                    'subspace': subspace,
                    'breakdown': breakdown,
                    'measure': (m1, m2),  # store as tuple to emphasize unordered pair
                    'type': compound_type,
                    'impact': impact,
                    'significance': corr_sig,
                    'score': score,
                    'aggregated_df': aggregated_df[[breakdown, m1, m2]].copy()
                })

    # -------------------------------------------------------------------------------------------------------------

    data_insight_list = [
        {
            'subspace': item['subspace'],
            'breakdown': item['breakdown'],
            'measure': item['measure'],
            'type': item['type'],
            'score': item['score'],
            'modified_dataset': item['aggregated_df']
        }
        for item in insights_set
    ]

    return data_insight_list
