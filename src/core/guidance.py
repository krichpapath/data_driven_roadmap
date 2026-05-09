"""Simple guidance layer for matched roadmap items.

The LLM-facing boundary lives here, but default output is deterministic so the
prototype works without API keys. Impact verdict is treated as fixed input.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
from typing import Dict, List, Optional

import requests


ACTION_BY_VERDICT = {
    "Maintain": {
        "review_type": "monitor",
        "default_action": "monitor",
        "summary": "Impact is low. Keep roadmap unchanged, but watch matched items.",
    },
    "Adjust": {
        "review_type": "focused review",
        "default_action": "rescope",
        "summary": "Impact is material. Review matched items and adjust scope, timing, or dependencies.",
    },
    "Revise": {
        "review_type": "formal revision",
        "default_action": "revise",
        "summary": "Impact is high. Treat matched items as candidates for formal roadmap revision.",
    },
}

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini"

def build_guidance_schema(keypoint_ids: List[str]) -> Dict:
    """Per-call schema for single-shot LLM path. evidence_keypoint_id enum-restricted
    to actual keypoint IDs to prevent hallucinated citations."""
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "summary": {"type": "string"},
            "recommended_action": {"type": "string"},
            "review_type": {"type": "string"},
            "item_guidance": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "item_id": {"type": "string"},
                        "item_name": {"type": "string"},
                        "layer": {"type": "string"},
                        "time_bands": {"type": "array", "items": {"type": "string"}},
                        "matched_drivers": {"type": "array", "items": {"type": "string"}},
                        "action": {"type": "string"},
                        "reason": {"type": "string"},
                        "suggested_change": {"type": "string"},
                        "evidence_keypoint_id": {
                            "type": "string",
                            "enum": keypoint_ids or [""],
                        },
                    },
                    "required": [
                        "item_id",
                        "item_name",
                        "layer",
                        "time_bands",
                        "matched_drivers",
                        "action",
                        "reason",
                        "suggested_change",
                        "evidence_keypoint_id",
                    ],
                },
            },
            "questions_for_humans": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "summary",
            "recommended_action",
            "review_type",
            "item_guidance",
            "questions_for_humans",
        ],
    }


def _load_dotenv(path: str = ".env") -> None:
    """Tiny .env loader to avoid adding a dependency."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def _openrouter_key() -> str:
    _load_dotenv()
    return os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENROUTER") or ""


def _openrouter_model() -> str:
    _load_dotenv()
    return os.getenv("OPENROUTER_MODEL") or DEFAULT_OPENROUTER_MODEL


def _top_evidence(matches: List[Dict], limit: int = 5) -> List[str]:
    seen = set()
    rows = []
    for match in matches:
        for ev in match.get("matched_evidence", []):
            sentence = ev.get("sentence")
            kp_id = ev.get("id") or "?"
            if sentence and sentence not in seen:
                seen.add(sentence)
                rows.append(f"{kp_id} {sentence}")
            if len(rows) >= limit:
                return rows
    return rows


def build_llm_prompt(impact_result: Dict, matches: List[Dict]) -> str:
    """Prompt template for later real LLM integration."""
    verdict = impact_result.get("verdict", "Maintain")
    severity = impact_result.get("severity", 0)
    match_lines = "\n".join(
        f"- {m['item_name']} | layer={m['layer']} | drivers={', '.join(m['matched_drivers'])}"
        for m in matches[:8]
    )
    evidence_lines = "\n".join(f"- {s}" for s in _top_evidence(matches))
    return f"""You are a DDRM roadmap advisor.
Do not recalculate the DDRM verdict. Treat it as fixed.

Fixed DDRM result:
- verdict: {verdict}
- severity: {severity}

Matched roadmap items:
{match_lines or "- none"}

Evidence:
{evidence_lines or "- none"}

Return concise JSON with:
summary, recommended_action, item_guidance[], questions_for_humans[].
Each item_guidance entry must include evidence_keypoint_id matching one of the K-IDs above (e.g. "K3").
"""


