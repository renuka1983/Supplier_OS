from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.models.rule_config import RuleConfig
from app.services.rule_evaluators import EVALUATORS, SEVERITY_WEIGHT


def _load_enabled_rules(db: Session) -> List[RuleConfig]:
    return db.query(RuleConfig).filter(RuleConfig.enabled.is_(True)).order_by(RuleConfig.rule_code.asc()).all()

def build_rule_feature_matrix(
    df: pd.DataFrame,
    enabled_rules: List[RuleConfig],
    thresholds: Dict[str, Any],
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Returns:
      features_df: numeric features for ML
      rationales_df: string rationales per rule (only populated on hits)
    """
    features = pd.DataFrame(index=df.index)
    rationales = pd.DataFrame(index=df.index)

    rule_score_cols: List[str] = []

    for r in enabled_rules:
        code = r.rule_code
        evaluator = EVALUATORS.get(code)
        if evaluator is None:
            continue

        hit = evaluator(df, thresholds).fillna(False).astype(bool)
        severity_weight = SEVERITY_WEIGHT.get((r.severity or "MEDIUM").upper(), 0.6)

        hit_col = f"rule_hit_{code}"
        score_col = f"rule_score_{code}"
        rat_col = f"rule_rationale_{code}"

        features[hit_col] = hit.astype(int)
        features[score_col] = hit.astype(float) * float(severity_weight)
        rule_score_cols.append(score_col)

        rationale_text = f"{code} triggered"
        rationales[rat_col] = np.where(hit.values, rationale_text, "")

    if rule_score_cols:
        features["rule_based_severity_proxy"] = features[rule_score_cols].max(axis=1).astype(float)
    else:
        features["rule_based_severity_proxy"] = 0.0

    # Baseline features for ML models (safe numeric columns).
    for col in ["GL_ACCOUNT_CODE", "ENTERED_DR", "ENTERED_CR", "NET_AMOUNT_ABS", "HOUR", "DAY_OF_WEEK"]:
        if col in df.columns:
            features[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    return features, rationales

