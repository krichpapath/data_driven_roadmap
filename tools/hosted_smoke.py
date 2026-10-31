"""One explicit, bounded paid request using synthetic data, never a user's roadmap.

Usage: python tools/hosted_smoke.py --run-hosted
Requires the configured OpenRouter key. Records model and usage, never credentials.
"""
import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from core import guidance

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--run-hosted", action="store_true", required=True)
parser.add_argument("--model", choices=guidance.GUIDANCE_MODELS, default=guidance.DEFAULT_OPENROUTER_MODEL)
parser.add_argument("--output", default="tmp/hosted-smoke-current.json")
args = parser.parse_args()
# Explicit smoke-test opt-in applies only to this process.
os.environ["DDRM_EXTERNAL_AI"] = "on"
evidence = {"id": "KP1", "sentence": "A new policy requires companies to review data retention annually.",
            "pestle": "Legal", "sentiment_label": "Negative"}
impact = {"verdict": "Adjust", "severity": 0.5, "evidence": [evidence]}
matches = [{"item_id": "smoke-1", "item_name": "Synthetic compliance pilot", "layer": "Technology",
            "matched_drivers": ["Legal"], "time_bands": ["Now"], "matched_evidence": [evidence]}]
usage = []
original_post = guidance.requests.post
def record_usage(*args, **kwargs):
    response = original_post(*args, **kwargs)
    if response.ok:
        data = response.json()
        usage.append({"model": data.get("model"), "provider": data.get("provider"), "usage": data.get("usage")})
    return response
guidance.requests.post = record_usage
result = guidance.generate_guidance(impact, matches, llm_model=args.model, allow_external_ai=True)
passed = (result.get("llm_provider") == "openrouter" and bool(result.get("item_guidance"))
          and all(row.get("item_id") == "smoke-1" and row.get("evidence_keypoint", {}).get("id") == "KP1"
                  for row in result.get("item_guidance", [])))
report = {"passed": passed, "requested_model": args.model,
          "max_output_tokens": guidance.guidance_request_options(args.model)["max_tokens"],
          "requests": usage, "result": result}
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({"passed": passed, "provider": result.get("llm_provider"), "model": result.get("llm_model"),
                  "requests": usage, "error": result.get("llm_error")}, indent=2))
sys.exit(0 if passed else 1)
