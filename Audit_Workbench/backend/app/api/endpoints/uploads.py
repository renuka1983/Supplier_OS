from __future__ import annotations

import os
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db_session import get_db
from app.models.upload import Upload
from app.schemas.uploads import ExtractSheetPreviewResponse, ExtractSheetRequest, SheetInfo, UploadInfo
from app.services.excel_service import list_workbook_sheets, extract_sheet_preview
from app.services.storage import UPLOADS_DIR


uploads_router = APIRouter(prefix="/uploads", tags=["uploads"])


def _safe_filename(name: str) -> str:
    name = name or "upload"
    return name.replace(os.sep, "_").replace("/", "_").replace("\\", "_")


@uploads_router.post("", response_model=UploadInfo)
def create_upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> UploadInfo:
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in {"xlsx", "xls"}:
        raise HTTPException(status_code=400, detail="Only Excel (.xlsx/.xls) supported")

    blob = file.file.read()

    upload = Upload(filename=filename, status="completed", row_count=0, file_path="")
    db.add(upload)
    db.commit()
    db.refresh(upload)

    out_path = UPLOADS_DIR / f"upload_{upload.id}_{_safe_filename(filename)}"
    out_path.write_bytes(blob)
    upload.file_path = str(out_path)
    db.commit()
    db.refresh(upload)

    return UploadInfo(id=upload.id, filename=upload.filename, status=upload.status, row_count=upload.row_count)


@uploads_router.get("/{upload_id}/sheets", response_model=List[SheetInfo])
def get_sheets(upload_id: int, db: Session = Depends(get_db)) -> List[SheetInfo]:
    upload = db.query(Upload).filter(Upload.id == upload_id).first()
    if not upload or not upload.file_path:
        raise HTTPException(status_code=404, detail="Upload not found")
    p = Path(upload.file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Upload file missing on disk")
    file_bytes = p.read_bytes()
    sheets = list_workbook_sheets(file_bytes)
    return [SheetInfo(**s) for s in sheets]


@uploads_router.post("/{upload_id}/extract", response_model=ExtractSheetPreviewResponse)
def extract_preview(
    upload_id: int,
    payload: ExtractSheetRequest,
    db: Session = Depends(get_db),
) -> ExtractSheetPreviewResponse:
    upload = db.query(Upload).filter(Upload.id == upload_id).first()
    if not upload or not upload.file_path:
        raise HTTPException(status_code=404, detail="Upload not found")
    p = Path(upload.file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Upload file missing on disk")
    file_bytes = p.read_bytes()
    preview = extract_sheet_preview(
        file_bytes=file_bytes,
        sheet_name=payload.sheet_name,
        column_mapping=payload.column_mapping,
    )
    return ExtractSheetPreviewResponse(
        sheet_name=preview["sheet_name"],
        rows=preview["rows"],
        columns=preview["columns"],
        preview_rows=preview["preview_rows"],
    )

