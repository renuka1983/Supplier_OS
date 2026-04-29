from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models.rule_config import RuleConfig
from app.models.threshold_config import ThresholdConfig


DEFAULT_RULES: List[Dict[str, Any]] = [
    # Locked critical rules
    {"rule_code": "DUM-01", "name": "Dummy Account Posting", "severity": "CRITICAL", "locked": True, "enabled": True},
    {"rule_code": "PEND-01", "name": "Pending / Unknown Account Posting", "severity": "CRITICAL", "locked": True, "enabled": True},
    {"rule_code": "CLR-01", "name": "Manual Journal to Cash Clearing", "severity": "CRITICAL", "locked": True, "enabled": True},
    {"rule_code": "GV-01", "name": "Manual Entry to Shukran Gift Card", "severity": "CRITICAL", "locked": True, "enabled": True},
    {"rule_code": "IC-01", "name": "One-Sided Intercompany Entry", "severity": "CRITICAL", "locked": True, "enabled": True},

    # Active rules
    {"rule_code": "GV-02", "name": "Shukran Liability — Unjustified Release", "severity": "CRITICAL", "locked": False, "enabled": True},
    {"rule_code": "CLR-02", "name": "Uncleared Clearing Balance", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "PROV-01", "name": "Period-End Provision Concentration", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "PROV-02", "name": "Duplicate Provision Entry", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "PROV-03", "name": "Round Number Provision", "severity": "MEDIUM", "locked": False, "enabled": True},
    {"rule_code": "EMP-01", "name": "Employee Advance Exceeds Policy Limit", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "EMP-02", "name": "Employee Advance — No Recovery", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "EMP-03", "name": "Employee Discount — Missing Tax", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "SOD-01", "name": "Segregation of Duties Violation", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "SOD-02", "name": "High-Value Manual — No Approval Reference", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "TIME-01", "name": "After-Hours Posting", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "TIME-02", "name": "Weekend / Holiday Posting", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "TIME-03", "name": "Backdated Entry — Prior Period", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "TIME-04", "name": "Delayed Posting — Same Period", "severity": "MEDIUM", "locked": False, "enabled": True},
    {"rule_code": "DUP-01", "name": "Potential Duplicate Posting", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "JQ-01", "name": "Blank / Generic Description", "severity": "MEDIUM", "locked": False, "enabled": True},
    {"rule_code": "CWIP-01", "name": "CWIP Ageing — Capitalisation Overdue", "severity": "HIGH", "locked": False, "enabled": True},
    {"rule_code": "CWIP-02", "name": "CWIP Below Capitalisation Threshold", "severity": "MEDIUM", "locked": False, "enabled": True},
]


DEFAULT_THRESHOLDS: Dict[str, Any] = {
    # Timing & Clearing
    "timing_clearing": {
        # For CLR-02 clearing window (days)
        "clearing_window_posting_lag_days": 3,
        # For TIME-04 delayed posting lag (days)
        "posting_lag_days": 5,
        # For DUP-01 duplicate window (days)
        "duplicate_window_days": 30,
        # For EMP-02 advance recovery window (days)
        "advance_recovery_days": 30,
        # For TIME-03 month lag threshold
        "backdated_lag_months_threshold": 0,
    },
    # Amount thresholds
    "amount_thresholds": {
        "round_number_threshold": 1000,
        "high_value_manual_threshold": 100000,
        # EMP-01 uses this; can be configured by UI
        "employee_advance_limit": 0,
        "blank_description_minimum_amount": 0,
        "minimum_capitalisation_threshold": 50000,
    },
    # Provisions & CWIP
    "provisions_cwip": {
        # PROV-01
        "provision_concentration_pct": 0.2,
        # CWIP-01
        "cwip_ageing_days": 90,
    },
    # Business Hours / Calendar
    "business_hours": {
        "hours_start": 9,
        "hours_end": 18,
        # datetime.weekday(): Mon=0 ... Sun=6. Default: Fri/Sat
        "weekend_days_gcc": [4, 5],
        "holiday_dates": [],
    },
    # Reference lists used by various rules
    "reference_lists": {
        "cash_clearing_accounts": [14551, 14552],
        "shukran_account_code": 23224,
        "pending_accounts": [11131, 11132, 14554, 42105, 42106, 52105, 52106],
        "ic_receivable_account_code": 12701,
        "ic_payable_account_code": 21101,

        # These require your org-specific setup in the UI.
        "provision_account_codes": [],
        "cwip_account_codes": [],
        "fixed_asset_account_codes": [],
        "employee_advance_account_codes": [],

        "employee_discount_account_code": 42305,
        "employee_tax_account_code": 42306,

        "generic_description_values": ["", "N/A", "NA", "-"],
    },
    # Ensemble blend
    "ensemble": {
        "rule_weight": 0.5,
        "iso_weight": 0.3,
        "lof_weight": 0.2,
        "ensemble_high_cutoff": 0.8,
        "iso_contamination": 0.02,
        "lof_contamination": 0.02,
    },
}


def seed_defaults(db: Session) -> None:
    # Seed rules
    for r in DEFAULT_RULES:
        existing = db.query(RuleConfig).filter(RuleConfig.rule_code == r["rule_code"]).first()
        if existing:
            # Keep user-configured enabled/locked/parameters.
            if not existing.name:
                existing.name = r["name"]
            if not existing.severity:
                existing.severity = r["severity"]
            continue

        db.add(
            RuleConfig(
                rule_code=r["rule_code"],
                name=r["name"],
                severity=r["severity"],
                enabled=bool(r["enabled"]),
                locked=bool(r["locked"]),
                parameters_json="{}",
                updated_at=datetime.utcnow(),
            )
        )

    # Seed thresholds global
    thr = db.query(ThresholdConfig).filter(ThresholdConfig.scope == "global").first()
    if not thr:
        db.add(
            ThresholdConfig(
                scope="global",
                thresholds_json=json.dumps(DEFAULT_THRESHOLDS, default=str),
                updated_at=datetime.utcnow(),
            )
        )

    db.commit()

