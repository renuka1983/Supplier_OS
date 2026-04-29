from __future__ import annotations

from pathlib import Path


def project_root() -> Path:
    # backend/app/services/storage.py -> parents[3] is backend/
    return Path(__file__).resolve().parents[2]


BASE_DIR = project_root()  # backend/
STORAGE_DIR = BASE_DIR / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
JOBS_DIR = STORAGE_DIR / "jobs"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)

