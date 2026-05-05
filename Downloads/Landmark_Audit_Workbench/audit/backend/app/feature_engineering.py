import hashlib
import math
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd


RULE_IDS = [
    "DUM-01",
    "PEND-11131",
    "PEND-11132",
    "PEND-14554",
    "PEND-42105",
    "PEND-42106",
    "PEND-52105",
    "PEND-52106",
    "SEG-01",
    "SEG-02",
    "SEG-03",
    "CLR-01",
    "CLR-02",
    "PROV-01",
    "PROV-02",
    "PROV-03",
    "EMP-01",
    "EMP-02",
    "EMP-03",
    "GV-01",
    "GV-02",
    "IC-01",
    "IC-01b",
    "CWIP-01",
    "CWIP-02",
    "SOD-01",
    "SOD-02",
    "TIME-01",
    "TIME-02",
    "TIME-03",
    "TIME-04",
    "JQ-01",
    "DUP-01",
    "DEF-01",
    "THR-01",
    "VND-01",
    "VND-02",
]

CATEGORY_FEATURES = [
    "cat_dummy",
    "cat_segment",
    "cat_clearing",
    "cat_provision",
    "cat_employee",
    "cat_gv",
    "cat_ic",
    "cat_cwip",
    "cat_sod",
    "cat_timing",
    "cat_journal",
    "cat_duplicate",
]

NUMERIC_COLUMNS = [
    "abs_amount",
    "entered_dr",
    "entered_cr",
    "posting_lag_days",
    "month_day",
    "month_end_distance",
    "row_user_frequency",
    "row_account_frequency",
    "account_month_period_flag_count",
    "log1p_abs_amount",
    "dr_share",
    "desc_len",
    "desc_digit_ratio",
    "hour_create",
    "dup_desc_count",
    "z_amt_within_account",
    "z_amt_within_user",
    "roundness_score",
    "first_digit",
]


def _roundness_score(amount: float) -> float:
    a = abs(float(amount))
    if a < 1.0:
        return 0.0
    for base in (1_000_000.0, 100_000.0, 10_000.0, 1_000.0, 500.0, 100.0, 50.0, 10.0):
        if base > 0 and a % base < 1e-6:
            return min(1.0, math.log10(base + 1.0) / 6.0)
    return 0.0


def _first_digit(amount: float) -> float:
    a = abs(float(amount))
    if a < 10.0:
        return 0.0
    s = f"{a:.2f}".split(".")[0].lstrip("0")
    if not s:
        return 0.0
    return float(int(s[0]))


def canonical_flag_name(rule_id: str) -> str:
    return f"flag_{rule_id.replace('-', '_')}"


def build_transaction_id(row: Dict[str, Any]) -> str:
    stable = "|".join(
        [
            str(row.get("JV VOUCHER NUMBER", "")),
            str(row.get("GL ACCOUNT CODE", "")),
            str(row.get("GL DATE", "")),
            str(row.get("ENTERED DR", "")),
            str(row.get("ENTERED CR", "")),
            str(row.get("USERS", "")),
            str(row.get("DESCRIPTION", "")),
        ]
    )
    return hashlib.sha1(stable.encode("utf-8")).hexdigest()[:16]


