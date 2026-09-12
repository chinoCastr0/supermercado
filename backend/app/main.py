"""Composición de FastAPI: rutas, CORS y disponibilidad del proceso.

Importar este módulo ejecuta initialize_database; el arranque tiene efectos DDL.
No hay autenticación en estas rutas. El health check no consulta PostgreSQL."""

import os

import app.models  # Registra los modelos en Base.metadata antes de inicializar.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.products import router as products_router
from app.api.labels import router as labels_router
from app.api.missing_products import router as missing_products_router
from app.database import initialize_database


initialize_database()


def _allowed_origins() -> list[str]:
    """Obtiene los orígenes permitidos sin abrir la API a cualquier sitio."""
    configured = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return [
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    ]


app = FastAPI(
    title="Sistema Supermercado",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "X-Print-Batch-Id",
        "X-Print-Product-Count",
        "X-Print-Skipped-Ids",
        "X-Print-Warnings",
    ],
)

app.include_router(products_router)
app.include_router(labels_router)
app.include_router(missing_products_router)


@app.get("/")
def root() -> dict[str, str]:
    """Devuelve un mensaje informativo; no comprueba acceso a la base."""
    return {
        "message": "API del supermercado funcionando",
    }


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    """Confirma que la API terminó de iniciar y está disponible."""
    return {"status": "ok"}