def _compact_payload(impact_result: Dict, matches: List[Dict]) -> Dict:
    return {
        "impact": {
            "title": impact_result.get("title"),
            "verdict": impact_result.get("verdict"),
            "severity": impact_result.get("severity"),
            "reason": impact_result.get("reason"),
            "by_pestle": impact_result.get("by_pestle"),
        },
        "matches": [
            {
                "item_id": m.get("item_id"),
                "item_name": m.get("item_name"),
                "layer": m.get("layer"),
                "time_bands": m.get("time_bands", []),
                "matched_drivers": m.get("matched_drivers", []),
                "match_score": m.get("match_score"),
                "reason": m.get("reason"),
                "matched_evidence": [
                    {
                        "pestle": e.get("pestle"),
                        "sentiment_label": e.get("sentiment_label"),
                        "impact": e.get("signed_contribution"),
                        "sentence": e.get("sentence"),
                    }
                    for e in m.get("matched_evidence", [])[:3]
                ],
            }
            for m in matches[:8]
        ],
    }


def _validate_guidance(raw: Dict, fallback: Dict) -> Dict:
    if not isinstance(raw, dict):
        raise ValueError("LLM guidance was not a JSON object.")

    required = ("summary", "recommended_action", "item_guidance", "questions_for_humans")
    missing = [k for k in required if k not in raw]
    if missing:
        raise ValueError("LLM guidance missing required fields: " + ", ".join(missing))

    raw.setdefault("review_type", fallback.get("review_type", "review"))
    raw.setdefault("severity", fallback.get("severity", 0.0))
    raw.setdefault("llm_prompt", fallback.get("llm_prompt", ""))
    return raw


def generate_openrouter_guidance(impact_result: Dict, matches: List[Dict], fallback: Dict) -> Dict:
    api_key = _openrouter_key()
    if not api_key or not matches:
        return fallback

    model = _openrouter_model()
    prompt = build_llm_prompt(impact_result, matches)
    payload = _compact_payload(impact_result, matches)
    keypoint_ids = [e.get("id") for e in impact_result.get("evidence", []) if e.get("id")]
    schema = build_guidance_schema(keypoint_ids)

    response = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://127.0.0.1:7860",
            "X-Title": "DDRM Roadmap Impact Review",
        },
        json={
            "model": model,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a DDRM roadmap advisor. Use the fixed impact verdict. "
                        "Do not recalculate severity. Return only guidance for matched roadmap items."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt + "\n\nDATA:\n" + json.dumps(payload, ensure_ascii=False),
                },
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "ddrm_roadmap_guidance",
                    "strict": True,
                    "schema": schema,
                },
            },
        },
        timeout=45,
    )
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    guidance = _validate_guidance(parsed, fallback)
    evidence_by_id = {e.get("id"): e for e in impact_result.get("evidence", []) if e.get("id")}
    for entry in guidance.get("item_guidance", []) or []:
        kp_id = entry.pop("evidence_keypoint_id", "")
        entry["evidence_keypoint"] = _resolve_keypoint(kp_id, evidence_by_id)
    guidance["llm_provider"] = "openrouter"
    guidance["llm_model"] = data.get("model") or model
    guidance["llm_prompt"] = prompt
    return guidance