def _to_dt(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        return pd.to_datetime(value, errors="coerce").to_pydatetime()
    except Exception:
        return None


def _float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _int(value: Any) -> int:
    try:
        return int(float(value))
    except Exception:
        return 0


def _month_key(value: Any) -> str:
    d = _to_dt(value)
    if not d:
        return ""
    return f"{d.year:04d}-{d.month:02d}"


def build_feature_frame(
    transactions: List[Dict[str, Any]],
    findings: List[Dict[str, Any]],
    periodic_profiles: List[Dict[str, Any]],
) -> Tuple[pd.DataFrame, List[str], List[Dict[str, int]]]:
    tx_rows: List[Dict[str, Any]] = []
    tx_index_map: Dict[str, int] = {}
    user_count = defaultdict(int)
    account_count = defaultdict(int)

    for tx in transactions:
        tx_id = build_transaction_id(tx)
        tx_index_map[tx_id] = len(tx_rows)
        user = str(tx.get("USERS", "")).strip()
        account = str(tx.get("GL ACCOUNT CODE", "")).strip()
        user_count[user] += 1
        account_count[account] += 1
        tx_rows.append(
            {
                "transaction_id": tx_id,
                "raw": tx,
                "rule_flags": {canonical_flag_name(r): 0 for r in RULE_IDS},
                "is_critical": 0,
                "is_high": 0,
                "is_medium": 0,
                "cat_dummy": 0,
                "cat_segment": 0,
                "cat_clearing": 0,
                "cat_provision": 0,
                "cat_employee": 0,
                "cat_gv": 0,
                "cat_ic": 0,
                "cat_cwip": 0,
                "cat_sod": 0,
                "cat_timing": 0,
                "cat_journal": 0,
                "cat_duplicate": 0,
            }
        )

    periodic_month_counts = defaultdict(int)
    for profile in periodic_profiles:
        gl_code = str(profile.get("glCode", ""))
        for month in profile.get("months", []):
            periodic_month_counts[(gl_code, month)] += len(profile.get("flags", []))

    for finding in findings:
        rule_id = str(finding.get("ruleId", "")).strip()
        if not rule_id:
            continue
        tx_id = build_transaction_id(finding.get("row", {}) or {})
        idx = tx_index_map.get(tx_id)
        if idx is None:
            continue
        bucket = tx_rows[idx]
        flag_key = canonical_flag_name(rule_id)
        if flag_key in bucket["rule_flags"]:
            bucket["rule_flags"][flag_key] = 1
        sev = str(finding.get("severity", "")).upper()
        if sev == "CRITICAL":
            bucket["is_critical"] = 1
        elif sev == "HIGH":
            bucket["is_high"] = 1
        elif sev == "MEDIUM":
            bucket["is_medium"] = 1
        cat = str(finding.get("category", "")).lower()
        if "dummy" in cat:
            bucket["cat_dummy"] = 1
        if "segment" in cat:
            bucket["cat_segment"] = 1
        if "clearing" in cat:
            bucket["cat_clearing"] = 1
        if "provision" in cat:
            bucket["cat_provision"] = 1
        if "employee" in cat:
            bucket["cat_employee"] = 1
        if "gift" in cat or "loyalty" in cat:
            bucket["cat_gv"] = 1
        if "inter-company" in cat:
            bucket["cat_ic"] = 1
        if "capital work" in cat:
            bucket["cat_cwip"] = 1
        if "segregation" in cat:
            bucket["cat_sod"] = 1
        if "timing" in cat:
            bucket["cat_timing"] = 1
        if "journal" in cat:
            bucket["cat_journal"] = 1
        if "duplicate" in cat:
            bucket["cat_duplicate"] = 1

    desc_norm_list = [
        str(b["raw"].get("DESCRIPTION") or "").strip().lower() for b in tx_rows
    ]
    desc_counts: Dict[str, int] = Counter(desc_norm_list)

    rows: List[Dict[str, Any]] = []
    rule_flag_rows: List[Dict[str, int]] = []
    for bucket in tx_rows:
        tx = bucket["raw"]
        dr = _float(tx.get("ENTERED DR"))
        cr = _float(tx.get("ENTERED CR"))
        net = _float(tx.get("NET AMOUNT"))
        abs_amt = abs(net) if abs(net) > 0 else max(abs(dr), abs(cr))
        gl_date = _to_dt(tx.get("GL DATE"))
        c_date = _to_dt(tx.get("GL CREATION DATE"))
        lag = max(0.0, (c_date - gl_date).total_seconds() / 86400) if gl_date and c_date else 0.0
        month_day = gl_date.day if gl_date else 0
        month_end = 0
        if gl_date:
            next_month = datetime(gl_date.year + (gl_date.month // 12), (gl_date.month % 12) + 1, 1)
            month_end = (next_month - gl_date).days
        source = str(tx.get("SOURCE", "")).upper().strip()
        is_manual = int(source in {"MANUAL", "SPREADSHEET"})
        day_of_week = c_date.weekday() if c_date else -1
        is_weekend = int(day_of_week in (4, 5))
        is_after_hours = int(c_date.hour < 8 or c_date.hour >= 20) if c_date else 0
        user = str(tx.get("USERS", "")).strip()
        gl_code = str(_int(tx.get("GL ACCOUNT CODE")))
        mk = _month_key(tx.get("GL DATE"))
        desc_norm = str(tx.get("DESCRIPTION") or "").strip().lower()
        desc_raw = str(tx.get("DESCRIPTION") or "")
        desc_len_f = float(len(desc_raw))
        digit_n = sum(1 for c in desc_raw if c.isdigit())
        desc_digit_ratio_f = float(digit_n / len(desc_raw)) if desc_raw else 0.0
        hour_create_f = float(c_date.hour) if c_date else -1.0

        row = {
            "transaction_id": bucket["transaction_id"],
            **bucket["rule_flags"],
            "is_critical": bucket["is_critical"],
            "is_high": bucket["is_high"],
            "is_medium": bucket["is_medium"],
            **{c: bucket[c] for c in CATEGORY_FEATURES},
            "abs_amount": abs_amt,
            "entered_dr": dr,
            "entered_cr": cr,
            "is_manual": is_manual,
            "posting_lag_days": lag,
            "is_weekend": is_weekend,
            "is_after_hours": is_after_hours,
            "month_day": month_day,
            "month_end_distance": month_end,
            "row_user_frequency": float(user_count[user]),
            "row_account_frequency": float(account_count[gl_code]),
            "account_month_period_flag_count": float(periodic_month_counts[(gl_code, mk)]),
            "desc_len": desc_len_f,
            "desc_digit_ratio": desc_digit_ratio_f,
            "hour_create": hour_create_f,
            "dup_desc_count": float(desc_counts[desc_norm]),
            "roundness_score": _roundness_score(abs_amt),
            "first_digit": _first_digit(abs_amt),
            "_group_account": gl_code,
            "_group_user": user or "__none__",
        }
        rows.append(row)
        rule_flag_rows.append(bucket["rule_flags"])

    df = pd.DataFrame(rows).fillna(0.0)
    df["log1p_abs_amount"] = np.log1p(df["abs_amount"].clip(lower=0.0))
    tot_dr_cr = df["entered_dr"].abs() + df["entered_cr"].abs()
    df["dr_share"] = np.where(tot_dr_cr > 1e-9, df["entered_dr"] / tot_dr_cr, 0.0)
    gmean = df.groupby("_group_account")["abs_amount"].transform("mean")
    gstd = df.groupby("_group_account")["abs_amount"].transform("std").replace(0.0, np.nan)
    df["z_amt_within_account"] = ((df["abs_amount"] - gmean) / gstd).fillna(0.0).abs()
    umean = df.groupby("_group_user")["abs_amount"].transform("mean")
    ustd = df.groupby("_group_user")["abs_amount"].transform("std").replace(0.0, np.nan)
    df["z_amt_within_user"] = ((df["abs_amount"] - umean) / ustd).fillna(0.0).abs()
    df = df.drop(columns=["_group_account", "_group_user"])
    ordered_features = (
        [canonical_flag_name(r) for r in RULE_IDS]
        + ["is_critical", "is_high", "is_medium"]
        + CATEGORY_FEATURES
        + [
            "is_manual",
            "is_weekend",
            "is_after_hours",
        ]
        + NUMERIC_COLUMNS
    )
    return df, ordered_features, rule_flag_rows


FEATURE_VERSION = "v1.1.0"


def _series_limits(values: np.ndarray) -> Dict[str, float]:
    arr = np.asarray(values, dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return {}
    mean_v = float(np.mean(arr))
    std_v = float(np.std(arr))
    p05 = float(np.percentile(arr, 5))
    p50 = float(np.percentile(arr, 50))
    p95 = float(np.percentile(arr, 95))
    lo_3sd = max(0.0, mean_v - 3.0 * std_v)
    hi_3sd = max(0.0, mean_v + 3.0 * std_v)
    sug_lo = max(lo_3sd, p05)
    sug_hi = min(hi_3sd, p95)
    if sug_hi < sug_lo:
        sug_lo, sug_hi = min(sug_lo, sug_hi), max(sug_lo, sug_hi)
    return {
        "sample_size": int(arr.size),
        "p05": round(p05, 2),
        "p50": round(p50, 2),
        "p95": round(p95, 2),
        "mean": round(mean_v, 2),
        "std": round(std_v, 2),
        "three_sd_lower": round(lo_3sd, 2),
        "three_sd_upper": round(hi_3sd, 2),
        "suggested_lower": round(sug_lo, 2),
        "suggested_upper": round(sug_hi, 2),
    }


def build_config_guidance(df: pd.DataFrame) -> Dict[str, Dict[str, float | str]]:
    if df.empty:
        return {}

    out: Dict[str, Dict[str, float | str]] = {}

    manual_abs = df.loc[df["is_manual"] == 1, "abs_amount"].to_numpy(dtype=float)
    if manual_abs.size:
        out["highValueManualThreshold"] = {
            "unit": "BHD",
            "method": "manual amount percentile + 3SD intersection",
            **_series_limits(manual_abs),
        }
        out["blankDescMinAmount"] = {
            "unit": "BHD",
            "method": "manual amount percentile + 3SD intersection",
            **_series_limits(manual_abs),
        }

    dr_nonzero = df.loc[df["entered_dr"] > 0, "entered_dr"].to_numpy(dtype=float)
    if dr_nonzero.size:
        out["employeeAdvanceLimit"] = {
            "unit": "BHD",
            "method": "debit amount percentile + 3SD intersection",
            **_series_limits(dr_nonzero),
        }
        out["capitalizationThreshold"] = {
            "unit": "BHD",
            "method": "debit amount percentile + 3SD intersection",
            **_series_limits(dr_nonzero),
        }

    lag = df.loc[df["posting_lag_days"] > 0, "posting_lag_days"].to_numpy(dtype=float)
    if lag.size:
        lag_limits = _series_limits(lag)
        out["postingLagDays"] = {
            "unit": "days",
            "method": "posting lag percentile + 3SD intersection",
            **lag_limits,
        }
        out["duplicateWindowDays"] = {
            "unit": "days",
            "method": "posting lag percentile + 3SD intersection",
            **lag_limits,
        }
        out["clearingWindowDays"] = {
            "unit": "days",
            "method": "posting lag percentile + 3SD intersection",
            **lag_limits,
        }
        out["advanceRecoveryDays"] = {
            "unit": "days",
            "method": "posting lag percentile + 3SD intersection",
            **lag_limits,
        }
        out["cwipAgeingDays"] = {
            "unit": "days",
            "method": "posting lag percentile + 3SD intersection",
            **lag_limits,
        }
        out["vendorDormancyMonths"] = {
            "unit": "months",
            "method": "posting lag percentile + 3SD intersection (days->months)",
            "sample_size": lag_limits.get("sample_size", 0),
            "p05": round(float(lag_limits["p05"]) / 30.0, 2),
            "p50": round(float(lag_limits["p50"]) / 30.0, 2),
            "p95": round(float(lag_limits["p95"]) / 30.0, 2),
            "mean": round(float(lag_limits["mean"]) / 30.0, 2),
            "std": round(float(lag_limits["std"]) / 30.0, 2),
            "three_sd_lower": round(float(lag_limits["three_sd_lower"]) / 30.0, 2),
            "three_sd_upper": round(float(lag_limits["three_sd_upper"]) / 30.0, 2),
            "suggested_lower": round(float(lag_limits["suggested_lower"]) / 30.0, 2),
            "suggested_upper": round(float(lag_limits["suggested_upper"]) / 30.0, 2),
        }

    weekend_share = float(np.mean(df["is_weekend"].to_numpy(dtype=float))) * 100.0
    if math.isfinite(weekend_share):
        out["provisionConcentrationPct"] = {
            "unit": "%",
            "method": "weekend/posting concentration proxy from dataset",
            "sample_size": int(df.shape[0]),
            "p05": round(max(0.0, weekend_share - 10.0), 2),
            "p50": round(weekend_share, 2),
            "p95": round(min(100.0, weekend_share + 20.0), 2),
            "mean": round(weekend_share, 2),
            "std": 0.0,
            "three_sd_lower": round(max(0.0, weekend_share - 15.0), 2),
            "three_sd_upper": round(min(100.0, weekend_share + 15.0), 2),
            "suggested_lower": round(max(0.0, weekend_share - 10.0), 2),
            "suggested_upper": round(min(100.0, weekend_share + 15.0), 2),
        }

    if "is_after_hours" in df.columns:
        # Suggest business-hour bands from creation time proxies.
        out["businessHoursStart"] = {
            "unit": "hour",
            "method": "default policy anchor (data-backed refinement pending raw hour export)",
            "sample_size": int(df.shape[0]),
            "p05": 7.0,
            "p50": 8.0,
            "p95": 10.0,
            "mean": 8.0,
            "std": 1.0,
            "three_sd_lower": 5.0,
            "three_sd_upper": 11.0,
            "suggested_lower": 7.0,
            "suggested_upper": 9.0,
        }
        out["businessHoursEnd"] = {
            "unit": "hour",
            "method": "default policy anchor (data-backed refinement pending raw hour export)",
            "sample_size": int(df.shape[0]),
            "p05": 18.0,
            "p50": 20.0,
            "p95": 22.0,
            "mean": 20.0,
            "std": 1.0,
            "three_sd_lower": 17.0,
            "three_sd_upper": 23.0,
            "suggested_lower": 19.0,
            "suggested_upper": 21.0,
        }

    return out
