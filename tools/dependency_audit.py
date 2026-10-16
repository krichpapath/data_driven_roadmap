"""Read-only OSV audit of this interpreter's installed distributions.

Sends public package names/versions, never configuration or API credentials.
Usage: python tools/dependency_audit.py tmp/audit.json
"""
import concurrent.futures
import importlib.metadata
import json
from pathlib import Path
import sys
import urllib.request


def request(url, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


packages = sorted((d.metadata["Name"], d.version) for d in importlib.metadata.distributions())
queries = [{"package": {"name": name, "ecosystem": "PyPI"}, "version": version} for name, version in packages]
results = request("https://api.osv.dev/v1/querybatch", {"queries": queries})["results"]
affected = [{"name": name, "version": version, "advisories": [v["id"] for v in row.get("vulns", [])]}
            for (name, version), row in zip(packages, results) if row.get("vulns")]
ids = sorted({v for row in affected for v in row["advisories"]})
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    details = dict(zip(ids, pool.map(lambda id: request("https://api.osv.dev/v1/vulns/" + id), ids)))
report = {"package_count": len(packages), "affected": affected, "details": details}
path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({"package_count": len(packages), "affected": affected}, indent=2))