def generate_guidance(impact_result: Dict, matches: List[Dict]) -> Dict:
    """Generate offline guidance from fixed verdict + deterministic matches."""
    verdict = impact_result.get("verdict", "Maintain")
    severity = float(impact_result.get("severity", 0.0) or 0.0)
    policy = ACTION_BY_VERDICT.get(verdict, ACTION_BY_VERDICT["Maintain"])

    if not matches:
        fallback = {
            "summary": "No roadmap items share active PESTLE drivers with this news.",
            "recommended_action": "Create or tag roadmap items for the active drivers before using LLM guidance.",
            "review_type": policy["review_type"],
            "item_guidance": [],
            "questions_for_humans": [
                "Does the current roadmap contain items tagged with the affected PESTLE drivers?",
                "Should a new roadmap item be added for this signal?",
            ],
            "llm_prompt": build_llm_prompt(impact_result, matches),
            "llm_provider": "deterministic",
        }
        return fallback

    item_guidance = []
    for match in matches[:8]:
        drivers = ", ".join(match.get("matched_drivers", []))
        band_text = " / ".join(match.get("time_bands", [])) or "current time band"
        evidence = match.get("matched_evidence", [])
        top_kp = evidence[0] if evidence else None
        evidence_keypoint = {
            "id": top_kp.get("id"),
            "sentence": top_kp.get("sentence", ""),
            "pestle": top_kp.get("pestle", ""),
            "sentiment_label": top_kp.get("sentiment_label", ""),
        } if top_kp else None

        if verdict == "Maintain":
            suggested_change = f"Keep '{match['item_name']}' unchanged; add monitoring note for {drivers}."
        elif verdict == "Adjust":
            suggested_change = f"Review '{match['item_name']}' in {band_text}; update scope, owner, or dependency for {drivers}."
        else:
            suggested_change = f"Escalate '{match['item_name']}' for roadmap revision; test whether timing and assumptions still hold."

        item_guidance.append({
            "item_id": match.get("item_id"),
            "item_name": match.get("item_name"),
            "layer": match.get("layer"),
            "time_bands": match.get("time_bands", []),
            "matched_drivers": match.get("matched_drivers", []),
            "action": policy["default_action"],
            "reason": match.get("reason", ""),
            "suggested_change": suggested_change,
            "evidence_keypoint": evidence_keypoint,
        })

    top_drivers = sorted({d for m in matches for d in m.get("matched_drivers", [])})
    fallback = {
        "summary": f"{policy['summary']} Affected driver(s): {', '.join(top_drivers)}.",
        "recommended_action": f"{policy['review_type'].title()} for {len(matches)} matched roadmap item(s).",
        "review_type": policy["review_type"],
        "severity": severity,
        "item_guidance": item_guidance,
        "questions_for_humans": [
            "Are matched item assumptions still valid after this news?",
            "Should timing move earlier, later, or stay unchanged?",
            "Do any missing owners, dependencies, or compliance checks need to be added?",
        ],
        "llm_prompt": build_llm_prompt(impact_result, matches),
        "llm_provider": "deterministic",
    }

    try:
        return generate_openrouter_guidance(impact_result, matches, fallback)
    except Exception as exc:
        fallback["llm_error"] = str(exc)
        return fallback


# ─────────────────────────────────────────────────────────────
# Per-PESTLE expert workshop guidance
# ─────────────────────────────────────────────────────────────

EXPERT_ROLE_DESCRIPTIONS = {
    "Political": "policy, government, elections, geopolitics, regulation by political bodies",
    "Economic": "markets, trade, business finance, macroeconomic conditions, costs",
    "Social": "public attitudes, demographics, culture, workforce, behavior shifts",
    "Technological": "technology, R&D, engineering innovation, adoption curves",
    "Legal": "laws, courts, compliance, contracts, formal regulation",
    "Environmental": "climate, ecology, sustainability, natural resource constraints",
}

def build_expert_schema(keypoint_ids: List[str]) -> Dict:
    """Build per-call EXPERT_SCHEMA. evidence_keypoint_id is enum-restricted to
    actual keypoint IDs in this expert's lane. Strict JSON-schema rejects any other
    value at the OpenRouter API boundary — eliminates citation hallucination.
    """
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "expert_summary": {"type": "string"},
            "item_advices": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "item_id": {"type": "string"},
                        "item_name": {"type": "string"},
                        "advice": {"type": "string"},
                        "evidence_keypoint_id": {
                            "type": "string",
                            "enum": keypoint_ids or [""],
                        },
                    },
                    "required": ["item_id", "item_name", "advice", "evidence_keypoint_id"],
                },
            },
        },
        "required": ["expert_summary", "item_advices"],
    }


