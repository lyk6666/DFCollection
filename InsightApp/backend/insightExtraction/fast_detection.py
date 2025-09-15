import numpy as np

# ---------- shared small utils ----------
_EPS = 1e-12

def _safe(x):
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    return x

def _share_top(vals, k=1):
    v = _safe(vals)
    s = v.sum()
    if s <= 0: return 0.0
    return (np.sort(v)[-k:].sum()) / s

def _cv(vals):
    v = _safe(vals)
    if v.size == 0: return np.inf
    mu = np.mean(v)
    sig = np.std(v, ddof=0)
    return np.inf if abs(mu) < _EPS else sig / abs(mu)

def _center_of_mass_shift(y):
    y = _safe(y)
    n = len(y)
    if n < 2: return 0.0
    idx = np.arange(n, dtype=float)
    total = np.sum(y)
    if total <= 0: return 0.0
    x_com = float(np.sum(idx * y) / (total + _EPS))
    x_mid = 0.5 * (n - 1)
    halfspan = max(x_mid, 1.0)
    return abs(x_com - x_mid) / halfspan

def _monotonicity_score(v):
    # fraction of consecutive differences sharing the same sign (strict mono)
    v = _safe(v)
    if v.size < 3: return 0.0
    d = np.diff(v)
    pos = np.sum(d > 0)
    neg = np.sum(d < 0)
    total = np.sum(d != 0)
    return 0.0 if total == 0 else max(pos, neg) / total

def _quick_linreg_turbulence(x, y):
    # light regression + turbulence-ish ratio, no tests
    x = _safe(x); y = _safe(y)
    n = min(len(x), len(y))
    if n < 3: return 0.0, np.inf
    x = x[:n]; y = y[:n]
    # manual slope/intercept to avoid scipy
    xm, ym = x.mean(), y.mean()
    sxx = np.sum((x - xm)**2)
    if sxx < _EPS:
        return 0.0, np.inf
    slope = np.sum((x - xm)*(y - ym)) / sxx
    intercept = ym - slope * xm
    yhat = intercept + slope * x
    rmse = np.sqrt(np.mean((y - yhat)**2))
    span_x = x.max() - x.min()
    amp = abs(slope) * span_x
    turb = (rmse / (amp + _EPS)) if amp > 0 else np.inf
    # r^2 (cheap)
    sst = np.sum((y - ym)**2)
    r2 = 0.0 if sst < _EPS else 1.0 - np.sum((y - yhat)**2)/sst
    return max(0.0, min(1.0, r2)), turb

def quick_is_dominance(vals):
    # Top-1 share heuristic
    return _share_top(vals, k=1) >= 0.66

def quick_is_outstanding_twin(vals):
    top2_share = _share_top(vals, k=2)
    fir_share = _share_top(vals, k=1)
    sec_share = top2_share - fir_share
    # Two large categories dominating together
    return fir_share >= 0.33 and sec_share >= 0.33

def quick_is_evenness(vals):
    # Uniformity by CV and entropy (both cheap)
    return (_cv(vals) <= 0.15)

def quick_is_trend(x, vals):
    # Consistent direction + decent fit + low turbulence
    v = _safe(vals); t = _safe(x)
    if min(len(v), len(t)) < 4: return False
    r2, turb = _quick_linreg_turbulence(t, v)
    mono = _monotonicity_score(v)
    return (mono >= 0.75) and (r2 >= 0.50) and (turb <= 0.60)

def quick_is_skewness(vals):
    # Use robust Bowley skew and median-vs-mean shift
    v = _safe(vals)
    if len(v) < 8:  # need a bit of mass to be confident
        return False
    cms = _center_of_mass_shift(v)
    return cms >= 0.15

def quick_is_change_point(x, vals, w=3):
    v = _safe(vals)
    n = len(v)
    if n < max(5, w + 1):  # need enough points for at least 2 window means
        return False

    # rolling mean over full series
    k = np.ones(w, dtype=float) / w
    roll = np.convolve(v, k, mode='valid')              # length m = n - w + 1
    m = len(roll)
    if m < 2:
        return False

    # adjacent mean gaps
    gaps = np.abs(np.diff(roll))                        # length m-1

    if gaps.size:
        q1, q3 = np.percentile(gaps, [25, 75])
        iqr = q3 - q1
        fence = q3 + 1.5 * (iqr + _EPS)
        if np.max(gaps) > fence:
            return True

    return False

def evaluate_type_fast(vals, breakdown, ordinal_columns, x_index=None):
    v = _safe(vals)
    if v.size == 0:
        return None

    if breakdown not in set(ordinal_columns):
        # Non-ordinal order: single-point patterns
        if quick_is_dominance(v):
            return "Dominance"
        if quick_is_outstanding_twin(v):
            return "Outstanding Twin"
        if quick_is_evenness(v):
            return "Evenness"
        return None  # nothing obvious
    else:
        if _cv(v) < 0.15:
            return None
        # Ordinal order: shape patterns
        if x_index is None:
            x_index = np.arange(len(v))
        r2, turb = _quick_linreg_turbulence(x_index, v)

        # Low turbulence prefers Trend first
        if turb <= 0.60 and quick_is_trend(x_index, v):
            return "Trend"

        # In more turbulent series, try Skewness then CP
        if quick_is_skewness(v):
            return "Skewness"
        if quick_is_change_point(x_index, v):
            return "Change Point"

        return None