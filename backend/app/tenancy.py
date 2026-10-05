"""Acceso a filas acotado a la organización activa.

Un registro de otra organización se trata exactamente igual que uno inexistente
(404), para no revelar su existencia. Todas las consultas de la API deben
filtrar por organization_id; get_owned cubre el caso habitual de "buscar por id"."""

from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

ModelT = TypeVar("ModelT")


def get_owned(
    db: Session,
    model: type[ModelT],
    record_id: object,
    organization_id: str,
    *,
    lock: bool = False,
) -> ModelT | None:
    """Devuelve la fila sólo si pertenece a la organización; si no, None."""
    statement = select(model).where(
        model.id == record_id,
        model.organization_id == organization_id,
    )
    if lock:
        statement = statement.with_for_update()
    return db.scalar(statement)
