"""Record or compare the ten English scenarios without making hosted AI calls.

python tools/readiness_check.py --record docs/readiness/baseline.json
python tools/readiness_check.py --compare docs/readiness/baseline.json --output tmp/updated-results.json
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import config
from ui.app import run_pipeline


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--record", type=Path)
    action.add_argument("--compare", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "tmp/updated-results.json")
    args = parser.parse_args()
    report = {
        "python": platform.python_version(),
        "packages": dict(sorted((d.metadata["Name"], d.version) for d in importlib.metadata.distributions())),
        "config": {k: v for k, v in vars(config).items() if k.isupper()},
        "scenarios": {},
    }
    baseline = json.loads(args.compare.read_text(encoding="utf-8")) if args.compare else None
    paths = sorted((ROOT / "testdata").glob("*.txt"))
    if len(paths) != 10 or (baseline and {p.name for p in paths} != set(baseline["scenarios"])):
        raise SystemExit("Expected the same ten English scenario files as the baseline.")
    failures = []
    for path in paths:
        # No roadmap means no guidance path, including on the original application.
        result = run_pipeline(path.read_text(encoding="utf-8"), "Text", None, 7, roadmap_json="", use_expert_workshop=False)
        row = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "verdict": result["verdict"],
               "severity_4dp": f"{result['severity']:.4f}", "result": result}
        report["scenarios"][path.name] = row
        if baseline:
            before = baseline["scenarios"][path.name]
            if any(row[k] != before[k] for k in ("sha256", "verdict", "severity_4dp")):
                failures.append(path.name)
        print(f"{path.name}: {row['verdict']} {row['severity_4dp']}", flush=True)
    destination = args.record or args.output
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if failures:
        raise SystemExit("Regression: " + ", ".join(failures))
    print(f"Recorded {len(report['scenarios'])} scenarios in {destination}")


if __name__ == "__main__":
    main()
