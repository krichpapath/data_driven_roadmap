# impact.py — DDRM impact scoring, rewritten from formula chain
#
# Formula chain (5 steps):
#   Step 1  M_ij  = |d_ij| × c_ij × r_j              evidence magnitude per key point
#   Step 2  x_ij  = 0 / 1 / 2                          discretize via per-PESTLE tolerance bands
#   Step 3  SKD_i = Σ_j ( x_ij × w_ij )               within-driver weighted sum
#   Step 4  STRM  = Σ_{i∈A} ( SKD_i × w_i* )          across-driver, normalized over ACTIVE drivers only
#   Step 5  verdict ← compare STRM/2 to thresholds     Maintain / Adjust / Revise

from typing import List, Dict, Tuple

try:
    from config import DDRM_THRESHOLDS, PESTLE_WEIGHTS, TOLERANCE_BANDS
except Exception:
    DDRM_THRESHOLDS = {"adjust": 0.35, "revise": 0.70}
    PESTLE_WEIGHTS = {
        "Political": 1/6, "Economic": 1/6, "Social": 1/6,
        "Technological": 1/6, "Legal": 1/6, "Environmental": 1/6,
    }
    TOLERANCE_BANDS = {
        "default": {"low": 0.15, "high": 0.35},
    }

PESTLE_ORDER = ["Political", "Economic", "Social", "Technological", "Legal", "Environmental"]


# ─── private helpers ──────────────────────────────────────────────────────────

def _tolerance(pestle: str) -> Tuple[float, float]:
    """Return (τ_low, τ_high) for a PESTLE driver, falling back to 'default'."""
    band = TOLERANCE_BANDS.get(pestle) or TOLERANCE_BANDS.get("default", {"low": 0.15, "high": 0.35})
    return float(band["low"]), float(band["high"])


def _magnitude(sentiment_score: int, sent_conf: float, relevance: float) -> float:
    """
    Step 1 — evidence magnitude.
    M_ij = |d_ij| × c_ij × r_j
      |d_ij|  = abs(sentiment_score)  →  1 for pos/neg, 0 for neutral
      c_ij    = sentiment confidence   →  0..1
      r_j     = relevance weight       →  0..1
    Result is in [0, 1].
    """
    direction  = abs(int(sentiment_score))   # 0 if neutral, 1 if pos or neg
    confidence = max(0.0, min(1.0, float(sent_conf)))
    rel        = max(0.0, min(1.0, float(relevance)))
    return direction * confidence * rel


def _discretize(magnitude: float, pestle: str) -> int:
    """
    Step 2 — discretize magnitude into impact level x_ij.
    x = 0  minor    (M < τ_low)
    x = 1  moderate (τ_low ≤ M < τ_high)
    x = 2  major    (M ≥ τ_high)
    """
    low, high = _tolerance(pestle)
    if magnitude >= high:
        return 2
    if magnitude >= low:
        return 1
    return 0


def _normalize_weights(weights: List[float]) -> List[float]:
    """Normalize a list of weights to sum to 1. Falls back to uniform if all zero."""
    total = sum(max(0.0, w) for w in weights)
    if total <= 0:
        n = len(weights)
        return [1.0 / n] * n if n else []
    return [max(0.0, w) / total for w in weights]


# ─── public API ───────────────────────────────────────────────────────────────

def point_impact(sentiment_score: int, sent_conf: float, pestle_conf: float, rel: float) -> float:
    """
    Display helper — per-row contribution shown in the UI evidence table.
    Returns x_ij × rel  (so the table column is human-readable).

    Note: pestle_conf is accepted for API compatibility but the formula uses
    sent_conf and relevance only — pestle_conf lives in the PESTLE classifier
    output and is already factored into routing confidence, not magnitude.
    """
    # Step 1: magnitude (no pestle label here, use default bands)
    mag = _magnitude(sentiment_score, sent_conf, rel)
    # Step 2: discretize with default bands
    x   = _discretize(mag, "default")
    # contribution = x scaled by relevance
    return round(x * max(0.0, min(1.0, float(rel))), 4)


