#aca serian como los metodos de cada producto
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ProductBase(BaseModel):
    barcode: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    price: Decimal = Field(gt=0)
    active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
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
    id: int
    last_updated: datetime

    model_config = ConfigDict(from_attributes=True)
