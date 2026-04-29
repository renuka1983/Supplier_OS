from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db_session import SessionLocal
from app.models.prediction_job import PredictionJob
from app.models.upload import Upload
from app.schemas.anomalies import JobStatusResponse, RunAnomaliesRequest
from app.services.predict_service import run_anomaly_pipeline
from app.services.storage import JOBS_DIR


anomalies_router = APIRouter(prefix="/anomalies", tags=["anomalies"])


def _save_output_file(job_id: str, file_bytes: bytes) -> str:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    p = JOBS_DIR / f"{job_id}_anomalies.xlsx"
    p.write_bytes(file_bytes)
    return str(p)


def _post_webhook(webhook_url: str, summary: Dict[str, Any], file_bytes: bytes) -> None:
    with httpx.Client(timeout=60) as client:
        files = {
            "file": ("anomalies_output.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }
        data = {"summary": json.dumps(summary, default=str)}
        client.post(webhook_url, data=data, files=files)


def _run_job(job_db_id: int) -> None:
    # This runs in a background thread; it must open its own DB session.
    db = SessionLocal()
    try:
        job = db.query(PredictionJob).filter(PredictionJob.id == job_db_id).first()
        if not job:
            return
        job.status = "running"
        job.progress = 10
        db.commit()

        upload = db.query(Upload).filter(Upload.id == job.upload_id).first()
        if not upload:
            job.status = "failed"
            job.error_text = "Upload not found"
            job.progress = 100
            db.commit()
            return

        job.progress = 30
        db.commit()

        out_bytes, summary = run_anomaly_pipeline(
            db=db,
            upload=upload,
            sheet_name=job.sheet_name,
            column_mapping=json.loads(job.column_mapping_json or "{}"),
        )

        output_path = _save_output_file(job.job_id, out_bytes)

        job.output_file_path = output_path
        job.summary_json = json.dumps(summary, default=str)
        job.progress = 100
        job.status = "completed"
        db.commit()

        if job.webhook_url:
            try:
                _post_webhook(job.webhook_url, summary=summary, file_bytes=out_bytes)
            except Exception:
                # Best-effort only; do not fail the job.
                pass
    except Exception as exc:
        job = db.query(PredictionJob).filter(PredictionJob.id == job_db_id).first()
        if job:
            job.status = "failed"
            job.error_text = str(exc)
            job.progress = 100
            db.commit()
    finally:
        db.close()


@anomalies_router.post("/run")
def run_anomalies(
    payload: RunAnomaliesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    job_id = uuid4().hex

    upload = db.query(Upload).filter(Upload.id == payload.upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    job = PredictionJob(
        job_id=job_id,
        upload_id=payload.upload_id,
        sheet_name=payload.sheet_name,
        column_mapping_json=json.dumps(payload.column_mapping, default=str),
        webhook_url=payload.webhook_url or "",
        status="queued",
        progress=0,
        output_file_path="",
        summary_json="{}",
        error_text="",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_job, job.id)
    return {"job_id": job.job_id, "status": job.status}


@anomalies_router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job(job_id: str, db: Session = Depends(get_db)) -> JobStatusResponse:
    job = db.query(PredictionJob).filter(PredictionJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    summary = {}
    if job.summary_json:
        try:
            summary = json.loads(job.summary_json)
        except Exception:
            summary = {}
    return JobStatusResponse(
        job_id=job.job_id,
        upload_id=job.upload_id,
        sheet_name=job.sheet_name,
        status=job.status,
        progress=int(job.progress or 0),
        summary=summary,
        error=job.error_text or "",
    )


@anomalies_router.get("/jobs/{job_id}/file")
def get_job_file(job_id: str, db: Session = Depends(get_db)) -> Response:
    job = db.query(PredictionJob).filter(PredictionJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "completed" or not job.output_file_path:
        raise HTTPException(status_code=409, detail=f"Job not completed (status={job.status})")

    p = Path(job.output_file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Output file missing")
    data = p.read_bytes()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={job_id}_anomalies.xlsx"},
    )

