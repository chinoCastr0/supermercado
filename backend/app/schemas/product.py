"""DTOs Pydantic para entradas y respuestas de catálogo y carteles.

Create valida texto compatible con PRESUR; Response admite registros históricos.
Update distingue campos omitidos mediante exclude_unset en el controlador.
La validación parcial debe contrastarse también con el estado persistido."""

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
    """Valida obligatoriedad, codificación y longitud en bytes del formato de caja.

    Recorta espacios exteriores antes de validar y persistir: de lo contrario
    ``"001"`` (alta manual) y ``" 001 "`` (importación, que sí recorta) pueden
    coexistir como registros distintos y colisionar recién al exportar. Ver A09.
    """
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field} es obligatorio")
    if any(character in normalized for character in ("\x00", "\r", "\n", "\t")):
        raise ValueError(f"{field} contiene caracteres de control")
    try:
        encoded = normalized.encode("cp1252")
    except UnicodeEncodeError as exc:
        raise ValueError(
            f"{field} contiene caracteres incompatibles con la caja"
        ) from exc
    if len(encoded) > maximum_bytes:
        raise ValueError(f"{field} admite hasta {maximum_bytes} bytes")
    return normalized


def _register_barcode(value: str) -> str:
    """Aplica al código el límite binario de 15 bytes."""
    return _register_text(value, "El código de barras", REGISTER_BARCODE_BYTES)


def _register_name(value: str) -> str:
    """Aplica al nombre el límite binario de 18 bytes."""
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

    # decimal_places=2 refleja Numeric(10,2): un valor como 0.001 se rechaza
    # aquí en vez de truncarse en silencio a 0.00 al persistir. Ver A03.
    weight: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    weight_unit: WeightUnit | None = None

    @model_validator(mode="after")
    def validate_complete_weight(self) -> Self:
        """Exige peso y unidad juntos dentro del DTO recibido, no del registro final."""
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
    """Campos opcionales para permitir actualizaciones parciales.

    ``None`` sólo significa "omitido" a través de ``exclude_unset`` en el
    controlador. Los campos abajo son NOT NULL en la tabla; si el cliente
    envía explícitamente ``null`` en alguno, ``exclude_unset`` no lo filtra y
    la escritura termina en un IntegrityError genérico. Ver A08.
    """

    expected_revision: int = Field(ge=1)
    barcode: RegisterBarcode | None = None
    name: RegisterName | None = None
    price: Money | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def reject_explicit_null_on_required_fields(self) -> Self:
        """Distingue "omitido" de "null explícito" para columnas NOT NULL."""
        for field in ("barcode", "name", "price", "active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} no puede ser nulo")
        return self


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
    """Evento auditable serializado sin convertir importes a float."""
    id: int
    product_id: int
    barcode: str
    old_price: Decimal | None
    new_price: Decimal
    source: str
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BulkProductRevision(BaseModel):
    """Identidad y version que el usuario reviso antes de confirmar."""

    id: int = Field(ge=1)
    expected_revision: int = Field(ge=1)


class BulkPriceUpdateRequest(BaseModel):
    """Precio absoluto que se aplicara atomicamente a una seleccion."""

    price: Money
    products: list[BulkProductRevision] = Field(min_length=1, max_length=20_000)

    @model_validator(mode="after")
    def validate_unique_products(self) -> Self:
        """Rechaza repeticiones para que cada producto se procese una sola vez."""
        ids = [product.id for product in self.products]
        if len(ids) != len(set(ids)):
            raise ValueError("Cada producto debe aparecer una sola vez")
        return self


class BulkPriceUpdateResponse(BaseModel):
    """Cuenta cambios efectivos y precios que ya coincidían."""
    updated_count: int
    unchanged_count: int


class BulkDeleteRequest(BaseModel):
    """Identidades únicas y positivas; no incluye revisiones de los productos."""
    product_ids: list[int] = Field(min_length=1, max_length=20_000)

    @model_validator(mode="after")
    def validate_unique_products(self) -> Self:
        """Rechaza repeticiones para que cada producto se procese una sola vez."""
        if len(self.product_ids) != len(set(self.product_ids)):
            raise ValueError("Cada producto debe aparecer una sola vez")
        if any(product_id < 1 for product_id in self.product_ids):
            raise ValueError("Los IDs de producto deben ser positivos")
        return self


class BulkDeleteResponse(BaseModel):
    """Cantidad de productos eliminados en la transacción."""
    deleted_count: int


class ProductPrintStatusUpdate(BaseModel):
    """Cambio explícito de estado para uno o varios carteles vigentes."""

    product_ids: list[int] = Field(min_length=1, max_length=20_000)
    printed: bool


class LabelGenerationRequest(BaseModel):
    """Productos solicitados para una generación de carteles."""

    product_ids: list[int] = Field(min_length=1, max_length=20_000)


class PrintStatusResponse(BaseModel):
    """Cantidad de productos procesados por el cambio de estado."""
    updated_count: int


class BatchConfirmationResponse(BaseModel):
    """Separa confirmaciones de versiones obsoletas y productos ausentes."""
    batch_id: str
    marked_count: int
    stale_product_ids: list[int]
    missing_product_ids: list[int]
