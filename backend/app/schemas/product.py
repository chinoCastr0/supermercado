"""Contratos de entrada y salida de la API de productos.

IMPORTANCIA: valida datos externos antes de que alcancen la persistencia.
PATRÓN / SOLID: estos modelos son DTOs. Separar Create, Update y Response aplica
Interface Segregation (ISP): cada operación expone únicamente lo que necesita.
SOLUCIÓN ESPECÍFICA: límites de caracteres, precio positivo y campos editables.
"""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    model_validator,
)

from app.money import parse_money


REGISTER_NAME_BYTES = 18
REGISTER_BARCODE_BYTES = 15


def _register_text(value: str, field: str, maximum_bytes: int) -> str:
    if not value.strip():
        raise ValueError(f"{field} es obligatorio")
    if any(character in value for character in ("\x00", "\r", "\n", "\t")):
        raise ValueError(f"{field} contiene caracteres de control")
    try:
        encoded = value.encode("cp1252")
    except UnicodeEncodeError as exc:
        raise ValueError(
            f"{field} contiene caracteres incompatibles con la caja"
        ) from exc
    if len(encoded) > maximum_bytes:
        raise ValueError(f"{field} admite hasta {maximum_bytes} bytes")
    return value


def _register_barcode(value: str) -> str:
    return _register_text(value, "El código de barras", REGISTER_BARCODE_BYTES)


def _register_name(value: str) -> str:
    return _register_text(value, "El nombre", REGISTER_NAME_BYTES)


RegisterBarcode = Annotated[str, AfterValidator(_register_barcode)]
RegisterName = Annotated[str, AfterValidator(_register_name)]
WeightUnit = Literal["g", "kg", "ml", "l", "u"]
Money = Annotated[
    Decimal,
    BeforeValidator(parse_money),
    Field(gt=0, max_digits=12, decimal_places=2),
]


class WeightFields(BaseModel):
    """Cantidad para etiquetas; deliberadamente ajena al archivo PRESUR1."""

    weight: Decimal | None = Field(default=None, gt=0)
    weight_unit: WeightUnit | None = None

    @model_validator(mode="after")
    def validate_complete_weight(self) -> Self:
        if (self.weight is None) != (self.weight_unit is None):
            raise ValueError("El peso y su unidad deben informarse juntos")
        return self


class ProductBase(WeightFields):
    """Campos compartidos por creación y respuesta."""

    barcode: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    price: Money
    active: bool = True


class ProductCreate(ProductBase):
    """Datos obligatorios para crear un producto."""

    barcode: RegisterBarcode
    name: RegisterName


class ProductUpdate(WeightFields):
    """Campos opcionales para permitir actualizaciones parciales."""

    expected_revision: int = Field(ge=1)
    barcode: RegisterBarcode | None = None
    name: RegisterName | None = None
    price: Money | None = None
    active: bool | None = None


class ProductResponse(ProductBase):
    """Representación pública que agrega identidad y fecha del servidor."""

    id: int
    revision: int
    last_updated: datetime
    label_version: int
    printed: bool
    printed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ProductPriceChangeResponse(BaseModel):
    id: int
    product_id: int
    barcode: str
    old_price: Decimal | None
    new_price: Decimal
    source: str
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductPrintStatusUpdate(BaseModel):
    """Cambio explícito de estado para uno o varios carteles vigentes."""

    product_ids: list[int] = Field(min_length=1, max_length=20_000)
    printed: bool


class LabelGenerationRequest(BaseModel):
    """Productos solicitados para una generación de carteles."""

    product_ids: list[int] = Field(min_length=1, max_length=20_000)


class PrintStatusResponse(BaseModel):
    updated_count: int


class BatchConfirmationResponse(BaseModel):
    batch_id: str
    marked_count: int
    stale_product_ids: list[int]
    missing_product_ids: list[int]