def _filter_keypoints_for_role(impact_result: Dict, role: str) -> List[Dict]:
    return [
        e for e in impact_result.get("evidence", [])
        if e.get("pestle") == role
    ]


def _filter_matches_for_role(matches: List[Dict], role: str) -> List[Dict]:
    return [m for m in matches if role in (m.get("matched_drivers") or [])]


def _build_expert_prompt(role: str, role_keypoints: List[Dict], role_matches: List[Dict], verdict: str, severity: float) -> str:
    """Single template; role swapped in. Hand-crafted per-role prompts is a Phase 2 upgrade."""
    role_focus = EXPERT_ROLE_DESCRIPTIONS.get(role, role.lower())

    keypoint_lines = "\n".join(
        f"- {e.get('id')} [{e.get('sentiment_label', '?')}] {e.get('sentence', '')}"
        for e in role_keypoints
    ) or "- (no specific evidence; rely on overall verdict)"

    item_lines = "\n".join(
        f"- {m.get('item_id')} | {m.get('item_name')} | layer={m.get('layer')} | bands={', '.join(m.get('time_bands', []))} | tags={', '.join(m.get('pestle_tags', []))}"
        for m in role_matches
    ) or "- (none)"

    return f"""You are the {role} expert in a strategic roadmap risk-review workshop.
Your scope: {role_focus}.
Stay strictly within your domain — do not opine on other PESTLE dimensions.
The DDRM verdict ({verdict}, severity {severity:.2f}) is fixed; do not recompute.

Evidence in your domain (keypoints classified as {role}):
{keypoint_lines}

Roadmap items in your lane (tagged with {role}):
{item_lines}

For each item above, give one focused {role}-specific recommendation.
The DDRM verdict ({verdict}) is the fixed action — do not pick your own action label.
- advice: 1–2 sentences, concrete, actionable, tied to the {role} evidence. Justify why the fixed verdict applies through this {role} lens.
- evidence_keypoint_id: ID of the single keypoint above (e.g. "K3") that most justifies this advice. Must match an ID listed above exactly.
- expert_summary: 1 sentence overall {role}-lens take on the news
Return JSON only.
"""


def _compact_expert_payload(role: str, role_keypoints: List[Dict], role_matches: List[Dict]) -> Dict:
    return {
        "role": role,
        "keypoints": [
            {
                "id": e.get("id"),
                "sentence": e.get("sentence"),
                "sentiment_label": e.get("sentiment_label"),
                "impact": e.get("signed_contribution"),
                "relevance": e.get("relevance"),
            }
            for e in role_keypoints
        ],
        "items": [
            {
                "item_id": m.get("item_id"),
                "item_name": m.get("item_name"),
                "description": (m.get("raw") or {}).get("description", ""),
                "layer": m.get("layer"),
                "time_bands": m.get("time_bands", []),
                "pestle_tags": m.get("pestle_tags", []),
            }
            for m in role_matches
        ],
    }


def _validate_expert_response(raw: Dict, role: str) -> Dict:
    if not isinstance(raw, dict):
        raise ValueError(f"{role} expert response was not a JSON object.")
    advices = raw.get("item_advices")
    if not isinstance(advices, list):
        raise ValueError(f"{role} expert response missing 'item_advices' list.")
    return {
        "expert_summary": str(raw.get("expert_summary") or ""),
        "item_advices": advices,
    }


