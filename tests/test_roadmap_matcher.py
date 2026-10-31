"""Tests for `core.roadmap_matcher` — match impact output to roadmap items.

This module is deterministic: given an impact result + a roadmap, it returns
the items whose PESTLE tags overlap with active drivers, ranked by score.
Tests use canned dicts only — no model loads.
"""

from __future__ import annotations

import pytest

from core import roadmap_matcher as rm


# ─── Tiny helpers ────────────────────────────────────────────────────────────


def _impact(*, by_pestle: dict | None = None, evidence: list | None = None) -> dict:
    """Build a minimal impact_result dict for tests."""
    return {"by_pestle": by_pestle or {}, "evidence": evidence or []}


def _pestle_info(*, n_active=0, n=0, skd=0.0, avg_impact=0.0) -> dict:
    return {"n_active": n_active, "n": n, "skd": skd, "avg_impact": avg_impact}


# ─── _safe_float ─────────────────────────────────────────────────────────────


def test_safe_float_parses_numeric():
    assert rm._safe_float(1.5) == 1.5
    assert rm._safe_float("2.0") == 2.0
    assert rm._safe_float(3) == 3.0


def test_safe_float_returns_default_on_invalid():
    assert rm._safe_float(None) == 0.0
    assert rm._safe_float("abc") == 0.0
    assert rm._safe_float({}, default=-1.0) == -1.0


# ─── _label_for_tag ──────────────────────────────────────────────────────────


def test_label_for_tag_maps_pestle_keys_to_full_labels():
    # Frontend uses short keys ("P", "E", "T"); backend wants full labels.
    assert rm._label_for_tag("P") == "Political"
    assert rm._label_for_tag("E") == "Economic"
    assert rm._label_for_tag("T") == "Technological"
    assert rm._label_for_tag("En") == "Environmental"


def test_label_for_tag_passes_through_unknown_tags():
    # Custom / already-full labels should round-trip unchanged.
    assert rm._label_for_tag("Political") == "Political"
    assert rm._label_for_tag("Custom") == "Custom"
    assert rm._label_for_tag("") == ""


# ─── active_drivers ──────────────────────────────────────────────────────────


def test_active_drivers_filters_zero_active():
    # n_active=0 means no key point in this driver crossed the tolerance band;
    # excluded from the active set so it cannot pull the verdict around.
    impact = _impact(by_pestle={
        "Political": _pestle_info(n_active=2, n=3, skd=1.5, avg_impact=0.75),
        "Economic": _pestle_info(n_active=0, n=4, skd=0.0, avg_impact=0.0),
    })
    drivers = rm.active_drivers(impact)
    assert len(drivers) == 1
    assert drivers[0]["driver"] == "Political"


def test_active_drivers_sorted_by_severity_then_priority():
    # Tie-breaker rules: sort by severity, then priority (=skd), then count.
    impact = _impact(by_pestle={
        "Political": _pestle_info(n_active=1, n=1, skd=1.0, avg_impact=0.5),
        "Economic": _pestle_info(n_active=2, n=2, skd=2.0, avg_impact=0.9),
        "Social": _pestle_info(n_active=1, n=1, skd=1.5, avg_impact=0.5),
    })
    names = [d["driver"] for d in rm.active_drivers(impact)]
    # Economic (sev=0.9) first; then between Political and Social (both sev=0.5)
    # Social wins because higher priority (skd=1.5 vs 1.0).
    assert names == ["Economic", "Social", "Political"]


# ─── normalize_roadmap_items ─────────────────────────────────────────────────


def test_normalize_roadmap_items_empty_roadmap():
    assert rm.normalize_roadmap_items({}) == []
    assert rm.normalize_roadmap_items({"items": []}) == []


