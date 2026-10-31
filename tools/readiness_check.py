"""Record or compare the ten English scenarios without making hosted AI calls.

python tools/readiness_check.py --record testdata/baseline.json
python tools/readiness_check.py --compare testdata/baseline.json --output tmp/updated-results.json
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
        article = path.read_text(encoding="utf-8")  # same text on LF and CRLF checkouts
        result = run_pipeline(article, "Text", 7, roadmap_json="", use_expert_workshop=False)
        row = {"sha256": hashlib.sha256(article.encode("utf-8")).hexdigest(), "verdict": result["verdict"],
               "severity_4dp": f"{result['severity']:.4f}", "result": result}
        report["scenarios"][path.name] = row
        if baseline:
            before = baseline["scenarios"][path.name]
            if any(row[k] != before[k] for k in ("sha256", "verdict", "severity_4dp")):
                failures.append(path.name)
        print(f"{path.name}: {row['verdict']} {row['severity_4dp']}", flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.record:
        args.record.parent.mkdir(parents=True, exist_ok=True)
        expected = {name: {k: row[k] for k in ("sha256", "verdict", "severity_4dp")}
                    for name, row in report["scenarios"].items()}
        args.record.write_text(json.dumps({"scenarios": expected}, indent=2) + "\n", encoding="utf-8")
    if failures:
        raise SystemExit("Regression: " + ", ".join(failures))
    print(f"Checked {len(report['scenarios'])} scenarios. Full results: {args.output}")


if __name__ == "__main__":
    main()
