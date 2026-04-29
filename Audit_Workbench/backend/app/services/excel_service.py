from __future__ import annotations

import io
from typing import Any, Dict, List

import pandas as pd
try:
    from fastapi import HTTPException  # type: ignore
except Exception:  # pragma: no cover
    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str):
            super().__init__(detail)

from openpyxl import load_workbook


CANONICAL_REQUIRED_FIELDS: List[str] = [
    "GL_ACCOUNT_CODE",
    "SOURCE",
    "DESCRIPTION",
    "GL_DATE",
    "GL_CREATION_DATE",
    "JV_VOUCHER_NUMBER",
    "COST_CENTRE_CODE",
    "CONCEPT_CODE",
    "INTER_COMPANY_CODE",
    "VENDOR_CUSTOMER_NUMBER",
    "ENTERED_DR",
    "ENTERED_CR",
]

OPTIONAL_FIELDS: List[str] = ["USER"]


def _validate_column_mapping(column_mapping: Dict[str, str]) -> None:
    missing_required = [f for f in CANONICAL_REQUIRED_FIELDS if f not in column_mapping]
    if missing_required:
        raise HTTPException(
            status_code=400,
            detail=f"Missing column_mapping entries for required fields: {missing_required}",
        )


def _normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    # Convert numeric fields.
    for col in ["GL_ACCOUNT_CODE", "ENTERED_DR", "ENTERED_CR"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Ensure string identity fields.
    for col in ["SOURCE", "DESCRIPTION", "JV_VOUCHER_NUMBER", "COST_CENTRE_CODE", "CONCEPT_CODE", "INTER_COMPANY_CODE", "VENDOR_CUSTOMER_NUMBER"]:
        if col in df.columns:
            df[col] = df[col].fillna("").astype(str)

    # Parse dates.
    for col in ["GL_DATE", "GL_CREATION_DATE"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    # Derived: hour and weekday from GL_CREATION_DATE.
    if "GL_CREATION_DATE" in df.columns:
        df["HOUR"] = df["GL_CREATION_DATE"].dt.hour
        df["DAY_OF_WEEK"] = df["GL_CREATION_DATE"].dt.dayofweek  # Mon=0..Sun=6
    else:
        df["HOUR"] = 0
        df["DAY_OF_WEEK"] = -1

    # Net amount abs: used heavily by amount-based rules + ML.
    df["NET_AMOUNT_ABS"] = (df["ENTERED_DR"] - df["ENTERED_CR"]).abs()

    return df


def list_workbook_sheets(file_bytes: bytes) -> List[Dict[str, Any]]:
    wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    try:
        return [
            {
                "sheet_name": ws.title,
                "rows": int(ws.max_row or 0),
                "columns": int(ws.max_column or 0),
            }
            for ws in wb.worksheets
        ]
    finally:
        wb.close()


def extract_transactions_from_workbook(
    file_bytes: bytes,
    sheet_name: str,
    column_mapping: Dict[str, str],
) -> pd.DataFrame:
    _validate_column_mapping(column_mapping)

    df_in = pd.read_excel(
        io.BytesIO(file_bytes),
        sheet_name=sheet_name,
        dtype=str,
        engine="openpyxl",
    ).fillna("")

    # Canonical required columns.
    extracted: Dict[str, Any] = {}
    for canonical in CANONICAL_REQUIRED_FIELDS:
        excel_header = column_mapping[canonical]
        if excel_header not in df_in.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Excel header '{excel_header}' for '{canonical}' not found in sheet '{sheet_name}'.",
            )
        extracted[canonical] = df_in[excel_header]

    # Optional fields (best-effort).
    for opt in OPTIONAL_FIELDS:
        if opt in column_mapping:
            excel_header = column_mapping[opt]
            if excel_header not in df_in.columns:
                raise HTTPException(
                    status_code=400,
                    detail=f"Excel header '{excel_header}' for optional '{opt}' not found in sheet '{sheet_name}'.",
                )
            extracted[opt] = df_in[excel_header]

    df = pd.DataFrame(extracted)
    return _normalize_dataframe(df)


def extract_sheet_preview(
    file_bytes: bytes,
    sheet_name: str,
    column_mapping: Dict[str, str],
    preview_rows: int = 5,
) -> Dict[str, Any]:
    df = extract_transactions_from_workbook(file_bytes, sheet_name, column_mapping)
    return {
        "sheet_name": sheet_name,
        "rows": int(len(df)),
        "columns": list(df.columns),
        "preview_rows": df.head(preview_rows).to_dict(orient="records"),
    }

