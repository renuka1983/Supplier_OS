from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd

from app.services.excel_service import CANONICAL_REQUIRED_FIELDS


SEVERITY_WEIGHT: Dict[str, float] = {
    "CRITICAL": 1.0,
    "HIGH": 0.8,
    "MEDIUM": 0.6,
    "LOW": 0.4,
}


def _account_int(df: pd.DataFrame) -> pd.Series:
    return pd.to_numeric(df["GL_ACCOUNT_CODE"], errors="coerce").fillna(0.0).round().astype(int)


def _net_amount_abs(df: pd.DataFrame) -> pd.Series:
    return (pd.to_numeric(df["ENTERED_DR"], errors="coerce").fillna(0.0) - pd.to_numeric(df["ENTERED_CR"], errors="coerce").fillna(0.0)).abs()


def _generic_description_mask(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    generic_values: List[Any] = thresholds.get("reference_lists", {}).get("generic_description_values", []) or []
    if not generic_values:
        return pd.Series(False, index=df.index)
    desc = df.get("DESCRIPTION", pd.Series("", index=df.index)).fillna("").astype(str).str.strip()
    generic_values_norm = {str(v).strip() for v in generic_values}
    return desc.isin(generic_values_norm)


def eval_DUM_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    return _account_int(df) == 92001


def eval_PEND_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    pending_accounts = thresholds.get("reference_lists", {}).get("pending_accounts", []) or []
    pending = [int(x) for x in pending_accounts]
    return _account_int(df).isin(pending)


def eval_CLR_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    cash_accounts = thresholds.get("reference_lists", {}).get("cash_clearing_accounts", []) or []
    cash = [int(x) for x in cash_accounts]
    source = df.get("SOURCE", "").fillna("").astype(str).str.upper()
    return _account_int(df).isin(cash) & (source == "MANUAL")


def eval_GV_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    shukran = int(thresholds.get("reference_lists", {}).get("shukran_account_code", 23224))
    source = df.get("SOURCE", "").fillna("").astype(str).str.upper()
    return (_account_int(df) == shukran) & (source == "MANUAL")


def eval_IC_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    """
    For each JV, flag lines where the JV has only one side of IC (receivable vs payable).
    """
    receivable = int(thresholds.get("reference_lists", {}).get("ic_receivable_account_code", 12701))
    payable = int(thresholds.get("reference_lists", {}).get("ic_payable_account_code", 21101))

    account = _account_int(df)
    jv = df["JV_VOUCHER_NUMBER"].astype(str)
    has_receivable = jv.map(jv.groupby(jv).transform(lambda s: account.loc[s.index].eq(receivable).any()))
    has_payable = jv.map(jv.groupby(jv).transform(lambda s: account.loc[s.index].eq(payable).any()))

    missing_payable = has_receivable.astype(bool) & (~has_payable.astype(bool))
    missing_receivable = has_payable.astype(bool) & (~has_receivable.astype(bool))

    hit = (account.eq(receivable) & missing_payable) | (account.eq(payable) & missing_receivable)
    return hit.fillna(False)


def eval_GV_02(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    shukran = int(thresholds.get("reference_lists", {}).get("shukran_account_code", 23224))
    account = _account_int(df)
    jv = df["JV_VOUCHER_NUMBER"].astype(str)
    entered_dr = pd.to_numeric(df["ENTERED_DR"], errors="coerce").fillna(0.0)
    entered_cr = pd.to_numeric(df["ENTERED_CR"], errors="coerce").fillna(0.0)

    credit_4xxxx_mask = (entered_cr > 0) & account.astype(str).str.startswith("4")
    has_credit_4xxxx = jv.map(jv.groupby(jv).transform(lambda s: credit_4xxxx_mask.loc[s.index].any()))

    hit = (account.eq(shukran) & (entered_dr > 0) & (~has_credit_4xxxx.astype(bool)))
    return hit.fillna(False)


def eval_CLR_02(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    """
    Flag debit lines in clearing accounts that have no matching credit line within the configured window.
    """
    cash_accounts = thresholds.get("reference_lists", {}).get("cash_clearing_accounts", []) or []
    cash = [int(x) for x in cash_accounts]
    window_days = int(thresholds.get("timing_clearing", {}).get("clearing_window_posting_lag_days", 0) or 0)
    if window_days <= 0:
        return pd.Series(False, index=df.index)

    account = _account_int(df)
    entered_dr = pd.to_numeric(df["ENTERED_DR"], errors="coerce").fillna(0.0)
    entered_cr = pd.to_numeric(df["ENTERED_CR"], errors="coerce").fillna(0.0)
    gl_date = pd.to_datetime(df["GL_DATE"], errors="coerce")

    debit_mask = account.isin(cash) & (entered_dr > 0)
    credit_mask = account.isin(cash) & (entered_cr > 0)

    if not debit_mask.any():
        return pd.Series(False, index=df.index)

    amount_round = (entered_dr - entered_cr).abs().round(2)

    # Pre-index credits by (account, amount_rounded) -> list of dates.
    credit_df = pd.DataFrame(
        {
            "idx": df.index[credit_mask],
            "account": account[credit_mask].values,
            "amt": amount_round[credit_mask].values,
            "date": gl_date[credit_mask].values,
        }
    ).dropna(subset=["date"])

    credit_df["date_int"] = credit_df["date"].astype("int64")
    grouped: Dict[tuple, np.ndarray] = {}
    for (acc, amt), g in credit_df.groupby(["account", "amt"]):
        grouped[(int(acc), float(amt))] = g["date_int"].to_numpy()

    as_nanos_per_day = 24 * 3600 * 1_000_000_000
    hit = pd.Series(False, index=df.index)
    for i in df.index[debit_mask]:
        acc = int(account.loc[i])
        amt = float(amount_round.loc[i])
        d = gl_date.loc[i]
        if pd.isna(d):
            continue
        dates_int = grouped.get((acc, amt))
        if dates_int is None:
            hit.loc[i] = True
            continue
        debit_date_int = int(d.value)
        upper = debit_date_int + window_days * as_nanos_per_day
        has_match = bool(np.any((dates_int >= debit_date_int) & (dates_int <= upper)))
        hit.loc[i] = not has_match

    return hit


def eval_PROV_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    provision_accounts = thresholds.get("reference_lists", {}).get("provision_account_codes", []) or []
    provision_accounts = [int(x) for x in provision_accounts]
    if not provision_accounts:
        return pd.Series(False, index=df.index)

    pct = float(thresholds.get("provisions_cwip", {}).get("provision_concentration_pct", 0.0) or 0.0)
    account = _account_int(df)
    provision_mask = account.isin(provision_accounts)
    if not provision_mask.any():
        return pd.Series(False, index=df.index)

    amount = _net_amount_abs(df)
    gl_date = pd.to_datetime(df["GL_DATE"], errors="coerce")
    month = gl_date.dt.to_period("M")
    month_end = gl_date + pd.offsets.MonthEnd(0)
    last7_mask = gl_date >= (month_end - pd.Timedelta(days=6))

    # Totals per month (for provision accounts only)
    month_total = amount[provision_mask].groupby(month[provision_mask]).sum()
    month_last7 = amount[provision_mask & last7_mask].groupby(month[provision_mask & last7_mask]).sum()

    concentration = (month_last7 / month_total).fillna(0.0)
    flagged_months = concentration[concentration > pct].index

    hit = provision_mask & last7_mask & month.isin(flagged_months)
    return hit.fillna(False)


def eval_PROV_02(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    provision_accounts = thresholds.get("reference_lists", {}).get("provision_account_codes", []) or []
    provision_accounts = [int(x) for x in provision_accounts]
    if not provision_accounts:
        return pd.Series(False, index=df.index)

    account = _account_int(df)
    provision_mask = account.isin(provision_accounts)
    if not provision_mask.any():
        return pd.Series(False, index=df.index)

    cc = df["COST_CENTRE_CODE"].fillna("").astype(str).str.strip()
    concept = df["CONCEPT_CODE"].fillna("").astype(str).str.strip()
    gl_date = pd.to_datetime(df["GL_DATE"], errors="coerce")
    month = gl_date.dt.to_period("M").astype(str)

    amount_rounded = _net_amount_abs(df).round(0)

    tmp = pd.DataFrame(
        {
            "idx": df.index,
            "account": account.values,
            "cc": cc.values,
            "concept": concept.values,
            "amount_rounded": amount_rounded.values,
            "month": month.values,
            "is_prov": provision_mask.values,
        }
    )
    tmp = tmp[tmp["is_prov"]]
    key = tmp["account"].astype(int).astype(str) + "|" + tmp["cc"] + "|" + tmp["amount_rounded"].astype(str) + "|" + tmp["month"]
    counts = key.value_counts()
    dup_keys = set(counts[counts > 1].index.tolist())
    hit = key.map(lambda k: k in dup_keys)
    hit_full = pd.Series(False, index=df.index)
    hit_full.loc[tmp["idx"]] = hit.fillna(False).values
    return hit_full


def eval_PROV_03(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    provision_accounts = thresholds.get("reference_lists", {}).get("provision_account_codes", []) or []
    provision_accounts = [int(x) for x in provision_accounts]
    if not provision_accounts:
        return pd.Series(False, index=df.index)

    round_th = float(thresholds.get("amount_thresholds", {}).get("round_number_threshold", 0.0) or 0.0)
    if round_th <= 0:
        return pd.Series(False, index=df.index)

    account = _account_int(df)
    provision_mask = account.isin(provision_accounts)
    amount = _net_amount_abs(df)

    # Exact multiples + large-enough amounts.
    # Use modulo on rounded amounts to avoid float issues.
    amount_round = amount.round(2)
    hit = provision_mask & (amount_round >= round_th * 5) & ((amount_round % round_th) == 0)
    return hit.fillna(False)


def eval_EMP_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    emp_accounts = thresholds.get("reference_lists", {}).get("employee_advance_account_codes", []) or []
    emp_accounts = [int(x) for x in emp_accounts]
    if not emp_accounts:
        return pd.Series(False, index=df.index)

    limit = float(thresholds.get("amount_thresholds", {}).get("employee_advance_limit", 0.0) or 0.0)
    account = _account_int(df)
    entered_dr = pd.to_numeric(df["ENTERED_DR"], errors="coerce").fillna(0.0)

    generic_desc = _generic_description_mask(df, thresholds)
    no_approval = generic_desc | df.get("DESCRIPTION", pd.Series("", index=df.index)).fillna("").astype(str).str.strip().eq("")
    hit = account.isin(emp_accounts) & (entered_dr > limit) & no_approval
    return hit.fillna(False)


def eval_EMP_02(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    emp_accounts = thresholds.get("reference_lists", {}).get("employee_advance_account_codes", []) or []
    emp_accounts = [int(x) for x in emp_accounts]
    if not emp_accounts:
        return pd.Series(False, index=df.index)

    recovery_days = int(thresholds.get("timing_clearing", {}).get("advance_recovery_days", 0) or 0)
    if recovery_days <= 0:
        return pd.Series(False, index=df.index)

    account = _account_int(df)
    entered_dr = pd.to_numeric(df["ENTERED_DR"], errors="coerce").fillna(0.0)
    entered_cr = pd.to_numeric(df["ENTERED_CR"], errors="coerce").fillna(0.0)
    emp_id = df["VENDOR_CUSTOMER_NUMBER"].fillna("").astype(str)
    gl_date = pd.to_datetime(df["GL_DATE"], errors="coerce")

    debit_mask = account.isin(emp_accounts) & (entered_dr > 0)
    credit_mask = account.isin(emp_accounts) & (entered_cr > 0)

    if not debit_mask.any():
        return pd.Series(False, index=df.index)

    as_nanos_per_day = 24 * 3600 * 1_000_000_000
    # Index credits by employee id.
    credit_df = pd.DataFrame(
        {
            "idx": df.index[credit_mask],
            "emp": emp_id[credit_mask].values,
            "date": gl_date[credit_mask].values,
        }
    ).dropna(subset=["date"])
    credit_df["date_int"] = credit_df["date"].astype("int64")
    grouped: Dict[str, np.ndarray] = {}
    for emp, g in credit_df.groupby("emp"):
        grouped[str(emp)] = g["date_int"].to_numpy()

    hit = pd.Series(False, index=df.index)
    for i in df.index[debit_mask]:
        emp = str(emp_id.loc[i])
        d = gl_date.loc[i]
        if pd.isna(d):
            continue
        dates_int = grouped.get(emp)
        if dates_int is None:
            hit.loc[i] = True
            continue
        debit_date_int = int(d.value)
        upper = debit_date_int + recovery_days * as_nanos_per_day
        has_recovery = bool(np.any((dates_int >= debit_date_int) & (dates_int <= upper)))
        hit.loc[i] = not has_recovery
    return hit.fillna(False)


def eval_EMP_03(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    discount_acct = int(thresholds.get("reference_lists", {}).get("employee_discount_account_code", 42305))
    tax_acct = int(thresholds.get("reference_lists", {}).get("employee_tax_account_code", 42306))

    account = _account_int(df)
    jv = df["JV_VOUCHER_NUMBER"].astype(str)
    has_discount = jv.map(jv.groupby(jv).transform(lambda s: account.loc[s.index].eq(discount_acct).any()))
    has_tax = jv.map(jv.groupby(jv).transform(lambda s: account.loc[s.index].eq(tax_acct).any()))

    hit = account.eq(discount_acct) & has_discount.astype(bool) & (~has_tax.astype(bool))
    return hit.fillna(False)


def eval_SOD_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    """
    If USER column exists:
      - for each JV, if distinct USER count within manual entries is 1
      - and the JV has both debit and credit legs
    """
    if "USER" not in df.columns:
        return pd.Series(False, index=df.index)

    manual_mask = df["SOURCE"].fillna("").astype(str).str.upper().eq("MANUAL")
    jv = df["JV_VOUCHER_NUMBER"].astype(str)
    user = df["USER"].fillna("").astype(str).str.strip()

    entered_dr = pd.to_numeric(df["ENTERED_DR"], errors="coerce").fillna(0.0)
    entered_cr = pd.to_numeric(df["ENTERED_CR"], errors="coerce").fillna(0.0)

    # JV-level presence for manual entries.
    has_dr = jv.map(jv.groupby(jv).transform(lambda s: (entered_dr.loc[s.index] > 0).any()))
    has_cr = jv.map(jv.groupby(jv).transform(lambda s: (entered_cr.loc[s.index] > 0).any()))
    distinct_users = jv.map(jv.groupby(jv).transform(lambda s: user.loc[s.index].nunique()))

    hit_jv = manual_mask & has_dr.astype(bool) & has_cr.astype(bool) & distinct_users.eq(1)
    return hit_jv.fillna(False)


def eval_SOD_02(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    high_th = float(thresholds.get("amount_thresholds", {}).get("high_value_manual_threshold", 0.0) or 0.0)
    manual_mask = df["SOURCE"].fillna("").astype(str).str.upper().eq("MANUAL")
    amount = _net_amount_abs(df)
    generic_desc = _generic_description_mask(df, thresholds)
    return (manual_mask & (amount >= high_th) & generic_desc).fillna(False)


def eval_TIME_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    hours_start = int(thresholds.get("business_hours", {}).get("hours_start", 0) or 0)
    hours_end = int(thresholds.get("business_hours", {}).get("hours_end", 24) or 24)
    high_th = float(thresholds.get("amount_thresholds", {}).get("high_value_manual_threshold", 0.0) or 0.0)

    hour = pd.to_numeric(df.get("HOUR", 0), errors="coerce").fillna(0).astype(int)
    manual_mask = df["SOURCE"].fillna("").astype(str).str.upper().eq("MANUAL")
    amount = _net_amount_abs(df)
    after_hours = (hour < hours_start) | (hour >= hours_end)
    return (after_hours & (manual_mask | (amount >= high_th))).fillna(False)


def eval_TIME_02(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    weekend_days = thresholds.get("business_hours", {}).get("weekend_days_gcc", []) or []
    weekend_days = [int(x) for x in weekend_days]
    high_th = float(thresholds.get("amount_thresholds", {}).get("high_value_manual_threshold", 0.0) or 0.0)

    day_of_week = pd.to_numeric(df.get("DAY_OF_WEEK", -1), errors="coerce").fillna(-1).astype(int)
    manual_mask = df["SOURCE"].fillna("").astype(str).str.upper().eq("MANUAL")
    amount = _net_amount_abs(df)
    is_weekend = day_of_week.isin(weekend_days)
    return (is_weekend & (manual_mask | (amount >= high_th))).fillna(False)


def eval_TIME_03(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    lag_months_th = int(thresholds.get("business_hours", {}).get("backdated_lag_months_threshold", 0) or 0)
    gl_date = pd.to_datetime(df["GL_DATE"], errors="coerce")
    creation = pd.to_datetime(df["GL_CREATION_DATE"], errors="coerce")
    # Months lag between creation and posting.
    lag_months = (creation.dt.year * 12 + creation.dt.month) - (gl_date.dt.year * 12 + gl_date.dt.month)
    month_mismatch = gl_date.dt.to_period("M") != creation.dt.to_period("M")
    return (lag_months > lag_months_th) & month_mismatch


def eval_TIME_04(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    lag_days_th = int(thresholds.get("timing_clearing", {}).get("posting_lag_days", 0) or 0)
    gl_date = pd.to_datetime(df["GL_DATE"], errors="coerce")
    creation = pd.to_datetime(df["GL_CREATION_DATE"], errors="coerce")
    lag_days = (creation - gl_date).dt.days
    same_month = gl_date.dt.to_period("M") == creation.dt.to_period("M")
    return (lag_days > lag_days_th) & same_month


def eval_DUP_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    window_days = int(thresholds.get("timing_clearing", {}).get("duplicate_window_days", 0) or 0)
    if window_days <= 0:
        return pd.Series(False, index=df.index)

    account = _account_int(df)
    amount = _net_amount_abs(df)
    amount_round = amount.round(0)
    cc = df["COST_CENTRE_CODE"].fillna("").astype(str).str.strip()
    concept = df["CONCEPT_CODE"].fillna("").astype(str).str.strip()
    jv = df["JV_VOUCHER_NUMBER"].astype(str)
    gl_date = pd.to_datetime(df["GL_DATE"], errors="coerce")

    key = account.astype(str) + "|" + amount_round.astype(str) + "|" + cc + "|" + concept

    # Determine keys that appear in >=2 JVs within date span <= window.
    dup_keys = set()
    for k, g in df.groupby(key):
        distinct_jv = g["JV_VOUCHER_NUMBER"].astype(str).nunique()
        if distinct_jv < 2:
            continue
        dates = pd.to_datetime(g["GL_DATE"], errors="coerce").dropna()
        if len(dates) < 2:
            continue
        span_days = (dates.max() - dates.min()).days
        if span_days <= window_days:
            dup_keys.add(k)

    return key.map(lambda k: k in dup_keys)


def eval_JQ_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    manual_mask = df["SOURCE"].fillna("").astype(str).str.upper().eq("MANUAL")
    min_amount = float(thresholds.get("amount_thresholds", {}).get("blank_description_minimum_amount", 0.0) or 0.0)
    amount = _net_amount_abs(df)
    generic_desc = _generic_description_mask(df, thresholds)
    blankish = generic_desc | df["DESCRIPTION"].fillna("").astype(str).str.strip().eq("")
    return (manual_mask & (amount >= min_amount) & blankish).fillna(False)


def eval_CWIP_01(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    cwip_accounts = thresholds.get("reference_lists", {}).get("cwip_account_codes", []) or []
    cwip_accounts = [int(x) for x in cwip_accounts]
    fixed_assets = thresholds.get("reference_lists", {}).get("fixed_asset_account_codes", []) or []
    fixed_assets = [int(x) for x in fixed_assets]

    if not cwip_accounts:
        return pd.Series(False, index=df.index)

    age_days_th = int(thresholds.get("provisions_cwip", {}).get("cwip_ageing_days", 0) or 0)
    account = _account_int(df)
    cwip_mask = account.isin(cwip_accounts)
    if not cwip_mask.any():
        return pd.Series(False, index=df.index)

    entered_dr = pd.to_numeric(df["ENTERED_DR"], errors="coerce").fillna(0.0)
    gl_date = pd.to_datetime(df["GL_DATE"], errors="coerce")

    # Age as of last creation date (more robust than using "now").
    creation = pd.to_datetime(df["GL_CREATION_DATE"], errors="coerce")
    as_of = creation.max() if creation.notna().any() else gl_date.max()
    age_days = (as_of - gl_date).dt.days

    # No transfer to fixed asset within same JV.
    if fixed_assets:
        fixed_mask = account.isin(fixed_assets)
        jv = df["JV_VOUCHER_NUMBER"].astype(str)
        has_fixed_in_jv = jv.map(jv.groupby(jv).transform(lambda s: fixed_mask.loc[s.index].any()))
        no_transfer = ~has_fixed_in_jv.astype(bool)
    else:
        no_transfer = True

    hit = cwip_mask & (entered_dr > 0) & (age_days > age_days_th) & no_transfer
    return hit.fillna(False)


def eval_CWIP_02(df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.Series:
    cwip_accounts = thresholds.get("reference_lists", {}).get("cwip_account_codes", []) or []
    cwip_accounts = [int(x) for x in cwip_accounts]
    if not cwip_accounts:
        return pd.Series(False, index=df.index)

    cap_th = float(thresholds.get("amount_thresholds", {}).get("minimum_capitalisation_threshold", 0.0) or 0.0)
    account = _account_int(df)
    cwip_mask = account.isin(cwip_accounts)
    amount = _net_amount_abs(df)
    hit = cwip_mask & (amount > 0) & (amount < cap_th)
    return hit.fillna(False)


EVALUATORS: Dict[str, Any] = {
    "DUM-01": eval_DUM_01,
    "PEND-01": eval_PEND_01,
    "CLR-01": eval_CLR_01,
    "GV-01": eval_GV_01,
    "IC-01": eval_IC_01,
    "GV-02": eval_GV_02,
    "CLR-02": eval_CLR_02,
    "PROV-01": eval_PROV_01,
    "PROV-02": eval_PROV_02,
    "PROV-03": eval_PROV_03,
    "EMP-01": eval_EMP_01,
    "EMP-02": eval_EMP_02,
    "EMP-03": eval_EMP_03,
    "SOD-01": eval_SOD_01,
    "SOD-02": eval_SOD_02,
    "TIME-01": eval_TIME_01,
    "TIME-02": eval_TIME_02,
    "TIME-03": eval_TIME_03,
    "TIME-04": eval_TIME_04,
    "DUP-01": eval_DUP_01,
    "JQ-01": eval_JQ_01,
    "CWIP-01": eval_CWIP_01,
    "CWIP-02": eval_CWIP_02,
}

