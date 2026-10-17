"""Permisos personalizados de Clerk que exige la API.

Las claves existentes pueden venir en Clerk; los extras de aplicación se
otorgan por rol verificado mediante ROLE_EXTRAS. Caja no requiere crear permisos
nuevos en Clerk. "encargado" es un rol local (tabla member_roles) de un org:member,
porque el plan de Clerk de producción no admite roles personalizados. Tabla
completa en docs/DEPLOY_BACKEND.md y espejo en src/utils/permissions.ts."""

PRODUCTS_READ = "org:products:read"
PRODUCTS_MANAGE = "org:products:manage"
PRICES_EDIT = "org:prices:edit"
LABELS_PRINT = "org:labels:print"
MISSING_MANAGE = "org:missing:manage"
EXPORT_REGISTER = "org:export:register"

SALES_CREATE = "org:sales:create"
SALES_READ = "org:sales:read"
CLOSURES_MANAGE = "org:closures:manage"

ALL = frozenset(
    {
        SALES_CREATE, SALES_READ, CLOSURES_MANAGE,
        PRODUCTS_READ,
        PRODUCTS_MANAGE,
        PRICES_EDIT,
        LABELS_PRINT,
        MISSING_MANAGE,
        EXPORT_REGISTER,
    }
)

# Roles de Clerk (vienen en el token) y rol local (tabla member_roles).
ADMIN_ROLE = "org:admin"
MEMBER_ROLE = "org:member"
ENCARGADO_ROLE = "org:encargado"

# Permisos de aplicación por rol verificado; no requieren configuración en Clerk.
# Mantener esta tabla idéntica a ROLE_EXTRAS en src/utils/permissions.ts.
ADMIN_EXTRA = ALL
MEMBER_EXTRA = frozenset({SALES_CREATE})

# Permisos que el rol local suma a un org:member de Clerk. Nunca incluye
# administración de miembros: eso sigue siendo exclusivo de org:admin.
ENCARGADO_EXTRA = frozenset({PRODUCTS_MANAGE, PRICES_EDIT, EXPORT_REGISTER, SALES_CREATE, SALES_READ, CLOSURES_MANAGE})

ROLE_EXTRAS = {
    ADMIN_ROLE: ADMIN_EXTRA,
    MEMBER_ROLE: MEMBER_EXTRA,
    ENCARGADO_ROLE: ENCARGADO_EXTRA,
}
