"""Historial de precios escrito junto con cada cambio del catálogo.

El código lo utiliza de forma append-only, pero la base no impide UPDATE/DELETE.
product_id carece intencionalmente de FK al catálogo para sobrevivir al borrado.
source identifica la operación y changed_by el usuario de Clerk que la ejecutó;
las filas anteriores a la migración de organizaciones no tienen actor (NULL)."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProductPriceChange(Base):
    """Registra importes, origen operativo y actor de cada cambio de precio."""

    __tablename__ = "product_price_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    barcode: Mapped[str] = mapped_column(String(50), nullable=False)
    old_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    new_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    # user_id de Clerk (user_...); NULL sólo en historial previo a la migración.
    changed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
