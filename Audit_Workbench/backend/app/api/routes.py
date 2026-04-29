from __future__ import annotations

from fastapi import APIRouter

from app.api.endpoints.uploads import uploads_router
from app.api.endpoints.config import config_router
from app.api.endpoints.anomalies import anomalies_router

api_router = APIRouter()
api_router.include_router(uploads_router)
api_router.include_router(config_router)
api_router.include_router(anomalies_router)

