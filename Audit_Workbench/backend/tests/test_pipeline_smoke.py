from __future__ import annotations

from io import BytesIO
from typing import Dict

import pandas as pd

from app.services.excel_service import (
    CANONICAL_REQUIRED_FIELDS,
    extract_transactions_from_workbook,
    list_workbook_sheets,
)
from app.services.rule_features import build_rule_feature_matrix
from app.services.rule_evaluators import SEVERITY_WEIGHT
from app.services.anomaly_engine import compute_anomaly_labels
from app.services.export_service import build_anomaly_output_excel


def _make_workbook_bytes() -> bytes:
    # Create a tiny workbook with two sheets.
    tx = pd.DataFrame(
        {
            "Acct": [92001, 14551, 23224, 23224, 12701],
            "Source": ["MANUAL", "MANUAL", "MANUAL", "MANUAL", "MANUAL"],
            "Desc": ["", "N/A", "test", "N/A", "test"],
            "GLDate": ["2026-04-01", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-03"],
            "GLCreated": ["2026-04-01 20:00:00", "2026-04-01 10:00:00", "2026-04-02 11:00:00", "2026-04-03 11:00:00", "2026-04-03 11:00:00"],
            "JV": ["JV1", "JV2", "JV3", "JV3", "JV4"],
            "CC": ["CC1", "CC1", "CC1", "CC1", "CC1"],
            "Concept": ["C1", "C1", "C1", "C1", "C1"],
            "IC": ["", "", "", "", "12701"],
            "EmpId": ["E1", "E1", "E1", "E1", "E1"],
            "DR": [100.0, 50.0, 10.0, 0.0, 30.0],
            "CR": [0.0, 0.0, 0.0, 10.0, 0.0],
        }
    )

    other = pd.DataFrame({"X": [1, 2]})

    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        other.to_excel(writer, index=False, sheet_name="Other")
        tx.to_excel(writer, index=False, sheet_name="Transactions")
    return buf.getvalue()


def test_list_sheets_and_extract_with_mapping() -> None:
    excel_bytes = _make_workbook_bytes()

    sheets = list_workbook_sheets(excel_bytes)
    names = {s["sheet_name"] for s in sheets}
    assert "Transactions" in names

    mapping: Dict[str, str] = {
        "GL_ACCOUNT_CODE": "Acct",
        "SOURCE": "Source",
        "DESCRIPTION": "Desc",
        "GL_DATE": "GLDate",
        "GL_CREATION_DATE": "GLCreated",
        "JV_VOUCHER_NUMBER": "JV",
        "COST_CENTRE_CODE": "CC",
        "CONCEPT_CODE": "Concept",
        "INTER_COMPANY_CODE": "IC",
        "VENDOR_CUSTOMER_NUMBER": "EmpId",
        "ENTERED_DR": "DR",
        "ENTERED_CR": "CR",
    }

    df = extract_transactions_from_workbook(excel_bytes, "Transactions", mapping)
    assert len(df) == 5
    for col in ["GL_ACCOUNT_CODE", "ENTERED_DR", "ENTERED_CR", "NET_AMOUNT_ABS", "HOUR", "DAY_OF_WEEK"]:
        assert col in df.columns


def test_rule_feature_ml_and_export_smoke() -> None:
    excel_bytes = _make_workbook_bytes()
    mapping: Dict[str, str] = {
        "GL_ACCOUNT_CODE": "Acct",
        "SOURCE": "Source",
        "DESCRIPTION": "Desc",
        "GL_DATE": "GLDate",
        "GL_CREATION_DATE": "GLCreated",
        "JV_VOUCHER_NUMBER": "JV",
        "COST_CENTRE_CODE": "CC",
        "CONCEPT_CODE": "Concept",
        "INTER_COMPANY_CODE": "IC",
        "VENDOR_CUSTOMER_NUMBER": "EmpId",
        "ENTERED_DR": "DR",
        "ENTERED_CR": "CR",
    }

    df = extract_transactions_from_workbook(excel_bytes, "Transactions", mapping)

    # Enabled rules for a deterministic check.
    class _Rule:
        def __init__(self, code: str, severity: str):
            self.rule_code = code
            self.severity = severity
            self.enabled = True

    enabled_rules = [
        _Rule("DUM-01", "CRITICAL"),
        _Rule("CLR-01", "CRITICAL"),
    ]

    thresholds = {
        "reference_lists": {
            "cash_clearing_accounts": [14551, 14552],
            "pending_accounts": [],
            "shukran_account_code": 23224,
            "ic_receivable_account_code": 12701,
            "ic_payable_account_code": 21101,
            "generic_description_values": ["", "N/A", "NA", "-"],
            "provision_account_codes": [],
            "cwip_account_codes": [],
            "fixed_asset_account_codes": [],
            "employee_advance_account_codes": [],
            "employee_discount_account_code": 42305,
            "employee_tax_account_code": 42306,
        },
        "timing_clearing": {
            "clearing_window_posting_lag_days": 3,
            "posting_lag_days": 5,
            "duplicate_window_days": 30,
            "advance_recovery_days": 30,
            "backdated_lag_months_threshold": 0,
        },
        "provisions_cwip": {"provision_concentration_pct": 0.2, "cwip_ageing_days": 90},
        "business_hours": {"hours_start": 9, "hours_end": 18, "weekend_days_gcc": [4, 5], "holiday_dates": [], "backdated_lag_months_threshold": 0},
        "amount_thresholds": {"round_number_threshold": 1000, "high_value_manual_threshold": 100000, "employee_advance_limit": 0, "blank_description_minimum_amount": 0, "minimum_capitalisation_threshold": 50000},
        "ensemble": {"rule_weight": 0.5, "iso_weight": 0.3, "lof_weight": 0.2, "ensemble_high_cutoff": 0.8, "iso_contamination": 0.02, "lof_contamination": 0.02},
    }

    features_df, rationales_df = build_rule_feature_matrix(df=df, enabled_rules=enabled_rules, thresholds=thresholds)
    anomalies_df = compute_anomaly_labels(features_df=features_df, thresholds=thresholds)

    out_bytes = build_anomaly_output_excel(
        transactions_df=df,
        features_df=features_df,
        rationales_df=rationales_df,
        anomalies_df=anomalies_df,
    )

    assert len(out_bytes) > 0
    assert "rule_hit_DUM-01" in features_df.columns
    assert "rule_hit_CLR-01" in features_df.columns
    assert "ensemble_label" in anomalies_df.columns

