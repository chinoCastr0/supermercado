"""Grupos consultables y validados del cierre diario."""
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.sale import Amount

class ClosureAmounts(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cash: list[Amount] = Field(min_length=2, max_length=2)
    transfers: list[Amount] = Field(min_length=1, max_length=100)
    posnet: list[Amount] = Field(min_length=1, max_length=100)
    orders: list[Amount] = Field(min_length=1, max_length=100)

class ClosureWrite(BaseModel):
    amounts: ClosureAmounts

class ClosureResponse(BaseModel):
    date: date
    amounts: ClosureAmounts
    total: Decimal
    sales_total: Decimal
    difference: Decimal
    status: str
    confirmed_at: datetime | None = None