def _call_expert(role: str, role_keypoints: List[Dict], role_matches: List[Dict],
                 verdict: str, severity: float, model: str, api_key: str,
                 timeout: int = 45) -> Dict:
    """Single expert call. Returns {expert_summary, item_advices}. Raises on failure."""
    prompt = _build_expert_prompt(role, role_keypoints, role_matches, verdict, severity)
    payload = _compact_expert_payload(role, role_keypoints, role_matches)
    keypoint_ids = [e["id"] for e in role_keypoints if e.get("id")]
    schema = build_expert_schema(keypoint_ids)

    response = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://127.0.0.1:7860",
            "X-Title": f"DDRM {role} Expert",
        },
        json={
            "model": model,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        f"You are the {role} expert in a PESTLE workshop. "
                        f"Stay in your lane. Use the fixed DDRM verdict. Return only JSON."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt + "\n\nDATA:\n" + json.dumps(payload, ensure_ascii=False),
                },
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": f"ddrm_expert_{role.lower()}",
                    "strict": True,
                    "schema": schema,
                },
            },
        },
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    return _validate_expert_response(parsed, role)


def _resolve_keypoint(kp_id: str, evidence_by_id: Dict[str, Dict]) -> Optional[Dict]:
    """Resolve keypoint ID to compact citation object. Returns None if ID not found."""
    if not kp_id:
        return None
    src = evidence_by_id.get(kp_id)
    if not src:
        return None
    return {
        "id": src.get("id"),
        "sentence": src.get("sentence", ""),
        "pestle": src.get("pestle", ""),
        "sentiment_label": src.get("sentiment_label", ""),
    }


def _merge_expert_results(per_expert: Dict[str, Dict], matches: List[Dict], verdict: str,
                          impact_result: Dict) -> Dict[str, Dict]:
    """Merge per-role advice into per-item map keyed by item_id.

    Action = global DDRM verdict (Option A). LLM no longer picks per-item action;
    severity math owns classification. See FUTUREPLAN.md for Option C upgrade.

    Citation = evidence_keypoint resolved from LLM-returned ID against impact_result.evidence.
    Strict JSON-schema enum guarantees the ID was already valid at the API boundary.

    Output: { item_id: { item_name, layer, time_bands, matched_drivers, advices: [{role, action, advice, evidence_keypoint}] } }
    """
    by_id: Dict[str, Dict] = {}
    match_lookup = {m.get("item_id"): m for m in matches}
    evidence_by_id = {e.get("id"): e for e in impact_result.get("evidence", []) if e.get("id")}

    for role, response in per_expert.items():
        if not response:
            continue
        for entry in response.get("item_advices", []):
            item_id = entry.get("item_id")
            if not item_id:
                continue
            base = match_lookup.get(item_id, {})
            if item_id not in by_id:
                by_id[item_id] = {
                    "item_id": item_id,
                    "item_name": entry.get("item_name") or base.get("item_name", ""),
                    "layer": base.get("layer", ""),
                    "time_bands": base.get("time_bands", []),
                    "matched_drivers": list(base.get("matched_drivers", [])),
                    "advices": [],
                }
            kp = _resolve_keypoint(entry.get("evidence_keypoint_id", ""), evidence_by_id)
            by_id[item_id]["advices"].append({
                "role": role,
                "action": verdict,
                "advice": entry.get("advice", ""),
                "evidence_keypoint": kp,
            })

    return by_id


def _flatten_for_legacy(expert_advices: Dict[str, Dict], policy_action: str) -> List[Dict]:
    """Build old-shape `item_guidance` list from new expert_advices map.

    WHY: keeps any older consumer (or fallback path) working. Frontend rewrite reads
    `expert_advices` directly; legacy path reads `item_guidance`.
    """
    out = []
    for entry in expert_advices.values():
        advices = entry.get("advices", [])
        if not advices:
            continue
        # Use first expert advice as the legacy "primary"; concatenate roles in suggested_change.
        primary = advices[0]
        roles = ", ".join(a["role"] for a in advices)
        suggested = " | ".join(f"[{a['role']}] {a['advice']}" for a in advices)
        evidence_kp = next((a["evidence_keypoint"] for a in advices if a.get("evidence_keypoint")), None)
        out.append({
            "item_id": entry["item_id"],
            "item_name": entry["item_name"],
            "layer": entry["layer"],
            "time_bands": entry["time_bands"],
            "matched_drivers": entry["matched_drivers"],
            "action": primary.get("action") or policy_action,
            "reason": f"Reviewed by {roles} expert(s).",
            "suggested_change": suggested,
            "evidence_keypoint": evidence_kp,
        })
    return out


