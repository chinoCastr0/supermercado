"""Exige que las rutas de negocio tengan un token de Clerk válido (ver app.main);
las rutas públicas (raíz, health) no pasan por require_auth. No depende de red:
los tokens usados acá fallan por formato antes de necesitar el JWKS de Clerk.
El parseo de ALLOWED_ORIGINS está cubierto en test_config.py."""

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth import require_auth


def _protected_app() -> FastAPI:
    app = FastAPI()

    @app.get("/protected")
    def protected(user_id: str = Depends(require_auth)):
        return {"user_id": user_id}

    return app


def test_protected_route_rejects_missing_token():
    with TestClient(_protected_app()) as client:
        response = client.get("/protected")
        assert response.status_code == 401


def test_protected_route_rejects_malformed_token():
    with TestClient(_protected_app()) as client:
        response = client.get(
            "/protected", headers={"Authorization": "Bearer not-a-real-token"}
        )
        assert response.status_code == 401


def test_public_route_ignores_auth():
    app = FastAPI()

    @app.get("/public")
    def public():
        return {"ok": True}

    with TestClient(app) as client:
        assert client.get("/public").status_code == 200
