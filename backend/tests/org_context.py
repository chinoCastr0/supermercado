"""Contextos de autenticación ficticios para llamar rutas sin Clerk.

Las suites llaman a las funciones de ruta directamente; ctx_for reemplaza lo que
en producción arma get_auth_context desde el session token."""

from app import permissions
from app.auth import AuthContext

ORG_A = "org_A"
ORG_B = "org_B"


def ctx_for(
    org_id: str = ORG_A,
    perms: frozenset[str] | set[str] = permissions.ALL,
    *,
    user_id: str = "user_admin",
    role: str = "org:admin",
) -> AuthContext:
    """Contexto con los permisos indicados; por defecto, admin de ORG_A."""
    return AuthContext(
        user_id=user_id, org_id=org_id, org_role=role, permissions=frozenset(perms)
    )


ADMIN_A = ctx_for(ORG_A)
ADMIN_B = ctx_for(ORG_B, user_id="user_admin_b")
# org:member: lectura, carteles y faltantes (ver docs/DEPLOY_BACKEND.md).
MEMBER_A = ctx_for(
    ORG_A,
    {permissions.PRODUCTS_READ, permissions.LABELS_PRINT, permissions.MISSING_MANAGE},
    user_id="user_member",
    role="org:member",
)
