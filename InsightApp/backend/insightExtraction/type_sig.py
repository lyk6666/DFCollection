from config import (
    MINI_DATASET,
)

from scipy.stats import skew, skewtest, norm, linregress, t
import numpy as np


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

    # Entropy needs nonnegative mass; clamp tiny negatives and remove NaNs
    x = np.maximum(x, 0.0)
    total = float(np.sum(x))
    if not np.isfinite(total) or total <= eps:
        return 0.0

    # Probabilities
    p = x / total

    # Normalized Shannon entropy (0 = perfectly uneven, 1 = perfectly uniform)
    H = -np.sum(p * np.log(p + eps))          # natural log
    H_max = np.log(n)                          # maximum entropy at uniform distribution

    if not np.isfinite(H_max) or H_max <= eps:
        return 0.0

    score = float(H / H_max)                   # in [0,1]
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
        return 0, 0
    x_mean = np.mean(x)
    y_mean = np.mean(y)
    numerator = np.sum((x - x_mean) * (y - y_mean))
    denominator = np.sqrt(np.sum((x - x_mean) ** 2) * np.sum((y - y_mean) ** 2))
    if denominator == 0 or np.isnan(denominator):
        return 0, 0
    r = numerator / denominator
    if abs(r) == 1 or np.isnan(r):
        return 0, 0
    t_stat = r * np.sqrt((n - 2) / (1 - r ** 2))
    p_value = 2 * (1 - t.cdf(abs(t_stat), df=n-2))
    significance = 1 - p_value
    return r, significance

def test_correlation(measure1, measure2):
    x = np.array(measure1)
    y = np.array(measure2)
    n = len(x)
    if n != len(y) or n < MINI_DATASET:
        return 0, 0
    x_mean = np.mean(x)
    y_mean = np.mean(y)
    numerator = np.sum((x - x_mean) * (y - y_mean))
    denominator = np.sqrt(np.sum((x - x_mean) ** 2) * np.sum((y - y_mean) ** 2))
    if denominator == 0 or np.isnan(denominator):
        return 0, 0
    r = numerator / denominator
    if abs(r) == 1 or np.isnan(r):
        return 0, 0
    t_stat = r * np.sqrt((n - 2) / (1 - r ** 2))
    p_value = 2 * (1 - t.cdf(abs(t_stat), df=n-2))
    significance = 1 - p_value
    return r, significance
