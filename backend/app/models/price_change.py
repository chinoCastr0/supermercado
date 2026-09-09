"""Historial de precios escrito junto con cada cambio del catálogo.

El código lo utiliza de forma append-only, pero la base no impide UPDATE/DELETE.
product_id carece intencionalmente de FK al catálogo para sobrevivir al borrado.
source identifica la operación, no al usuario que la ejecutó."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProductPriceChange(Base):
    """Registra importes y origen operativo; todavía no identifica al actor."""

    __tablename__ = "product_price_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    barcode: Mapped[str] = mapped_column(String(50), nullable=False)
    old_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    new_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