def test_normalize_roadmap_items_resolves_layer_and_band_labels():
    roadmap = {
        "categories": [{"id": "c1", "label": "Drivers"}],
        "bands": [{"id": "b1", "label": "Now"}, {"id": "b2", "label": "Next"}],
        "items": [{
            "id": "i1",
            "name": "GenAI growth",
            "catId": "c1",
            "bands": ["b1", "b2"],
            "pestle": ["T", "E"],
            "description": "test",
        }],
    }
    rows = rm.normalize_roadmap_items(roadmap)
    assert len(rows) == 1
    item = rows[0]
    assert item["item_id"] == "i1"
    assert item["item_name"] == "GenAI growth"
    assert item["layer"] == "Drivers"
    assert item["time_bands"] == ["Now", "Next"]
    # PESTLE keys are expanded to full labels for downstream matching.
    assert item["pestle_tags"] == ["Technological", "Economic"]


def test_normalize_roadmap_items_handles_missing_fields():
    # Item with no name, no catId, no bands — should still produce a row with
    # safe defaults rather than crashing.
    roadmap = {"items": [{}]}
    rows = rm.normalize_roadmap_items(roadmap)
    assert len(rows) == 1
    assert rows[0]["item_name"] == "Untitled item"
    assert rows[0]["item_id"].startswith("item_")
    assert rows[0]["layer"] == ""


# ─── match_roadmap_items ─────────────────────────────────────────────────────


def _roadmap_with_items(items: list[dict]) -> dict:
    """Test roadmap with full PESTLE label coverage so any item can match."""
    return {
        "categories": [{"id": "c1", "label": "Layer 1"}],
        "bands": [{"id": "b1", "label": "Now"}],
        "items": items,
    }


def test_match_roadmap_items_returns_empty_when_no_active_drivers():
    impact = _impact(by_pestle={
        "Political": _pestle_info(n_active=0),
    })
    roadmap = _roadmap_with_items([
        {"id": "i1", "name": "x", "catId": "c1", "bands": ["b1"], "pestle": ["P"]},
    ])
    assert rm.match_roadmap_items(impact, roadmap) == []


def test_match_roadmap_items_returns_empty_when_no_pestle_overlap():
    # Active driver = Political, item tagged Economic only → no overlap.
    impact = _impact(by_pestle={
        "Political": _pestle_info(n_active=1, n=1, skd=2.0, avg_impact=1.0),
    })
    roadmap = _roadmap_with_items([
        {"id": "i1", "name": "x", "catId": "c1", "bands": ["b1"], "pestle": ["E"]},
    ])
    assert rm.match_roadmap_items(impact, roadmap) == []


def test_match_roadmap_items_ranks_more_overlapping_drivers_first():
    # Item A overlaps 2 active drivers, Item B overlaps 1 — A should rank higher.
    impact = _impact(by_pestle={
        "Political": _pestle_info(n_active=1, n=1, skd=1.0, avg_impact=0.5),
        "Economic": _pestle_info(n_active=1, n=1, skd=1.0, avg_impact=0.5),
    })
    roadmap = _roadmap_with_items([
        {"id": "a", "name": "Item A", "catId": "c1", "bands": ["b1"], "pestle": ["P", "E"]},
        {"id": "b", "name": "Item B", "catId": "c1", "bands": ["b1"], "pestle": ["P"]},
    ])
    matches = rm.match_roadmap_items(impact, roadmap)
    assert [m["item_id"] for m in matches] == ["a", "b"]
    assert matches[0]["matched_drivers"] == ["Economic", "Political"]
    assert matches[1]["matched_drivers"] == ["Political"]


def test_match_roadmap_items_respects_limit():
    impact = _impact(by_pestle={
        "Political": _pestle_info(n_active=1, n=1, skd=1.0, avg_impact=0.5),
    })
    items = [
        {"id": f"i{n}", "name": f"Item {n}", "catId": "c1", "bands": ["b1"], "pestle": ["P"]}
        for n in range(20)
    ]
    matches = rm.match_roadmap_items(impact, _roadmap_with_items(items), limit=3)
    assert len(matches) == 3
