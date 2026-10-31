"""Tests for `core.guidance` — pure helpers only.

The expert-workshop and OpenRouter HTTP paths are intentionally NOT tested here
(they require network + API keys). We test the deterministic helpers that
shape and merge the data: filtering, evidence selection, expert-result merge,
and legacy-shape flattening.
"""

from __future__ import annotations

import pytest

from core import guidance as g


# ─── _top_evidence ───────────────────────────────────────────────────────────


def test_top_evidence_dedups_by_sentence():
    # Same sentence appearing in two matches should appear only once.
    matches = [
        {"matched_evidence": [{"id": "K1", "sentence": "alpha"}]},
        {"matched_evidence": [{"id": "K1", "sentence": "alpha"}]},
    ]
    assert g._top_evidence(matches) == ["K1 alpha"]


def test_top_evidence_respects_limit():
    matches = [{
        "matched_evidence": [
            {"id": f"K{i}", "sentence": f"s{i}"} for i in range(10)
        ]
    }]
    assert len(g._top_evidence(matches, limit=3)) == 3


def test_top_evidence_handles_missing_id():
    # Missing keypoint id → "?" placeholder so the prompt still has a citation slot.
    matches = [{"matched_evidence": [{"sentence": "alpha"}]}]
    assert g._top_evidence(matches) == ["? alpha"]


# ─── _filter_keypoints_for_role / _filter_matches_for_role ───────────────────


def test_filter_keypoints_for_role():
    impact = {"evidence": [
        {"id": "K1", "pestle": "Political"},
        {"id": "K2", "pestle": "Economic"},
        {"id": "K3", "pestle": "Political"},
    ]}
    out = g._filter_keypoints_for_role(impact, "Political")
    assert [e["id"] for e in out] == ["K1", "K3"]


def test_filter_keypoints_for_role_empty():
    assert g._filter_keypoints_for_role({"evidence": []}, "Political") == []
    assert g._filter_keypoints_for_role({}, "Political") == []


def test_filter_matches_for_role_includes_only_matching_drivers():
    matches = [
        {"item_id": "a", "matched_drivers": ["Political", "Economic"]},
        {"item_id": "b", "matched_drivers": ["Economic"]},
        {"item_id": "c", "matched_drivers": []},
    ]
    out = g._filter_matches_for_role(matches, "Political")
    assert [m["item_id"] for m in out] == ["a"]


# ─── _resolve_keypoint ───────────────────────────────────────────────────────


def test_resolve_keypoint_returns_compact_record():
    evidence_by_id = {"K1": {
        "id": "K1",
        "sentence": "alpha",
        "pestle": "Political",
        "sentiment_label": "negative",
    }}
    kp = g._resolve_keypoint("K1", evidence_by_id)
    assert kp == {
        "id": "K1",
        "sentence": "alpha",
        "pestle": "Political",
        "sentiment_label": "negative",
    }


def test_resolve_keypoint_returns_none_for_unknown_id():
    assert g._resolve_keypoint("K99", {}) is None
    assert g._resolve_keypoint("", {"K1": {"id": "K1"}}) is None


# ─── _merge_expert_results ───────────────────────────────────────────────────


def _impact_for_merge() -> dict:
    return {"evidence": [
        {"id": "K1", "sentence": "policy news", "pestle": "Political", "sentiment_label": "negative"},
        {"id": "K2", "sentence": "market news", "pestle": "Economic", "sentiment_label": "positive"},
    ]}


def _matches_for_merge() -> list[dict]:
    return [
        {"item_id": "i1", "item_name": "Roadmap A", "layer": "Drivers",
         "time_bands": ["Now"], "matched_drivers": ["Political", "Economic"]},
    ]


def test_merge_expert_results_single_role():
    per_expert = {"Political": {"item_advices": [
        {"item_id": "i1", "item_name": "Roadmap A",
         "advice": "Watch policy",  "evidence_keypoint_id": "K1"},
    ]}}
    out = g._merge_expert_results(per_expert, _matches_for_merge(), "Adjust", _impact_for_merge())
    assert "i1" in out
    assert len(out["i1"]["advices"]) == 1
    advice = out["i1"]["advices"][0]
    assert advice["role"] == "Political"
    # Action is ALWAYS the global verdict, never per-item.
    assert advice["action"] == "Adjust"
    assert advice["evidence_keypoint"]["id"] == "K1"


def test_merge_expert_results_stacks_multiple_roles():
    per_expert = {
        "Political": {"item_advices": [
            {"item_id": "i1", "item_name": "Roadmap A",
             "advice": "p-advice", "evidence_keypoint_id": "K1"},
        ]},
        "Economic": {"item_advices": [
            {"item_id": "i1", "item_name": "Roadmap A",
             "advice": "e-advice", "evidence_keypoint_id": "K2"},
        ]},
    }
    out = g._merge_expert_results(per_expert, _matches_for_merge(), "Revise", _impact_for_merge())
    roles = sorted(a["role"] for a in out["i1"]["advices"])
    assert roles == ["Economic", "Political"]
    # Both advices share the global verdict — no per-item action override.
    assert all(a["action"] == "Revise" for a in out["i1"]["advices"])


def test_merge_expert_results_skips_entries_without_item_id():
    per_expert = {"Political": {"item_advices": [
        {"item_name": "no id", "advice": "x", "evidence_keypoint_id": "K1"},
    ]}}
    assert g._merge_expert_results(per_expert, [], "Adjust", _impact_for_merge()) == {}


# ─── _flatten_for_legacy ─────────────────────────────────────────────────────


def test_flatten_for_legacy_uses_first_advice_as_primary():
    expert_advices = {"i1": {
        "item_id": "i1",
        "item_name": "Roadmap A",
        "layer": "Drivers",
        "time_bands": ["Now"],
        "matched_drivers": ["Political", "Economic"],
        "advices": [
            {"role": "Political", "action": "Adjust", "advice": "p-advice", "evidence_keypoint": {"id": "K1"}},
            {"role": "Economic",  "action": "Adjust", "advice": "e-advice", "evidence_keypoint": None},
        ],
    }}
    out = g._flatten_for_legacy(expert_advices, policy_action="rescope")
    assert len(out) == 1
    legacy = out[0]
    # Action carried through from primary advice; falls back to policy_action otherwise.
    assert legacy["action"] == "Adjust"
    # suggested_change concatenates ALL roles, not just the primary.
    assert "[Political] p-advice" in legacy["suggested_change"]
    assert "[Economic] e-advice" in legacy["suggested_change"]
    # Reason mentions every reviewer role.
    assert "Political" in legacy["reason"] and "Economic" in legacy["reason"]
    # Evidence_keypoint picks the first advice that has one (Political here).
    assert legacy["evidence_keypoint"] == {"id": "K1"}


def test_flatten_for_legacy_skips_items_without_advices():
    out = g._flatten_for_legacy({"i1": {"advices": []}}, policy_action="monitor")
    assert out == []


# ─── ACTION_BY_VERDICT ───────────────────────────────────────────────────────


def test_action_by_verdict_covers_three_verdicts():
    assert set(g.ACTION_BY_VERDICT.keys()) == {"Maintain", "Adjust", "Revise"}
    for policy in g.ACTION_BY_VERDICT.values():
        assert "default_action" in policy and "review_type" in policy and "summary" in policy
