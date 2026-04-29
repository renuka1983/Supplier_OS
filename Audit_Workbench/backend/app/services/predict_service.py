from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

import pandas as pd
from sqlalchemy.orm import Session

from app.models.rule_config import RuleConfig
from app.models.threshold_config import ThresholdConfig
from app.models.upload import Upload
from app.services.anomaly_engine import compute_anomaly_labels
from app.services.excel_service import extract_transactions_from_workbook
from app.services.export_service import build_anomaly_output_excel
from app.services.rule_features import build_rule_feature_matrix


def _load_thresholds(db: Session) -> Dict[str, Any]:
    row = db.query(ThresholdConfig).filter(ThresholdConfig.scope == "global").first()
    if not row or not row.thresholds_json:
        return {}
    try:
        data = json.loads(row.thresholds_json)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _load_enabled_rules(db: Session) -> List[RuleConfig]:
    return db.query(RuleConfig).filter(RuleConfig.enabled.is_(True)).order_by(RuleConfig.rule_code.asc()).all()


def run_anomaly_pipeline(
    db: Session,
    upload: Upload,
    sheet_name: str,
    column_mapping: Dict[str, str],
) -> Tuple[bytes, Dict[str, Any]]:
    # Load excel bytes.
    with open(upload.file_path, "rb") as f:
        file_bytes = f.read()

    extracted_df = extract_transactions_from_workbook(
        file_bytes=file_bytes,
        sheet_name=sheet_name,
        column_mapping=column_mapping,
    )

    enabled_rules = _load_enabled_rules(db)
    thresholds = _load_thresholds(db)

    features_df, rationales_df = build_rule_feature_matrix(
        df=extracted_df,
        enabled_rules=enabled_rules,
        thresholds=thresholds,
    )
    anomalies_df = compute_anomaly_labels(features_df=features_df, thresholds=thresholds)

    out_bytes = build_anomaly_output_excel(
        transactions_df=extracted_df,
        features_df=features_df,
        rationales_df=rationales_df,
        anomalies_df=anomalies_df,
    )

    summary = {
        "rows_extracted": int(len(extracted_df)),
        "enabled_rules": int(len(enabled_rules)),
        "anomalies_rows": int(len(anomalies_df)),
    }
    return out_bytes, summary

