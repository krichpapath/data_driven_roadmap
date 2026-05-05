"""Match DDRM impact output to roadmap-builder items.

This module stays deterministic on purpose. Impact math decides the verdict;
matching only narrows the roadmap to items with overlapping PESTLE drivers.
"""

from __future__ import annotations

from typing import Dict, List


PESTLE_KEY_TO_LABEL = {
    "P": "Political",
    "E": "Economic",
    "S": "Social",
    "T": "Technological",
    "L": "Legal",
    "En": "Environmental",
}

PESTLE_LABEL_TO_KEY = {v: k for k, v in PESTLE_KEY_TO_LABEL.items()}


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _label_for_tag(tag: str) -> str:
    tag = str(tag or "").strip()
    return PESTLE_KEY_TO_LABEL.get(tag, tag)


def active_drivers(impact_result: Dict) -> List[Dict]:
    """Return active PESTLE drivers ranked by impact priority."""
    rows = []
    by_pestle = impact_result.get("by_pestle") or {}
    for driver, info in by_pestle.items():
        n_active = int(info.get("n_active", 0) or 0)
        if n_active <= 0:
            continue
        rows.append({
            "driver": driver,
            "priority": _safe_float(info.get("skd")),
            "severity": _safe_float(info.get("avg_impact")),
            "evidence_count": int(info.get("n", 0) or 0),
            "active_evidence_count": n_active,
        })
    return sorted(
        rows,
        key=lambda r: (r["severity"], r["priority"], r["active_evidence_count"]),
        reverse=True,
    )


def normalize_roadmap_items(roadmap: Dict) -> List[Dict]:
    """Flatten roadmap-builder JSON into match-ready item records."""
    categories = {c.get("id"): c for c in roadmap.get("categories", [])}
    bands = {b.get("id"): b for b in roadmap.get("bands", [])}

    rows = []
    for idx, item in enumerate(roadmap.get("items", []), 1):
        item_tags = [_label_for_tag(tag) for tag in item.get("pestle", [])]
        cat = categories.get(item.get("catId"), {})
        item_bands = [bands.get(bid, {}) for bid in item.get("bands", [])]

        rows.append({
            "item_id": item.get("id") or f"item_{idx}",
            "item_name": item.get("name") or "Untitled item",
            "description": item.get("description") or "",
            "layer_id": item.get("catId") or "",
            "layer": cat.get("label") or item.get("catId") or "",
            "time_band_ids": list(item.get("bands", [])),
            "time_bands": [b.get("label") for b in item_bands if b.get("label")],
            "pestle_tags": item_tags,
            "raw": item,
        })
    return rows


def _evidence_for_drivers(impact_result: Dict, drivers: set[str], limit: int = 3) -> List[Dict]:
    evidence = [
        e for e in impact_result.get("evidence", [])
        if e.get("pestle") in drivers
    ]
    evidence = sorted(
        evidence,
        key=lambda e: abs(_safe_float(e.get("signed_contribution"))),
        reverse=True,
    )
    return evidence[:limit]


def match_roadmap_items(impact_result: Dict, roadmap: Dict, limit: int = 10) -> List[Dict]:
    """Match roadmap items by active PESTLE overlap and rank strongest first."""
    drivers = active_drivers(impact_result)
    if not drivers:
        return []

    driver_by_name = {d["driver"]: d for d in drivers}
    active_names = set(driver_by_name)
    matches = []

    for item in normalize_roadmap_items(roadmap):
        item_drivers = set(item["pestle_tags"])
        overlap = sorted(item_drivers & active_names)
        if not overlap:
            continue

        overlap_severity = sum(driver_by_name[d]["severity"] for d in overlap)
        overlap_priority = sum(driver_by_name[d]["priority"] for d in overlap)
        overlap_bonus = min(0.2, 0.05 * len(overlap))
        match_score = min(1.0, (overlap_severity * 0.65) + (overlap_priority * 0.25) + overlap_bonus)

        matches.append({
            **item,
            "matched_drivers": overlap,
            "match_score": round(match_score, 4),
            "matched_evidence": _evidence_for_drivers(impact_result, set(overlap)),
            "reason": "Shares active PESTLE driver(s): " + ", ".join(overlap),
        })

    return sorted(
        matches,
        key=lambda m: (m["match_score"], len(m["matched_drivers"]), m["item_name"]),
        reverse=True,
    )[:limit]
