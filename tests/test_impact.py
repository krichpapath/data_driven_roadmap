"""Tests for `core.impact` — the 5-step DDRM scoring formula chain.

These tests pin every pure function in the pipeline (no model loads). A junior
developer can read these as worked examples of the formula chain.

Formula chain (mirrored from impact.py module docstring):
    Step 1  M_ij  = |d_ij| × c_ij × r_j
    Step 2  x_ij  = 0 / 1 / 2  (per-PESTLE tolerance bands)
    Step 3  SKD_i = Σ_j (x_ij × w_ij)
    Step 4  STRM  = Σ_{i∈A} (SKD_i × w_i*)
    Step 5  verdict ← compare STRM/2 to thresholds
"""

from __future__ import annotations

import pytest

from core import impact


# ─── Step 1: _magnitude ──────────────────────────────────────────────────────


def test_magnitude_neutral_sentiment_is_zero():
    # |d|=0 wipes the whole product regardless of confidence/relevance.
    assert impact._magnitude(sentiment_score=0, sent_conf=1.0, relevance=1.0) == 0.0


def test_magnitude_max_inputs_caps_at_one():
    assert impact._magnitude(sentiment_score=1, sent_conf=1.0, relevance=1.0) == 1.0
    assert impact._magnitude(sentiment_score=-1, sent_conf=1.0, relevance=1.0) == 1.0


def test_magnitude_clamps_out_of_range_inputs():
    # Out-of-range confidence/relevance are clamped to [0, 1].
    assert impact._magnitude(sentiment_score=1, sent_conf=2.5, relevance=2.0) == 1.0
    assert impact._magnitude(sentiment_score=1, sent_conf=-0.5, relevance=0.5) == 0.0


def test_magnitude_intermediate_value():
    # 1 × 0.8 × 0.5 = 0.40
    assert impact._magnitude(sentiment_score=1, sent_conf=0.8, relevance=0.5) == pytest.approx(0.40)


# ─── Step 2: _discretize ─────────────────────────────────────────────────────


def test_discretize_below_low_returns_zero():
    # default band: low=0.35, high=0.60
    assert impact._discretize(0.10, "default") == 0


def test_discretize_at_low_returns_one():
    # boundary: M >= τ_low and M < τ_high → moderate (1)
    assert impact._discretize(0.35, "default") == 1
    assert impact._discretize(0.59, "default") == 1


def test_discretize_at_high_returns_two():
    assert impact._discretize(0.60, "default") == 2
    assert impact._discretize(0.95, "default") == 2


def test_discretize_unknown_pestle_falls_back_to_default():
    # Unknown driver name should not crash; falls back to TOLERANCE_BANDS["default"].
    assert impact._discretize(0.40, "NotAPestleDriver") == 1


# ─── Helper: _normalize_weights ──────────────────────────────────────────────


def test_normalize_weights_sums_to_one():
    weights = impact._normalize_weights([1.0, 2.0, 3.0])
    assert sum(weights) == pytest.approx(1.0)
    assert weights == pytest.approx([1 / 6, 2 / 6, 3 / 6])


def test_normalize_weights_uniform_when_all_zero():
    # Fallback path: when total mass is zero, distribute uniformly.
    assert impact._normalize_weights([0.0, 0.0, 0.0]) == pytest.approx([1 / 3, 1 / 3, 1 / 3])


def test_normalize_weights_handles_empty():
    assert impact._normalize_weights([]) == []


def test_normalize_weights_clamps_negative_to_zero():
    weights = impact._normalize_weights([-1.0, 2.0])
    # Negative weight is clamped to 0 before normalization.
    assert weights == pytest.approx([0.0, 1.0])


# ─── Step 3: aggregate_by_pestle ─────────────────────────────────────────────


def _point(pestle: str, *, score=1, conf=1.0, rel=1.0) -> dict:
    """Test helper — build a key-point dict matching the pipeline contract."""
    return {
        "pestle": pestle,
        "sentiment_score": score,
        "sent_confidence": conf,
        "relevance": rel,
    }


def test_aggregate_by_pestle_empty_input():
    result = impact.aggregate_by_pestle([])
    # Every PESTLE driver appears with zero values.
    assert set(result.keys()) == set(impact.PESTLE_ORDER)
    for driver in impact.PESTLE_ORDER:
        assert result[driver] == {"skd": 0.0, "avg_impact": 0.0, "n": 0, "n_active": 0}


def test_aggregate_by_pestle_single_strong_point():
    # One Political point, full magnitude → x=2, w=1.0 → SKD=2.0, avg=1.0.
    result = impact.aggregate_by_pestle([_point("Political")])
    assert result["Political"]["n"] == 1
    assert result["Political"]["n_active"] == 1
    assert result["Political"]["skd"] == pytest.approx(2.0)
    assert result["Political"]["avg_impact"] == pytest.approx(1.0)
    # Other drivers untouched.
    assert result["Economic"]["n"] == 0


def test_aggregate_by_pestle_below_tolerance_is_inactive():
    # Magnitude under τ_low → x=0 → counted but not active.
    result = impact.aggregate_by_pestle([_point("Political", conf=0.1, rel=0.1)])
    assert result["Political"]["n"] == 1
    assert result["Political"]["n_active"] == 0
    assert result["Political"]["skd"] == 0.0


def test_aggregate_by_pestle_unknown_driver_does_not_crash():
    # Unrecognised PESTLE labels (e.g. "Unclassified") are silently dropped from
    # the canonical six. They go into a separate group, not into Political/etc.
    result = impact.aggregate_by_pestle([_point("Unclassified")])
    for driver in impact.PESTLE_ORDER:
        assert result[driver]["n"] == 0


# ─── Step 4: overall_impact ──────────────────────────────────────────────────


def test_overall_impact_empty_input_is_zero():
    assert impact.overall_impact([]) == 0.0


def test_overall_impact_no_active_drivers_is_zero():
    # All points below tolerance → no active drivers → severity 0.
    points = [_point("Political", conf=0.1, rel=0.1)]
    assert impact.overall_impact(points) == 0.0


def test_overall_impact_normalizes_only_over_active_drivers():
    # Even though Political has weight 0.20 in PESTLE_WEIGHTS, when it's the
    # SOLE active driver its w_i* is 1.0 (renormalized over active set).
    # SKD=2 × w*=1 = STRM=2 → severity = 2/2 = 1.0.
    points = [_point("Political")]
    assert impact.overall_impact(points) == pytest.approx(1.0)


# ─── Step 5: ddrm_status ─────────────────────────────────────────────────────


def test_ddrm_status_maintain():
    verdict, reason = impact.ddrm_status(0.10)
    assert verdict == "Maintain"
    assert "0.10" in reason


def test_ddrm_status_adjust():
    verdict, _ = impact.ddrm_status(0.50)
    assert verdict == "Adjust"


def test_ddrm_status_revise():
    verdict, _ = impact.ddrm_status(0.95)
    assert verdict == "Revise"


def test_ddrm_status_threshold_boundaries():
    # severity exactly at the lower bound goes UP into the higher band.
    adj_threshold = impact.DDRM_THRESHOLDS["adjust"]
    rev_threshold = impact.DDRM_THRESHOLDS["revise"]
    assert impact.ddrm_status(adj_threshold)[0] == "Adjust"
    assert impact.ddrm_status(rev_threshold)[0] == "Revise"
