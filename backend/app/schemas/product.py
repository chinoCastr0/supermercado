"""Contratos de entrada y salida de la API de productos.

IMPORTANCIA: valida datos externos antes de que alcancen la persistencia.
PATRÓN / SOLID: estos modelos son DTOs. Separar Create, Update y Response aplica
Interface Segregation (ISP): cada operación expone únicamente lo que necesita.
SOLUCIÓN ESPECÍFICA: límites de caracteres, precio positivo y campos editables.
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ProductBase(BaseModel):
    """Campos compartidos por creación y respuesta."""

    barcode: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    price: Decimal = Field(gt=0)
    active: bool = True


class ProductCreate(ProductBase):
    """Datos obligatorios para crear un producto."""

    pass


class ProductUpdate(BaseModel):
    """Campos opcionales para permitir actualizaciones parciales."""

    barcode: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )
    price: Decimal | None = Field(
        default=None,
        gt=0,
    )
    active: bool | None = None


class ProductResponse(ProductBase):
    """Representación pública que agrega identidad y fecha del servidor."""

    id: int
    last_updated: datetime

    model_config = ConfigDict(from_attributes=True)
