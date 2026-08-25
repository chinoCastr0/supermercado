"""Modelo persistente del producto.

IMPORTANCIA: mapea la entidad Product a la tabla `products`.
PATRÓN / SOLID: SQLAlchemy implementa Data Mapper; este archivo aplica SRP al
describir persistencia sin ocuparse de HTTP, formularios o archivos Excel.
SOLUCIÓN ESPECÍFICA: tamaños, precisión monetaria, unicidad y fecha automática
son reglas concretas del inventario, no patrones de diseño.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Product(Base):
    """Representa un registro persistido del catálogo de productos."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    barcode: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        index=True,
        nullable=False,
    )

    price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # SOLUCIÓN ESPECÍFICA: el servidor controla esta marca temporal para que API,
    # importador y base compartan un único contrato llamado `last_updated`.
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
