"""Simple guidance layer for matched roadmap items.

The LLM-facing boundary lives here, but default output is deterministic so the
prototype works without API keys. Impact verdict is treated as fixed input.
"""

from __future__ import annotations

import json
import os
from typing import Dict, List

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

GUIDANCE_SCHEMA = {
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
                    "evidence_basis": {"type": "string"},
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
                    "evidence_basis",
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
            if sentence and sentence not in seen:
                seen.add(sentence)
                rows.append(sentence)
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
Each item_guidance entry must cite matched roadmap item name and evidence basis.
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
                    "schema": GUIDANCE_SCHEMA,
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
        evidence_basis = evidence[0].get("sentence", "") if evidence else ""

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
            "evidence_basis": evidence_basis,
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