def aggregate_by_pestle(points: List[Dict]) -> Dict[str, Dict]:
    """
    Steps 1–3 — compute SKD_i for each PESTLE driver.

    Each point dict must contain:
        pestle            str       PESTLE label, e.g. "Technological"
        sentiment_score   int       -1, 0, or +1
        sent_confidence   float     0..1  from sentiment model
        relevance         float     0..1  from key-point extractor
        pestle_confidence float     0..1  (optional, stored for traceability)

    Returns:
        { pestle: { "skd": float, "avg_impact": float, "n": int } }
        skd        = SKD_i  raw score  (0..2)
        avg_impact = SKD_i / 2         normalized to 0..1 for charts
        n          = number of key points in this driver
    """
    # Group key points by PESTLE driver
    groups: Dict[str, List[Dict]] = {d: [] for d in PESTLE_ORDER}
    for pt in points:
        driver = pt.get("pestle", "")
        groups.setdefault(driver, []).append(pt)

    result: Dict[str, Dict] = {}

    for driver in PESTLE_ORDER:
        rows = groups[driver]

        if not rows:
            result[driver] = {"skd": 0.0, "avg_impact": 0.0, "n": 0}
            continue

        # Step 1+2: compute magnitude and discrete level for each key point
        x_levels: List[int] = []
        for pt in rows:
            mag = _magnitude(
                sentiment_score = pt.get("sentiment_score", 0),
                sent_conf       = pt.get("sent_confidence", 0.0),
                relevance       = pt.get("relevance", 0.0),
            )
            x = _discretize(mag, driver)
            x_levels.append(x)

        # Step 3: within-driver weights w_ij = normalized relevance scores
        raw_rels = [float(pt.get("relevance", 0.0)) for pt in rows]
        w_ij     = _normalize_weights(raw_rels)

        # SKD_i = Σ_j ( x_ij × w_ij )
        skd = sum(x * w for x, w in zip(x_levels, w_ij))

        result[driver] = {
            "skd":        round(skd, 4),
            "avg_impact": round(min(1.0, skd / 2.0), 4),  # 0..1 for charts
            "n":          len(rows),
        }

    return result


def overall_impact(points: List[Dict]) -> float:
    """
    Step 4 — compute STRM and return severity in 0..1.

    STRM = Σ_{i ∈ A} ( SKD_i × w_i* )
    where:
        A    = set of ACTIVE drivers (those with at least one key point)
        w_i* = W_i / Σ_{k ∈ A} W_k   (normalize over active drivers ONLY)

    Normalizing over active drivers prevents score dilution when only
    1–2 PESTLE domains appear in the article.

    severity = STRM / 2   (maps the 0..2 STRM range to 0..1)
    """
    by_pestle = aggregate_by_pestle(points)

    # Identify active drivers (those that have at least one key point)
    active_drivers = [d for d in PESTLE_ORDER if by_pestle[d]["n"] > 0]

    if not active_drivers:
        return 0.0

    # Collect base weights for active drivers only, then normalize
    base_weights = [float(PESTLE_WEIGHTS.get(d, 0.0)) for d in active_drivers]
    w_star       = _normalize_weights(base_weights)

    # STRM = Σ ( SKD_i × w_i* )
    strm = sum(by_pestle[d]["skd"] * w for d, w in zip(active_drivers, w_star))

    # Normalize STRM (max possible = 2) to 0..1
    severity = min(1.0, strm / 2.0)
    return round(severity, 4)


def ddrm_status(overall_severity_0_1: float) -> Tuple[str, str]:
    """
    Step 5 — map severity (0..1) to Maintain / Adjust / Revise.

    Thresholds come from config.DDRM_THRESHOLDS:
        adjust  → lower bound of Adjust zone
        revise  → lower bound of Revise zone
    """
    adj = float(DDRM_THRESHOLDS.get("adjust", 0.35))
    rev = float(DDRM_THRESHOLDS.get("revise", 0.70))
    s   = float(overall_severity_0_1)

    if s >= rev:
        return "Revise",   f"STRM severity {s:.2f} ≥ {rev:.2f}"
    if s >= adj:
        return "Adjust",   f"STRM severity {s:.2f} in [{adj:.2f}, {rev:.2f})"
    return   "Maintain",   f"STRM severity {s:.2f} < {adj:.2f}"
