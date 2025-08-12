import pandas as pd
from itertools import product

from config import (
    MINI_DATASET,
    COMPOUND_MINI_DATASET,
    UNIFORMITY_CV_THRESHOLD,
    THRESHOLD_SIG
)

import config

import pandas as pd

def generate_insights():
    df = config.DATAFRAME
    cats = config.CATEGORICAL_COLUMNS
    ords = config.ORDINAL_COLUMNS

    categorical_columns = cats
    if categorical_columns is None:
        raise ValueError("CATEGORICAL_COLUMNS is not set. Please upload a dataset first.")
    ordinal_columns = ords

    # Use the path from config
    if df is None:
        raise ValueError("DATAFRAME is not set. Please upload a dataset first.")

    numerical_columns = [col for col in df.columns if col not in categorical_columns]

    # Create dataset with only categorical columns
    df_cat = df[categorical_columns]

    # For each categorical column, get its unique values + '*'
    possible_values = {
        col: df_cat[col].unique().tolist() + ['*'] 
        for col in df_cat.columns
    }

    # Get all combinations using itertools.product
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

    def analyze_subspace(filtered_df, filt, breakdown, measure, agg_method='sum'):
        # Group by breakdown and aggregate the measure
        grouped = (
            filtered_df
            .groupby(breakdown, as_index=False)[measure]
            .agg(agg_method)
        )

        # Save only if meets minimum row requirement
        result = {
            'filter': filt,
            'original_sub_df': filtered_df,
            'breakdown': breakdown,
            'measure': measure,
            'modified_sub_df': grouped
        }
        integrated_subspaces.append(result)

    for filt, filt_df in filtered_datasets:
        breakdown_candidates = [col for col, val in filt.items() if val == '*']
        for breakdown in breakdown_candidates:
            for measure in numerical_columns:
                analyze_subspace(filt_df, filt, breakdown, measure)


    # {Subspace, original_filtered_dataset, breakdown, measure, modified_filtered_dataset}
    # -------------------------------------------------------------------------------------------------------------------------------

    import numpy as np
    from scipy.stats import norm, linregress, t

    def test_dominance(values, beta=1.2):
        values = np.array(values)
        if len(values) < MINI_DATASET:
            # Not enough values to evaluate
            return 0.0

        # Step 1: Sort in descending order
        sorted_values = np.sort(values)[::-1]

        # Step 2: Exclude the maximum value and fit power-law
        y = sorted_values[1:]
        ranks = np.arange(2, len(sorted_values)+1)  # ranks start from 2

        # Log-transform for linear regression: log(y) = log(alpha) - beta*log(rank)
        if len(y) == 0 or np.any(y <= 0) or np.isnan(y).any():
            return 0.0
        log_y = np.log(y)

        log_rank = np.log(ranks)
        alpha_hat = np.exp(np.mean(log_y + beta*log_rank))

        # Predict values from model ---------- beta = 1.2
        y_hat = alpha_hat * ranks.astype(float)**(-beta)

        # Step 3: Residuals and fit Gaussian
        residuals = y - y_hat
        if len(residuals) < 2:
            return 0.0
        mu_resid = np.nanmean(residuals)
        std_resid = np.nanstd(residuals, ddof=1)
        if std_resid == 0 or np.isnan(std_resid):
            return 0.0
        
        # Step 4: Compute residual for top value
        x_max = sorted_values[0]
        x1_hat = alpha_hat * 1**(-beta)
        R = x_max - x1_hat

        # Step 5: Compute p-value for R under residuals' Gaussian model
        # (Probability of seeing such a large residual under null)
        p_value = 1 - norm.cdf(R, loc=mu_resid, scale=std_resid)
        significance = 1 - p_value

        return significance

    def test_outstanding_one(values, beta=0.8):
        values = np.array(values)
        if len(values) < MINI_DATASET:
            # Not enough values to evaluate
            return 0.0

        # Step 1: Sort in descending order
        sorted_values = np.sort(values)[::-1]

        # Step 2: Exclude the maximum value and fit power-law
        y = sorted_values[1:]
        ranks = np.arange(2, len(sorted_values)+1)  # ranks start from 2

        # Log-transform for linear regression: log(y) = log(alpha) - beta*log(rank)
        if len(y) == 0 or np.any(y <= 0) or np.isnan(y).any():
            return 0.0
        log_y = np.log(y)

        log_rank = np.log(ranks)
        alpha_hat = np.exp(np.mean(log_y + beta*log_rank))

        # Predict values from model
        y_hat = alpha_hat * ranks**(-beta)

        # Step 3: Residuals and fit Gaussian
        residuals = y - y_hat
        if len(residuals) < 2:
            return 0.0
        mu_resid = np.nanmean(residuals)
        std_resid = np.nanstd(residuals, ddof=1)
        if std_resid == 0 or np.isnan(std_resid):
            return 0.0
        
        # Step 4: Compute residual for top value
        x_max = sorted_values[0]
        x1_hat = alpha_hat * 1**(-beta)
        R = x_max - x1_hat

        # Step 5: Compute p-value for R under residuals' Gaussian model
        # (Probability of seeing such a large residual under null)
        p_value = 1 - norm.cdf(R, loc=mu_resid, scale=std_resid)
        significance = 1 - p_value

        return significance

    def test_outstanding_twin(values, beta=0.8):
        values = np.array(values)
        if len(values) < MINI_DATASET:
            # Not enough values to evaluate
            return 0.0

        # Step 1: Sort in descending order
        sorted_values = np.sort(values)[::-1]

        # Step 2: Exclude the maximum value and fit power-law
        y = sorted_values[2:]
        ranks = np.arange(3, len(sorted_values)+1)  # ranks start from 3

        # Log-transform for linear regression: log(y) = log(alpha) - beta*log(rank)
        if len(y) == 0 or np.any(y <= 0) or np.isnan(y).any():
            return 0.0
        log_y = np.log(y)

        log_rank = np.log(ranks)
        alpha_hat = np.exp(np.mean(log_y + beta*log_rank))

        # Predict values from model
        y_hat = alpha_hat * ranks**(-beta)

        # Step 3: Residuals and fit Gaussian
        residuals = y - y_hat
        if len(residuals) < 2:
            return 0.0
        mu_resid = np.nanmean(residuals)
        std_resid = np.nanstd(residuals, ddof=1)
        if std_resid == 0 or np.isnan(std_resid):
            return 0.0
        
        # Step 4: Compute residual for top value
        x_max = sorted_values[0] + sorted_values[1]
        x1_hat = alpha_hat * (1**(-beta) + 2**(-beta))
        R = x_max - x1_hat

        # Step 5: Compute p-value for R under residuals' Gaussian model
        # (Probability of seeing such a large residual under null)
        p_value = 1 - norm.cdf(R, loc=mu_resid, scale=std_resid)
        significance = 1 - p_value

        return significance

    def test_uniformity(values):
        values = np.array(values)
        if len(values) < MINI_DATASET:
            return 0.0
        if len(values) < 2 or np.isnan(values).all():
            return 0.0
        mu = np.nanmean(values)
        residuals = values - mu
        abs_residuals = np.abs(residuals)
        max_abs_resid = np.max(abs_residuals)
        # Fit Gaussian to the residuals
        if len(residuals) < 2:
            return 0.0
        resid_std = np.nanstd(residuals, ddof=1)
        if resid_std == 0 or np.isnan(resid_std):
            return 0.0
        # p-value: probability of observing such a large residual under N(0, resid_std^2)
        # Two-sided test
        p_value = 2 * (1 - norm.cdf(max_abs_resid, loc=0, scale=resid_std))
        significance = 1 - p_value
        return significance

    def test_change_point(x, y, window_size=3):
        x = np.array(x)
        y = np.array(y)
        N = len(y)
        n = window_size
        if N < 2 * n + 1:
            return 0.0, None, {}
        best_sig = 0
        best_k = None
        details = {}
        for k in range(n, N-n):
            # Left/right windows
            x_left = x[k-n:k]
            y_left = y[k-n:k]
            x_right = x[k:k+n]
            y_right = y[k:k+n]
            # Mean change
            mean_left = np.mean(y_left)
            mean_right = np.mean(y_right)
            y_full = np.concatenate([y_left, y_right])
            if len(y_full) < 2 or np.isnan(y_full).all():
                continue
            sigma_Y = np.nanstd(y_full, ddof=1)
            if sigma_Y == 0 or np.isnan(sigma_Y):
                continue
            sigma_mu_Y = sigma_Y / np.sqrt(n)
            sig_mean = 0.0
            if sigma_mu_Y > 0:
                kmean = np.abs(mean_left - mean_right) / sigma_mu_Y
                p_mean = 1 - norm.cdf(kmean)
                sig_mean = 1 - p_mean
            # Slope change
            lr_left = linregress(x_left, y_left)
            lr_right = linregress(x_right, y_right)
            slope_left, se_left = lr_left.slope, lr_left.stderr
            slope_right, se_right = lr_right.slope, lr_right.stderr
            sig_slope = 0.0
            if se_left and se_right and se_left > 0 and se_right > 0:
                z_slope = np.abs(slope_left - slope_right) / np.sqrt(se_left**2 + se_right**2)
                p_slope = 1 - norm.cdf(z_slope)
                sig_slope = 1 - p_slope
            # Combined significance (AND): must be significant in both
            sig_combined = min(sig_mean, sig_slope)
            details[k] = {
                'sig_mean': sig_mean,
                'sig_slope': sig_slope,
                'sig_combined': sig_combined
            }
            if sig_combined > best_sig:
                best_sig = sig_combined
                best_k = k
        return best_sig, best_k, details

    def test_trend(x, y):
        x = np.array(x)
        y = np.array(y)
        if len(x) < MINI_DATASET:
            return 0  # Not enough data
        res = linregress(x, y)
        slope = res.slope
        se = res.stderr
        n = len(x)
        if se == 0 or np.isnan(se):
            return 0
        t_stat = slope / se
        df = n - 2
        # Two-tailed p-value (test for any trend, positive or negative)
        p_value = 2 * (1 - t.cdf(abs(t_stat), df))
        significance = 1 - p_value
        return significance

    def test_evenness(values):
        values = np.array(values)
        if len(values) < MINI_DATASET:
            return 0.0
        if len(values) < 2 or np.isnan(values).all():
            return 0.0
        mu = np.nanmean(values)
        residuals = values - mu
        abs_residuals = np.abs(residuals)
        max_abs_resid = np.max(abs_residuals)
        # Fit Gaussian to the residuals
        if len(residuals) < 2:
            return 0.0
        resid_std = np.nanstd(residuals, ddof=1)
        if resid_std == 0 or np.isnan(resid_std):
            return 0.0
        # p-value: probability of observing such a large residual under N(0, resid_std^2)
        # Two-sided test
        p_value = 2 * (1 - norm.cdf(max_abs_resid, loc=0, scale=resid_std))
        significance = 1 - p_value
        return significance

    def test_correlation(x, y):
        x = np.array(x)
        y = np.array(y)
        n = len(x)
        if n != len(y) or n < MINI_DATASET:
            return 0.0  # Not enough data or mismatched lengths
        # Step 1: Pearson's r
        x_mean = np.mean(x)
        y_mean = np.mean(y)
        numerator = np.sum((x - x_mean) * (y - y_mean))
        denominator = np.sqrt(np.sum((x - x_mean) ** 2) * np.sum((y - y_mean) ** 2))
        if denominator == 0 or np.isnan(denominator):
            return 0.0
        r = numerator / denominator
        # Step 2: t-statistic
        if abs(r) == 1 or np.isnan(r):
            return 0.0
        else:
            t_stat = r * np.sqrt((n - 2) / (1 - r ** 2))
            # Step 3: two-sided p-value
            p_value = 2 * (1 - t.cdf(abs(t_stat), df=n-2))
            # Step 4: significance
            significance = 1 - p_value
        return significance

    def test_cross_measure_correlation(measure1, measure2):
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
        else:
            t_stat = r * np.sqrt((n - 2) / (1 - r ** 2))
            p_value = 2 * (1 - t.cdf(abs(t_stat), df=n-2))
            significance = 1 - p_value
        return significance

    # ---------------------------insight type test functions above-----------------------------------------------------

    insights_set = []

    # Precompute total sum for each measure
    measure_totals = {measure: df[measure].sum() for measure in numerical_columns}

    def find_matching_subspace(subspaces, item, measure2):
        for s in subspaces:
            if (s['filter'] == item['filter'] and
                s['breakdown'] == item['breakdown'] and
                s['measure'] == measure2):
                return s
        return None
    
    used_measure_pairs = set()
    for item in integrated_subspaces:
        subspace = item['filter']
        breakdown = item['breakdown']
        measure = item['measure']
        aggregated_df = item['modified_sub_df']
        values = aggregated_df[measure].values
        n = len(values)
        total = np.sum(values)
        impact = total / measure_totals[measure] if measure_totals[measure] != 0 else 0
        insight_type = None
        significance = 0.0
        score = 0.0

        # Non-ordinal (Single Point)
        if breakdown not in ordinal_columns:
            # 1. Dominance (using test function)
            dom_sig = test_dominance(values)
            if dom_sig > THRESHOLD_SIG:
                insight_type = "Dominance"
                significance = dom_sig
            else:
                # 2. Outstanding One
                oo_sig = test_outstanding_one(values)
                if oo_sig > THRESHOLD_SIG:
                    insight_type = "Outstanding One"
                    significance = oo_sig
                else:
                    # 3. Outstanding Twin
                    otwin_sig = test_outstanding_twin(values)
                    if otwin_sig > THRESHOLD_SIG:
                        insight_type = "Outstanding Twin"
                        significance = otwin_sig
                    else:
                        # 4. Uniformity: coefficient of variation < threshold
                        mean = np.mean(values)
                        std = np.std(values, ddof=1)
                        cv = std / mean if mean != 0 else 0
                        if cv < UNIFORMITY_CV_THRESHOLD:
                            uniformity_sig = test_uniformity(values)
                            if uniformity_sig > THRESHOLD_SIG:
                                insight_type = "Uniformity"
                                significance = uniformity_sig

        # Ordinal (Single Shape)
        else:
            x = np.arange(len(values))
            # 1. Trend
            trend_sig = test_trend(x, values)
            if trend_sig > THRESHOLD_SIG:
                insight_type = "Trend"
                significance = trend_sig
            else:
                # 2. Change Point
                cp_sig, cp_idx, _ = test_change_point(x, values, window_size=3)
                if cp_sig > THRESHOLD_SIG:
                    insight_type = "Change Point"
                    significance = cp_sig
                else:
                    # 3. Evenness
                    evenness_sig = test_evenness(values)
                    if evenness_sig > THRESHOLD_SIG:
                        insight_type = "Evenness"
                        significance = evenness_sig

        # Record single insight
        if insight_type:
            score = significance * impact
            insights_set.append({
                'subspace': subspace,
                'breakdown': breakdown,
                'measure': measure,
                'type': insight_type,
                'impact': impact,
                'significance': significance,
                'score': score,
                'aggregated_df': aggregated_df
            })

        # Compound Insights: correlation or cross-measure correlation
        for measure2 in numerical_columns:
            if measure2 == measure:
                continue
            matched = find_matching_subspace(integrated_subspaces, item, measure2)
            if not matched:
                continue
            new_matched_pair = tuple(sorted([measure, measure2]))
            compound_key = (str(subspace), breakdown, new_matched_pair)
            if compound_key in used_measure_pairs:
                continue
            used_measure_pairs.add(compound_key)
            
            values2 = matched['modified_sub_df'][measure2].values
            min_len = min(len(values), len(values2))
            if min_len < COMPOUND_MINI_DATASET:
                continue
            if breakdown in ordinal_columns:
                corr_sig = test_correlation(values[:min_len], values2[:min_len])
                compound_type = "Correlation"
            else:
                corr_sig = test_cross_measure_correlation(values[:min_len], values2[:min_len])
                compound_type = "Cross-measure Correlation"
            if corr_sig > THRESHOLD_SIG:
                # Impact: average impact of both measures
                impact2 = np.sum(values2) / measure_totals[measure2] if measure_totals[measure2] != 0 else 0
                compound_impact = (impact + impact2) / 2
                score = corr_sig * compound_impact
                merged_df = pd.merge(
                    aggregated_df[[breakdown, measure]],
                    matched['modified_sub_df'][[breakdown, measure2]],
                    on=breakdown,
                    how='inner'
                )
                insights_set.append({
                    'subspace': subspace,
                    'breakdown': breakdown,
                    'measure': new_matched_pair,
                    'type': compound_type,
                    'impact': compound_impact,
                    'significance': corr_sig,
                    'score': score,
                    'aggregated_df': merged_df
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