"""Lista operativa de productos que faltan reponer o comprar.

Es un registro independiente del catálogo: agregar, editar, resolver o borrar
una anotación nunca toca ``products``. ``product_id`` es una referencia opcional
y deliberadamente sin FK, igual que en el historial de precios y los lotes de
carteles, para que un faltante sobreviva al borrado del producto y pueda existir
antes de que el producto esté cargado. ``quantity`` se guarda como texto para no
perder expresiones como "media caja" o "2 bultos"."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MissingProduct(Base):
    """Anotación de un producto pendiente de compra o reposición."""

    __tablename__ = "missing_products"
    __table_args__ = (
        Index(
            "uq_missing_products_pending_product", "product_id", unique=True,
            postgresql_where=text("status = 'pending' AND product_id IS NOT NULL"),
            sqlite_where=text("status = 'pending' AND product_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Referencia opcional a products; sin FK a propósito (ver docstring del módulo).
    product_id: Mapped[int | None] = mapped_column(
        Integer,
        index=True,
        nullable=True,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        index=True,
        nullable=False,
    )

    # Texto libre: "3 bultos", "media caja", "15 unidades" se conservan tal cual.
    quantity: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        server_default=text("'pending'"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
