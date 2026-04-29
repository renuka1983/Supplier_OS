from __future__ import annotations

from io import BytesIO
from typing import Any

import pandas as pd


def build_anomaly_output_excel(
    transactions_df: pd.DataFrame,
    features_df: pd.DataFrame,
    rationales_df: pd.DataFrame,
    anomalies_df: pd.DataFrame,
) -> bytes:
    buff = BytesIO()
    try:
        writer_engine = "xlsxwriter"
        ctx = pd.ExcelWriter(buff, engine=writer_engine)
    except Exception:
        writer_engine = "openpyxl"
        ctx = pd.ExcelWriter(buff, engine=writer_engine)

    with ctx as writer:
        transactions_df.to_excel(writer, index=False, sheet_name="transactions")
        features_df.to_excel(writer, index=False, sheet_name="features")

        if rationales_df is not None and not rationales_df.empty:
            rationales_df.to_excel(writer, index=False, sheet_name="rationales")
        else:
            pd.DataFrame().to_excel(writer, index=False, sheet_name="rationales")

        # Individual model outputs
        if anomalies_df is not None and not anomalies_df.empty:
            iso_cols = [
                c
                for c in ["iso_anomaly_score", "iso_anomaly_label"]
                if c in anomalies_df.columns
            ]
            lof_cols = [
                c
                for c in ["lof_anomaly_score", "lof_anomaly_label"]
                if c in anomalies_df.columns
            ]
            ind_df = anomalies_df[iso_cols + lof_cols] if (iso_cols or lof_cols) else pd.DataFrame()
            ind_df.to_excel(writer, index=False, sheet_name="individual_labels")

            ensemble_cols = [
                c
                for c in ["ensemble_score", "ensemble_label"]
                if c in anomalies_df.columns
            ]
            ens_df = anomalies_df[ensemble_cols] if ensemble_cols else pd.DataFrame()
            ens_df.to_excel(writer, index=False, sheet_name="ensemble")
        else:
            pd.DataFrame().to_excel(writer, index=False, sheet_name="individual_labels")
            pd.DataFrame().to_excel(writer, index=False, sheet_name="ensemble")

    return buff.getvalue()

