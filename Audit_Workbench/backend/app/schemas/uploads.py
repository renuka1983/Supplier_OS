from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel


class UploadInfo(BaseModel):
    id: int
    filename: str
    status: str
    row_count: int


class SheetInfo(BaseModel):
    sheet_name: str
    rows: int
    columns: int


class ExtractSheetRequest(BaseModel):
    sheet_name: str
    # Maps canonical internal fields (e.g. GL_ACCOUNT_CODE) -> Excel header names.
    column_mapping: Dict[str, str]


class ExtractSheetPreviewResponse(BaseModel):
    sheet_name: str
    rows: int
    columns: List[str]
    preview_rows: List[Dict[str, Any]]

