"""Punto de entrada y composición de la API.

IMPORTANCIA: crea FastAPI, conecta infraestructura, rutas y middleware.
PATRÓN: Composition Root; las piezas se ensamblan aquí. Esto favorece SRP porque
los endpoints y la base no se configuran dentro de sus propias implementaciones.
SOLUCIÓN ESPECÍFICA: nombre de la API, CORS abierto y endpoint de diagnóstico.
NOTA DIDÁCTICA: no hay una jerarquía de subtipos del dominio donde demostrar LSP;
los DTOs separados corresponden a ISP, no a herencia polimórfica.
"""

import app.models  # Registra los modelos en Base.metadata antes de inicializar.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.products import router as products_router
from app.database import initialize_database


initialize_database()

app = FastAPI(
    title="Sistema Supermercado",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products_router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "API del supermercado funcionando",
    }
