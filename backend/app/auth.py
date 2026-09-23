"""Verificación de sesiones de Clerk para las rutas de la API.

El frontend adjunta el JWT de sesión de Clerk como header
`Authorization: Bearer <token>`. authenticate_request lo valida contra las
claves públicas de Clerk (JWKS, cacheadas) sin persistir nada localmente:
no hay tabla de usuarios propia, Clerk es la única fuente de identidad."""

import os

from clerk_backend_api import AuthenticateRequestOptions, Clerk
from dotenv import load_dotenv
from fastapi import HTTPException, Request

from app.config import get_allowed_origins

load_dotenv()

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")

if not CLERK_SECRET_KEY:
    raise RuntimeError("No se encontró CLERK_SECRET_KEY en el archivo .env")

_clerk = Clerk(bearer_auth=CLERK_SECRET_KEY)


def require_auth(request: Request) -> str:
    """Dependency de FastAPI: exige un token de sesión de Clerk válido.

    Devuelve el user id (`sub`) del token verificado; 401 si falta o es inválido."""
    state = _clerk.authenticate_request(
        request,
        AuthenticateRequestOptions(
            authorized_parties=get_allowed_origins(),
            accepts_token=["session_token"],
        ),
    )
    user_id = state.payload.get("sub") if state.payload else None
    if not state.is_signed_in or not user_id:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user_id
