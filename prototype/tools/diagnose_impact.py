"""diagnose_impact.py — full DDRM pipeline diagnostic dump.

Runs the impact pipeline on one or more text files and prints, for every
key point, the values that feed the DDRM formula chain:

    M_ij = |d_ij| * c_ij * r_j        Step 1 magnitude
    x_ij in {0, 1, 2}                 Step 2 discretize via tolerance bands
    SKD_i = sum_j ( x_ij * w_ij )     Step 3 within-driver
    STRM  = sum_i ( SKD_i * w_i* )    Step 4 across-driver (active only)
    severity = STRM / 2               Step 5 mapped to verdict

For each pick we report:
    pestle | pestle_conf | sentiment | sent_conf | |d| | relevance |
    magnitude | x | tolerance band

Then per-driver SKD, active-driver weights, STRM, severity, verdict.
Also prints a "leak audit": where signal vanishes (neutral sentiment,
sub-tolerance magnitude, dropped driver, etc).

Run:
    python tools/diagnose_impact.py testdata/news_01_us_china_chip_war.txt
    python tools/diagnose_impact.py testdata/*.txt
"""

import sys
import json
from pathlib import Path

# Make `src/` importable.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from core.keypoints import extract_keypoints_rich
from core.pestle import classify_pestle
from core.sentiment import classify_sentiment
from core.impact import (
    aggregate_by_pestle,
    overall_impact,
    ddrm_status,
    _magnitude,
    _discretize,
    _tolerance,
    _normalize_weights,
    PESTLE_ORDER,
)
from config import DDRM_THRESHOLDS, PESTLE_WEIGHTS, KEYPOINTS_MAX


# ─── helpers ────────────────────────────────────────────────────────────────

def _hr(char="-", n=100):
    print(char * n)


def _fmt(v, w=8):
    if isinstance(v, float):
        return f"{v:>{w}.3f}"
    return f"{str(v):>{w}}"


