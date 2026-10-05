"""Verificación de sesiones de Clerk y contexto de organización de cada request.

El frontend adjunta el JWT de sesión de Clerk como header
`Authorization: Bearer <token>`. authenticate_request lo valida contra las
claves públicas de Clerk (JWKS, cacheadas) sin persistir nada localmente:
no hay tabla de usuarios ni de organizaciones propia, Clerk es la única fuente
de identidad.

Formato del session token v2 (verificado en clerk_backend_api 7.0.0,
security/authenticaterequest.py): el claim `o` trae `id` (org_...), `rol` (rol
SIN el prefijo `org:`) y `per`/`fpm`, que junto con `fea` codifican los
permisos personalizados como bitmask. El SDK ya los decodifica en
`org_id`, `org_role` y `org_permissions`. Los permisos de sistema
(`org:sys_*`) nunca viajan en el token: el backend sólo puede exigir permisos
personalizados."""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
import os
from typing import Any

from clerk_backend_api import AuthenticateRequestOptions, Clerk
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status

from app.config import get_allowed_origins

load_dotenv()

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")

if not CLERK_SECRET_KEY:
    raise RuntimeError("No se encontró CLERK_SECRET_KEY en el archivo .env")

_clerk = Clerk(bearer_auth=CLERK_SECRET_KEY)


@dataclass(frozen=True)
class AuthContext:
    """Identidad verificada del request: usuario, organización activa y permisos."""

    user_id: str
    org_id: str
    org_role: str
    permissions: frozenset[str]

    def has(self, permission: str) -> bool:
        """Indica si el rol del usuario en la organización activa otorga el permiso."""
        return permission in self.permissions


def _forbidden(code: str, message: str) -> HTTPException:
    """403 con un código estable para que el frontend distinga el motivo."""
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": code, "message": message},
    )


def auth_context_from_payload(payload: Mapping[str, Any]) -> AuthContext:
    """Construye el contexto desde un payload ya verificado y procesado por el SDK.

    Separado de la verificación criptográfica para poder probarlo sin red."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    if payload.get("v") != 2:
        raise _forbidden(
            "unsupported_token",
            "La sesión usa un formato de token sin organización. Cerrá sesión y volvé a ingresar.",
        )
    org_id = payload.get("org_id")
    if not org_id:
        raise _forbidden(
            "organization_required",
            "Seleccioná o creá una organización para continuar.",
        )
    role = payload.get("org_role") or ""
    if role and not role.startswith("org:"):
        role = f"org:{role}"
    return AuthContext(
        user_id=user_id,
        org_id=org_id,
        org_role=role,
        permissions=frozenset(payload.get("org_permissions") or ()),
    )


def get_auth_context(request: Request) -> AuthContext:
    """Dependency de FastAPI: 401 si la sesión es inválida, 403 sin organización activa."""
    state = _clerk.authenticate_request(
        request,
        AuthenticateRequestOptions(
            authorized_parties=get_allowed_origins(),
            accepts_token=["session_token"],
        ),
    )
    if not state.is_signed_in or not state.payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    return auth_context_from_payload(state.payload)


def ensure_permission(ctx: AuthContext, *permissions: str) -> None:
    """403 si falta alguno de los permisos; para checks que dependen del body."""
    if any(not ctx.has(permission) for permission in permissions):
        raise _forbidden(
            "permission_denied",
            "Tu rol en esta organización no permite esta acción.",
        )


def require_permission(*permissions: str) -> Callable[..., AuthContext]:
    """Dependency que exige TODOS los permisos indicados en la organización activa."""

    def dependency(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        ensure_permission(ctx, *permissions)
        return ctx

    return dependency
