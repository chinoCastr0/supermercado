"""Composición de FastAPI: rutas, CORS y disponibilidad del proceso.

Importar este módulo ejecuta initialize_database; el arranque tiene efectos DDL.
Las rutas de negocio exigen una sesión de Clerk válida (ver app.auth); `/` y
`/health` quedan públicas para health checks. El health check no consulta
PostgreSQL."""

import app.models  # Registra los modelos en Base.metadata antes de inicializar.
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.products import router as products_router
from app.api.labels import router as labels_router
from app.api.offers import router as offers_router
from app.api.missing_products import router as missing_products_router
from app.auth import require_auth
from app.config import get_allowed_origins
from app.database import initialize_database


initialize_database()


app = FastAPI(
    title="Sistema Supermercado",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
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

_auth = [Depends(require_auth)]
app.include_router(products_router, dependencies=_auth)
app.include_router(labels_router, dependencies=_auth)
app.include_router(offers_router, dependencies=_auth)
app.include_router(missing_products_router, dependencies=_auth)


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
