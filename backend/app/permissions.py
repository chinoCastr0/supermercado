"""Permisos personalizados de Clerk que exige la API.

Deben coincidir con los creados en Clerk (Dashboard → Organizations → Roles &
Permissions o `clerk api /organization_permissions`). La tabla rol → permiso
vive en Clerk y está documentada en docs/DEPLOY_BACKEND.md."""

PRODUCTS_READ = "org:products:read"
PRODUCTS_MANAGE = "org:products:manage"
PRICES_EDIT = "org:prices:edit"
LABELS_PRINT = "org:labels:print"
MISSING_MANAGE = "org:missing:manage"
EXPORT_REGISTER = "org:export:register"

ALL = frozenset(
    {
        PRODUCTS_READ,
        PRODUCTS_MANAGE,
        PRICES_EDIT,
        LABELS_PRINT,
        MISSING_MANAGE,
        EXPORT_REGISTER,
    }
)
