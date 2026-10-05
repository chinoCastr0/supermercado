"""Rol local de un miembro dentro de una organización de Clerk.

Clerk sigue siendo la fuente de identidad y de membresía (admin/member); esta
tabla sólo guarda la promoción a "encargado", porque el plan de Clerk de
producción no permite roles personalizados. Sin fila, el miembro es un
`org:member` común. Una fila de alguien que ya no es miembro es inofensiva:
sin membresía en Clerk no existe un token de esa organización."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MemberRole(Base):
    """Rol local de (organización, usuario); hoy sólo "encargado"."""

    __tablename__ = "member_roles"

    organization_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
