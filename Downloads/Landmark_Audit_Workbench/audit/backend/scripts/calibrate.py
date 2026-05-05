"""
Calibration helper for the anomaly score API.

Examples:
  python scripts/calibrate.py --input scripts/sample_score_payload.json
  python scripts/calibrate.py --input payload.json --sweep --api http://localhost:8000/v1/anomaly/score
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import requests


def _post(api: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    res = requests.post(api, json=payload, timeout=180)
    res.raise_for_status()
    return res.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Call score API; optional contamination sweep.")
    parser.add_argument("--input", required=True, help="JSON file: {transactions, findings?, periodic_profiles?, config?}")
    parser.add_argument("--api", default="http://localhost:8000/v1/anomaly/score", help="Score endpoint")
    parser.add_argument(
        "--sweep",
        action="store_true",
        help="Try several contamination values and print anomaly_rate table (same payload).",
    )
    args = parser.parse_args()

    base = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if not args.sweep:
        body = _post(args.api, base)
        print(json.dumps(body.get("summary", {}), indent=2))
        return

    cfg = dict(base.get("config") or {})
    contaminations: List[float] = [0.04, 0.06, 0.08, 0.10, 0.12, 0.15]
    rows = []
    for c in contaminations:
        payload = {**base, "config": {**cfg, "contamination": c}}
        body = _post(args.api, payload)
        s = body.get("summary") or {}
        rows.append(
            {
                "contamination": c,
                "anomalies": s.get("anomalies"),
                "total_rows": s.get("total_rows"),
                "anomaly_rate": s.get("anomaly_rate"),
            }
        )
    print("contamination | anomalies | total | rate")
    for r in rows:
        print(
            f"{r['contamination']!s:>13} | {r['anomalies']!s:>9} | {r['total_rows']!s:>5} | {r['anomaly_rate']!s}"
        )


if __name__ == "__main__":
    main()
