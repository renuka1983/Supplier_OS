from __future__ import annotations

from typing import Any, Dict

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor


def compute_anomaly_labels(features_df: pd.DataFrame, thresholds: Dict[str, Any]) -> pd.DataFrame:
    """
    Returns a dataframe indexed like features_df with:
      - iso_anomaly_score, iso_anomaly_label
      - lof_anomaly_score, lof_anomaly_label
      - ensemble_score, ensemble_label
    """
    if features_df is None or features_df.empty:
        return pd.DataFrame(
            index=pd.Index([], name="idx"),
            columns=[
                "iso_anomaly_score",
                "iso_anomaly_label",
                "lof_anomaly_score",
                "lof_anomaly_label",
                "ensemble_score",
                "ensemble_label",
            ],
        )

    ensemble_cfg = thresholds.get("ensemble", {}) if isinstance(thresholds, dict) else {}
    rule_weight = float(ensemble_cfg.get("rule_weight", 0.5) or 0.5)
    iso_weight = float(ensemble_cfg.get("iso_weight", 0.3) or 0.3)
    lof_weight = float(ensemble_cfg.get("lof_weight", 0.2) or 0.2)
    ensemble_high_cutoff = float(ensemble_cfg.get("ensemble_high_cutoff", 0.8) or 0.8)
    iso_contamination = float(ensemble_cfg.get("iso_contamination", 0.02) or 0.02)
    lof_contamination = float(ensemble_cfg.get("lof_contamination", 0.02) or 0.02)

    # Only numeric columns for ML models.
    x = features_df.select_dtypes(include=[np.number]).fillna(0.0)
    if x.shape[0] < 3 or x.shape[1] < 1:
        out = pd.DataFrame(index=features_df.index)
        out["iso_anomaly_score"] = 0.0
        out["iso_anomaly_label"] = 0
        out["lof_anomaly_score"] = 0.0
        out["lof_anomaly_label"] = 0
        rule_proxy = pd.to_numeric(features_df.get("rule_based_severity_proxy", 0.0), errors="coerce").fillna(0.0)
        out["ensemble_score"] = np.minimum(1.0, rule_proxy * rule_weight)
        out["ensemble_label"] = np.where(out["ensemble_score"] >= ensemble_high_cutoff, "High", "Medium")
        return out

    # IsolationForest
    iso = IsolationForest(contamination=iso_contamination, random_state=42)
    iso_pred = iso.fit_predict(x)  # -1 outlier
    iso_raw = -iso.score_samples(x)  # higher => more anomalous
    denom = float(np.ptp(iso_raw)) + 1e-9
    iso_score = (iso_raw - float(np.min(iso_raw))) / denom  # normalized 0..1
    iso_label = (iso_pred == -1).astype(int)

    # LOF
    n_neighbors = min(20, max(2, x.shape[0] - 1))
    lof = LocalOutlierFactor(n_neighbors=n_neighbors, contamination=lof_contamination)
    lof_pred = lof.fit_predict(x)  # -1 outlier
    lof_score = (lof_pred == -1).astype(float)
    lof_label = (lof_pred == -1).astype(int)

    rule_proxy = pd.to_numeric(features_df.get("rule_based_severity_proxy", 0.0), errors="coerce").fillna(0.0).astype(float)

    ensemble_score = rule_proxy * rule_weight + iso_score * iso_weight + lof_score * lof_weight
    ensemble_score = np.minimum(1.0, ensemble_score)
    ensemble_label = np.where(ensemble_score >= ensemble_high_cutoff, "High", "Medium")

    return pd.DataFrame(
        {
            "iso_anomaly_score": iso_score.astype(float),
            "iso_anomaly_label": iso_label.astype(int),
            "lof_anomaly_score": lof_score.astype(float),
            "lof_anomaly_label": lof_label.astype(int),
            "ensemble_score": ensemble_score.astype(float),
            "ensemble_label": ensemble_label.astype(str),
        },
        index=features_df.index,
    )