def diagnose_file(path: Path, max_points: int = KEYPOINTS_MAX):
    text = path.read_text(encoding="utf-8")

    print()
    _hr("=")
    print(f"FILE: {path.name}")
    print(f"chars: {len(text)}    max_points: {max_points}")
    _hr("=")

    # 1. Keypoint extraction
    picks = extract_keypoints_rich(text, max_points=max_points)
    print(f"\n[1] Keypoints picked: {len(picks)}")

    rows = []
    for i, p in enumerate(picks, 1):
        sentence  = p["sentence"]
        relevance = p["relevance"]
        context   = p["context"]
        composite = p["composite"]

        # 2. PESTLE classify (on context)
        pestle = classify_pestle(context)

        # 3. Sentiment classify (on context, routed by PESTLE label)
        sent = classify_sentiment(context, pestle["label"])

        # 4. Reproduce formula values
        d_abs = abs(int(sent["score"]))
        c     = float(sent["confidence"])
        r     = float(relevance)
        mag   = _magnitude(sent["score"], c, r)
        x     = _discretize(mag, pestle["label"])
        tau_lo, tau_hi = _tolerance(pestle["label"])

        rows.append({
            "rank":       i,
            "pestle":     pestle["label"],
            "pestle_conf":pestle["confidence"],
            "sentiment":  sent["label"],
            "sent_score": int(sent["score"]),  # +1, 0, -1 (signed)
            "sent_conf":  c,
            "d_abs":      d_abs,
            "relevance":  r,
            "magnitude":  round(mag, 4),
            "x":          x,
            "tau_low":    tau_lo,
            "tau_high":   tau_hi,
            "sentence":   sentence,
            "model_id":   sent["model_id"],
        })

    # 2. Per-pick table
    print()
    print(f"{'#':>2}  {'pestle':<14}{'p_conf':>8}{'sent':>10}{'s_conf':>8}"
          f"{'|d|':>5}{'rel':>7}{'mag':>8}{'x':>4}   {'band':<14} sentence")
    _hr()
    for r in rows:
        band = f"[{r['tau_low']:.2f},{r['tau_high']:.2f})"
        sent_short = r["sentence"][:60] + ("..." if len(r["sentence"]) > 60 else "")
        print(
            f"{r['rank']:>2}  {r['pestle']:<14}"
            f"{r['pestle_conf']:>8.3f}"
            f"{r['sentiment']:>10}"
            f"{r['sent_conf']:>8.3f}"
            f"{r['d_abs']:>5}"
            f"{r['relevance']:>7.3f}"
            f"{r['magnitude']:>8.3f}"
            f"{r['x']:>4}   {band:<14} {sent_short}"
        )

    # 3. Aggregate per driver
    impact_points = [
        {
            "pestle":          r["pestle"],
            "sentiment_score": r["sent_score"],
            "sent_confidence": r["sent_conf"],
            "pestle_confidence": r["pestle_conf"],
            "relevance":       r["relevance"],
        }
        for r in rows
    ]
    by_pestle = aggregate_by_pestle(impact_points)
    severity  = overall_impact(impact_points)
    verdict, reason = ddrm_status(severity)

    print()
    print("[2] Per-driver SKD")
    _hr()
    active = []
    for d in PESTLE_ORDER:
        info = by_pestle[d]
        n = info["n"]
        skd = info["skd"]
        avg = info["avg_impact"]
        marker = " (active)" if n > 0 else ""
        print(f"  {d:<14}  n={n:>2}  SKD={skd:>5.3f}  avg={avg:>5.3f}{marker}")
        if n > 0:
            active.append(d)

    print()
    print("[3] Cross-driver weighting (Step 4)")
    _hr()
    base_w = [float(PESTLE_WEIGHTS.get(d, 0.0)) for d in active]
    w_star = _normalize_weights(base_w) if active else []
    for d, bw, ws in zip(active, base_w, w_star):
        skd = by_pestle[d]["skd"]
        contrib = skd * ws
        print(f"  {d:<14}  W_i={bw:.3f}   w*={ws:.3f}   SKD*w*={contrib:.4f}")

    strm = sum(by_pestle[d]["skd"] * w for d, w in zip(active, w_star)) if active else 0.0
    print()
    print(f"[4] STRM (raw, 0..2):  {strm:.4f}")
    print(f"[5] severity = STRM/2:  {severity:.4f}")
    print(f"    thresholds: adjust>={DDRM_THRESHOLDS['adjust']}  revise>={DDRM_THRESHOLDS['revise']}")
    print(f"    VERDICT:    {verdict}   ({reason})")

    # Leak audit
    print()
    print("[6] Leak audit — where does signal vanish?")
    _hr()
    leaks = {
        "neutral_sentiment":      sum(1 for r in rows if r["sentiment"] == "neutral"),
        "sub_tolerance_low":      sum(1 for r in rows if r["x"] == 0 and r["d_abs"] != 0),
        "zero_d_zero_mag":        sum(1 for r in rows if r["d_abs"] == 0),
        "low_relevance_<0.5":     sum(1 for r in rows if r["relevance"] < 0.5),
        "low_sent_conf_<0.6":     sum(1 for r in rows if r["sent_conf"] < 0.6),
    }
    for k, v in leaks.items():
        print(f"  {k:<28} {v}/{len(rows)}")

    inactive = [d for d in PESTLE_ORDER if by_pestle[d]["n"] == 0]
    print(f"  inactive drivers:           {inactive}")
    print(f"  active driver count:        {len(active)}")
    if active:
        env_w = [float(PESTLE_WEIGHTS.get(d, 0.0)) for d in active]
        max_possible = sum(2.0 * w for w in _normalize_weights(env_w))
        print(f"  max-possible STRM (all x=2):{max_possible:.4f}    severity-cap: {max_possible/2.0:.4f}")

    return {
        "file":     path.name,
        "rows":     rows,
        "by_pestle": by_pestle,
        "severity": severity,
        "verdict":  verdict,
        "leaks":    leaks,
    }


def main():
    args = sys.argv[1:]
    if not args:
        # default: every txt under testdata/
        args = sorted(str(p) for p in (ROOT / "testdata").glob("*.txt"))
    if not args:
        print("usage: python tools/diagnose_impact.py <file.txt> [more.txt ...]")
        sys.exit(1)

    out_dir = ROOT / "tools" / "diagnostic_output"
    out_dir.mkdir(exist_ok=True)

    summary = []
    for raw in args:
        p = Path(raw)
        if not p.is_absolute():
            p = ROOT / p
        if not p.exists():
            print(f"!! missing: {p}")
            continue
        result = diagnose_file(p)
        summary.append({
            "file":     result["file"],
            "verdict":  result["verdict"],
            "severity": result["severity"],
            "leaks":    result["leaks"],
        })

        # JSON dump per file
        dump_path = out_dir / (p.stem + "_diagnostic.json")
        # Convert non-serializable bits
        dump = {
            "file":     result["file"],
            "verdict":  result["verdict"],
            "severity": result["severity"],
            "by_pestle":result["by_pestle"],
            "leaks":    result["leaks"],
            "rows":     result["rows"],
        }
        dump_path.write_text(json.dumps(dump, indent=2, ensure_ascii=False), encoding="utf-8")

    print()
    print("=" * 100)
    print("SUMMARY")
    print("=" * 100)
    print(f"{'file':<40}{'verdict':<12}{'severity':<10}{'neutral':<10}{'low_conf':<10}")
    for s in summary:
        print(
            f"{s['file']:<40}{s['verdict']:<12}{s['severity']:<10.4f}"
            f"{s['leaks']['neutral_sentiment']:<10}{s['leaks']['low_sent_conf_<0.6']:<10}"
        )
    print()
    print(f"JSON dumps: {out_dir}")


if __name__ == "__main__":
    main()
