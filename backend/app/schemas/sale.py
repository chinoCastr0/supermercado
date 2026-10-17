"""Contratos de ventas: dinero decimal estricto y detalle discriminado."""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field
import re

def decimal_text(value):
    if not isinstance(value, (str, Decimal)) or not re.fullmatch(r"\d+(\.\d{1,2})?", str(value)):
        raise ValueError("El importe debe ser un string decimal no negativo")
    return Decimal(value)

Amount = Annotated[Decimal, BeforeValidator(decimal_text), Field(ge=0, max_digits=12, decimal_places=2)]
Price = Annotated[Decimal, BeforeValidator(decimal_text), Field(gt=0, max_digits=12, decimal_places=2)]

class ProductLine(BaseModel):
    kind: Literal["product"]
    product_id: int = Field(ge=1)
    price: Price
    quantity: int = Field(strict=True, ge=1, le=1000000)

class ManualLine(BaseModel):
    kind: Literal["manual"]
    name: str = Field(default="Producto manual", max_length=255)
    price: Price
    quantity: int = Field(strict=True, ge=1, le=1000000)

class SaleCreate(BaseModel):
    client_id: UUID
    paid: Amount | None = None
    items: list[Annotated[ProductLine | ManualLine, Field(discriminator="kind")]] = Field(min_length=1, max_length=1000)

class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    kind: str
    product_id: int | None
    name: str
    barcode: str
    price: Decimal
    quantity: int
    subtotal: Decimal

class SaleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: str
    cashier: str
    date: date
    created_at: datetime
    total: Decimal
    paid: Decimal
    change: Decimal
    items: list[ItemResponse]

class SalesResponse(BaseModel):
    date: date
    total: Decimal
    sales: list[SaleResponse]
