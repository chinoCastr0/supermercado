"""Persistencia de lotes de carteles y versiones incluidas."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
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
