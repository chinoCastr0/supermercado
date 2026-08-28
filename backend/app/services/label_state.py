"""Reglas de versionado del contenido visible en carteles."""

from typing import Any

from app.models.product import Product
from app.services.label_pdf import VISIBLE_LABEL_FIELDS


def visible_label_changed(product: Product, values: dict[str, Any]) -> bool:
    """Compara únicamente campos capaces de cambiar el cartel impreso."""
    return any(
        field in values and getattr(product, field) != values[field]
        for field in VISIBLE_LABEL_FIELDS
    )


def mark_label_pending(product: Product) -> None:
    """Crea una nueva versión y descarta la confirmación de la anterior."""
    product.label_version += 1
    product.printed_label_version = None
    product.printed_at = None
