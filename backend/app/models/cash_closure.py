"""Un cierre por fecha y organización; importes JSON como strings decimales."""
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Date, DateTime, JSON, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class CashClosure(Base):
    __tablename__ = "cash_closures"
    __table_args__ = (UniqueConstraint("organization_id", "date", name="uq_closures_org_date"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[str] = mapped_column(String(64), index=True)
    date: Mapped[date] = mapped_column(Date)
    amounts: Mapped[dict] = mapped_column(JSON)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    sales_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(12), default="draft")
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
