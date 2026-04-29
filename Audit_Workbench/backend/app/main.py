from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db_base import Base
from app.db_session import engine, SessionLocal
from app.api.routes import api_router
from app.services.seed import seed_defaults


def create_app() -> FastAPI:
    app = FastAPI(title="Audit Workbench Anomaly API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def startup() -> None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_defaults(db)
        finally:
            db.close()

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(api_router)
    return app


app = create_app()

