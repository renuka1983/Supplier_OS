from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel


class RunAnomaliesRequest(BaseModel):
    upload_id: int
    sheet_name: str
    column_mapping: Dict[str, str]
    webhook_url: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    upload_id: int
    sheet_name: str
    status: str
    progress: int
    summary: Dict[str, Any] = {}
    error: str = ""

