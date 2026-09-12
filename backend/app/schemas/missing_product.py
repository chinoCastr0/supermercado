"""DTOs Pydantic para la lista de faltantes.

A diferencia del catálogo, estos campos no viajan a la caja registradora: el
nombre admite cualquier texto legible y ``quantity`` se conserva como string.
``MissingProductUpdate`` distingue "omitido" de "null explícito" mediante
``exclude_unset`` en el controlador; ``product_id``, ``quantity`` y ``notes`` sí
aceptan ``null`` explícito porque son opcionales y limpiarlos es válido."""

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

MissingProductStatus = Literal["pending", "resolved"]


def _blank_to_none(value: object) -> object:
    """Convierte cadenas vacías o de solo espacios en ``None`` antes de validar."""
    if isinstance(value, str):
        return value.strip() or None
    return value


def _strip_required(value: object) -> object:
    """Recorta espacios exteriores de un texto obligatorio sin vaciarlo aquí."""
    return value.strip() if isinstance(value, str) else value


MissingName = Annotated[
    str,
    BeforeValidator(_strip_required),
    Field(min_length=1, max_length=255),
]
Quantity = Annotated[
    Annotated[str, StringConstraints(max_length=120)] | None,
    BeforeValidator(_blank_to_none),
]
Notes = Annotated[
    Annotated[str, StringConstraints(max_length=500)] | None,
    BeforeValidator(_blank_to_none),
]


class MissingProductBase(BaseModel):
    """Campos que comparten alta y respuesta."""

    name: MissingName
    product_id: int | None = Field(default=None, ge=1)
    quantity: Quantity = None
    notes: Notes = None


class MissingProductCreate(MissingProductBase):
    """Datos para anotar un faltante; siempre nace como ``pending``."""


class MissingProductUpdate(BaseModel):
    """Actualización parcial: solo se tocan los campos presentes en la petición."""

    name: MissingName | None = None
    product_id: int | None = Field(default=None, ge=1)
    quantity: Quantity = None
    notes: Notes = None
    status: MissingProductStatus | None = None

    @model_validator(mode="after")
    def reject_explicit_null_on_name(self) -> Self:
        """``name`` es obligatorio: enviar ``null`` explícito debe rechazarse."""
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("El nombre no puede ser nulo")
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("El estado no puede ser nulo")
        return self

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> Self:
        """Evita PUT vacíos que no expresan ningún cambio."""
        if not self.model_fields_set:
            raise ValueError("No hay cambios para aplicar")
        return self


class MissingProductResponse(MissingProductBase):
    """Representación pública con identidad, estado y marcas temporales."""

    id: int
    status: MissingProductStatus
    created_at: datetime
    resolved_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class MissingProductConflict(BaseModel):
    """Faltante pendiente que ya cubre el mismo ``product_id``."""

    message: str
    existing: MissingProductResponse
