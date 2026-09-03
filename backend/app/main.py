"""Punto de entrada y composición de la API.

IMPORTANCIA: crea FastAPI, conecta infraestructura, rutas y middleware.
PATRÓN: Composition Root; las piezas se ensamblan aquí. Esto favorece SRP porque
los endpoints y la base no se configuran dentro de sus propias implementaciones.
SOLUCIÓN ESPECÍFICA: nombre de la API, CORS configurable y health check.
NOTA DIDÁCTICA: no hay una jerarquía de subtipos del dominio donde demostrar LSP;
los DTOs separados corresponden a ISP, no a herencia polimórfica.
"""

import os

import app.models  # Registra los modelos en Base.metadata antes de inicializar.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.products import router as products_router
from app.api.labels import router as labels_router
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


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "API del supermercado funcionando",
    }


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    """Confirma que la API terminó de iniciar y está disponible."""
    return {"status": "ok"}
