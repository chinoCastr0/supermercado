"""Persistencia de lotes de carteles y versiones incluidas."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PrintBatch(Base):
    """Representa una generación de PDF pendiente de confirmación."""

    __tablename__ = "print_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(
        String(20),
        default="generated",
        nullable=False,
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class PrintBatchItem(Base):
    """Congela la versión de cartel incluida para cada producto."""

    __tablename__ = "print_batch_items"

    batch_id: Mapped[str] = mapped_column(
        ForeignKey("print_batches.id", ondelete="CASCADE"),
        primary_key=True,
    )
    product_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label_version: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int | None] = mapped_column(Integer)
    snapshot_barcode: Mapped[str | None] = mapped_column(String(50))
    snapshot_name: Mapped[str | None] = mapped_column(String(255))
    snapshot_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    snapshot_weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    snapshot_weight_unit: Mapped[str | None] = mapped_column(String(2))
