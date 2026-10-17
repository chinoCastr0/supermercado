"""Permisos personalizados de Clerk que exige la API.

Deben coincidir con los creados en Clerk (Dashboard → Organizations → Roles &
Permissions o `clerk api /organization_permissions`). Los permisos de
org:admin y org:member se asignan en Clerk; "encargado" es un rol local
(tabla member_roles) que suma ENCARGADO_EXTRA a un org:member, porque el plan
de Clerk de producción no admite roles personalizados. Tabla completa en
docs/DEPLOY_BACKEND.md."""

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

# Caja concede estas capacidades al admin verificado sin depender de que los
# permisos nuevos ya estén presentes en su token. No amplía otros permisos.
ADMIN_EXTRA = frozenset({SALES_CREATE, SALES_READ, CLOSURES_MANAGE})

# Permisos que el rol local suma a un org:member de Clerk. Nunca incluye
# administración de miembros: eso sigue siendo exclusivo de org:admin.
ENCARGADO_EXTRA = frozenset({PRODUCTS_MANAGE, PRICES_EDIT, EXPORT_REGISTER, CLOSURES_MANAGE})
