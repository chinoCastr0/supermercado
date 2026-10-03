"""Autenticación y contexto de organización (ver app.auth).

No depende de red: los tokens inválidos fallan por formato antes de necesitar el
JWKS de Clerk, y el contexto se arma desde payloads ya "verificados". El
decodificado de permisos usa el mismo procesamiento del SDK que corre en
producción. El parseo de ALLOWED_ORIGINS está cubierto en test_config.py."""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from app import permissions
from app.auth import (
    AuthContext,
    auth_context_from_payload,
    get_auth_context,
    require_permission,
)
from clerk_backend_api.security.authenticaterequest import _process_payload


def _protected_app() -> FastAPI:
    app = FastAPI()

    @app.get("/protected")
    def protected(ctx: AuthContext = Depends(get_auth_context)):
        return {"user_id": ctx.user_id}

    @app.get("/prices")
    def prices(ctx: AuthContext = Depends(require_permission(permissions.PRICES_EDIT))):
        return {"org_id": ctx.org_id}

    return app


def _ctx(*perms: str, org_id: str = "org_A") -> AuthContext:
    return AuthContext(user_id="user_1", org_id=org_id, org_role="org:member",
                       permissions=frozenset(perms))


def test_protected_route_rejects_missing_token():
    with TestClient(_protected_app()) as client:
        assert client.get("/protected").status_code == 401


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


def test_v2_claims_are_decoded_into_context():
    # Formato real v2: rol sin prefijo y permisos como bitmask por feature.
    payload = {
        "sub": "user_1", "v": 2, "fea": "o:products,o:prices",
        "o": {"id": "org_A", "rol": "encargado", "slg": "a",
              "per": "read,manage,edit", "fpm": "3,4"},
    }
    _process_payload(payload)
    ctx = auth_context_from_payload(payload)
    assert ctx == AuthContext(
        user_id="user_1", org_id="org_A", org_role="org:encargado",
        permissions=frozenset({"org:products:read", "org:products:manage",
                               "org:prices:edit"}),
    )


def test_session_without_active_organization_is_forbidden():
    payload = {"sub": "user_1", "v": 2}
    _process_payload(payload)
    with pytest.raises(HTTPException) as error:
        auth_context_from_payload(payload)
    assert error.value.status_code == 403
    assert error.value.detail["code"] == "organization_required"


def test_v1_token_is_forbidden_with_clear_reason():
    with pytest.raises(HTTPException) as error:
        auth_context_from_payload({"sub": "user_1", "org_id": "org_A"})
    assert error.value.status_code == 403
    assert error.value.detail["code"] == "unsupported_token"


def test_missing_subject_is_unauthenticated():
    with pytest.raises(HTTPException) as error:
        auth_context_from_payload({"v": 2, "org_id": "org_A"})
    assert error.value.status_code == 401


def test_require_permission_rejects_member_without_permission():
    app = _protected_app()
    app.dependency_overrides[get_auth_context] = lambda: _ctx(permissions.PRODUCTS_READ)
    with TestClient(app) as client:
        response = client.get("/prices")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "permission_denied"


def test_require_permission_accepts_granted_permission():
    app = _protected_app()
    app.dependency_overrides[get_auth_context] = lambda: _ctx(permissions.PRICES_EDIT)
    with TestClient(app) as client:
        response = client.get("/prices")
    assert response.status_code == 200
    assert response.json() == {"org_id": "org_A"}
