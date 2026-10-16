"""End-to-end acceptance check: run every testdata scenario through the live API
and assert the verdict matches the filename prefix (maintain_/adjust_/revise_).

Usage: python tools/e2e_check.py [max_points]   (backend must be running on :7875)
"""
import json, pathlib, sys, urllib.request

API = "http://127.0.0.1:7875/api/recommend"
MAX_POINTS = int(sys.argv[1]) if len(sys.argv) > 1 else 7   # config.KEYPOINTS_MAX
DATA = pathlib.Path(__file__).resolve().parents[1] / "testdata"
roadmap = json.loads((DATA / "industrial_digital_roadmap_sample.json").read_text(encoding="utf-8"))
baseline = json.loads((DATA.parent / "docs/readiness/baseline.json").read_text(encoding="utf-8"))["scenarios"]
results = {}
paths = sorted(DATA.glob("*.txt"))
if len(paths) != 10 or {p.name for p in paths} != set(baseline):
    raise SystemExit("Expected the same ten English scenario files as the baseline.")

fails = []
for path in paths:
    expected = path.name.split("_")[0].capitalize()
    payload = json.dumps({
        "input_text": path.read_text(encoding="utf-8"),
        "input_mode": "Text", "max_points": MAX_POINTS,
        "roadmap": roadmap, "use_expert_workshop": False,
        "allow_external_ai": False,
    }).encode()
    req = urllib.request.Request(API, payload, {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            res = json.load(r)["result"]
    except Exception as exc:
        print(f"ERROR  {path.name}: {exc}"); fails.append(path.name); continue
    got = res.get("verdict")
    sev = res.get("severity", 0.0)   # 0.0 is a valid severity, do not `or`-default it
    expected_severity = baseline[path.name]["severity_4dp"]
    ok = "PASS" if got == expected and f"{sev:.4f}" == expected_severity and res["guidance"]["llm_provider"] == "deterministic" else "FAIL"
    results[path.name] = res
    if ok == "FAIL":
        fails.append(f"{path.name}: expected {expected}, got {got}")
    print(f"{ok}  {path.name:45s} expected={expected:9s} got={got!s:9s} severity={sev:.4f}")

print(f"\n{len(fails)} mismatch(es)" if fails else "\nall scenarios matched")
output = DATA.parent / "tmp/api-scenarios.json"
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
sys.exit(1 if fails else 0)