def generate_expert_guidance(impact_result: Dict, roadmap: Dict, matches: List[Dict]) -> Dict:
    """Run a parallel per-PESTLE-expert workshop and merge into per-item advice.

    Falls back to deterministic guidance if no API key, no matches, or no active drivers.
    """
    verdict = impact_result.get("verdict", "Maintain")
    severity = float(impact_result.get("severity", 0.0) or 0.0)
    policy = ACTION_BY_VERDICT.get(verdict, ACTION_BY_VERDICT["Maintain"])

    # Skip workshop entirely when news is low-impact. Saves all LLM calls.
    if verdict == "Maintain":
        return generate_guidance(impact_result, matches)

    api_key = _openrouter_key()
    if not api_key or not matches:
        # No API or nothing to advise on — use deterministic.
        return generate_guidance(impact_result, matches)

    by_pestle = impact_result.get("by_pestle") or {}
    active_roles = [
        role for role, info in by_pestle.items()
        if int(info.get("n_active", 0) or 0) > 0
    ]
    # Only roles that actually have matched items in their lane will produce advice.
    active_roles = [r for r in active_roles if _filter_matches_for_role(matches, r)]

    if not active_roles:
        return generate_guidance(impact_result, matches)

    model = _openrouter_model()

    per_expert: Dict[str, Dict] = {}
    expert_errors: Dict[str, str] = {}

    def _task(role: str) -> tuple[str, Optional[Dict], Optional[str]]:
        try:
            kps = _filter_keypoints_for_role(impact_result, role)
            mts = _filter_matches_for_role(matches, role)
            return role, _call_expert(role, kps, mts, verdict, severity, model, api_key), None
        except Exception as exc:
            return role, None, str(exc)

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(6, len(active_roles))) as pool:
        for role, result, err in pool.map(_task, active_roles):
            if err:
                expert_errors[role] = err
            else:
                per_expert[role] = result

    if not per_expert:
        # All experts failed — fall back to deterministic with error noted.
        fallback = generate_guidance(impact_result, matches)
        fallback["llm_error"] = "All expert calls failed: " + "; ".join(
            f"{r}: {e}" for r, e in expert_errors.items()
        )
        return fallback

    expert_advices = _merge_expert_results(per_expert, matches, verdict, impact_result)
    item_guidance = _flatten_for_legacy(expert_advices, policy["default_action"])

    expert_summaries = {role: resp.get("expert_summary", "") for role, resp in per_expert.items()}
    summary_parts = [s for s in expert_summaries.values() if s]
    summary_text = (
        f"{policy['summary']} {len(per_expert)} expert(s) weighed in: "
        f"{', '.join(per_expert.keys())}."
    )
    if summary_parts:
        summary_text += " " + " ".join(f"[{r}] {s}" for r, s in expert_summaries.items() if s)

    result = {
        "summary": summary_text,
        "recommended_action": f"{policy['review_type'].title()} for {len(expert_advices)} matched roadmap item(s).",
        "review_type": policy["review_type"],
        "severity": severity,
        "experts_active": list(per_expert.keys()),
        "expert_summaries": expert_summaries,
        "expert_advices": expert_advices,
        "item_guidance": item_guidance,
        "questions_for_humans": [
            "Do the expert recommendations align across PESTLE dimensions, or do they conflict?",
            "Are matched item assumptions still valid after this news?",
            "Should timing move earlier, later, or stay unchanged?",
        ],
        "llm_provider": "openrouter",
        "llm_model": model,
        "mode": "expert_workshop",
    }
    if expert_errors:
        result["expert_errors"] = expert_errors
    return result
