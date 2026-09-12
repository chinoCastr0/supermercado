"""Operaciones HTTP de la lista de faltantes.

Esta lista es operativa: ninguna ruta de este módulo escribe en ``products`` ni
en el historial de precios. Cuando se recibe un ``product_id`` solo se lee el
catálogo para validar que la referencia existe; el precio, el código de barras y
demás campos del producto nunca se copian a la anotación."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.missing_product import MissingProduct
from app.models.product import Product
from app.schemas.missing_product import (
    MissingProductCreate,
    MissingProductResponse,
    MissingProductUpdate,
)

router = APIRouter(
    prefix="/missing-products",
    tags=["Missing products"],
)


def _like_pattern(value: str) -> str:
    """Escapa comodines del usuario para que LIKE busque texto literal."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _get_or_404(missing_id: int, db: Session) -> MissingProduct:
    """Recupera la anotación o responde 404 si ya no existe."""
    record = db.get(MissingProduct, missing_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Faltante no encontrado",
        )
    return record


def _assert_referenced_product_exists(product_id: int | None, db: Session) -> None:
    """Si se enlaza un producto, exige que exista; la relación sigue siendo opcional."""
    if product_id is None:
        return
    if db.get(Product, product_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El producto referenciado no existe.",
        )


def _raise_pending_conflict(product_id: int | None, db: Session) -> None:
    if product_id is not None:
        existing = db.scalar(
            select(MissingProduct).where(
                MissingProduct.product_id == product_id,
                MissingProduct.status == "pending",
            )
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        "Ya hay un faltante pendiente para ese producto."
                    ),
                    "existing": MissingProductResponse.model_validate(
                        existing
                    ).model_dump(mode="json"),
                },
            )


def _commit_missing_product(record: MissingProduct, db: Session) -> None:
    # Retener el destino antes de que rollback expire los atributos del ORM.
    product_id, pending = record.product_id, record.status == "pending"
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        original = error.orig
        constraint = getattr(getattr(original, "diag", None), "constraint_name", None)
        is_pending_conflict = (
            constraint == "uq_missing_products_pending_product"
            or (getattr(original, "sqlite_errorname", None) == "SQLITE_CONSTRAINT_UNIQUE"
                and str(original) == "UNIQUE constraint failed: missing_products.product_id")
        )
        if pending and is_pending_conflict:
            _raise_pending_conflict(product_id, db)
        raise


@router.get("", response_model=list[MissingProductResponse])
def list_missing_products(
    db: Session = Depends(get_db),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    status_filter: Annotated[
        str, Query(alias="status", pattern="^(all|pending|resolved)$")
    ] = "all",
    search: Annotated[str, Query(max_length=200)] = "",
) -> list[MissingProduct]:
    """Lista los faltantes con los pendientes primero y el resto por fecha reciente."""
    statement = select(MissingProduct)
    if status_filter in ("pending", "resolved"):
        statement = statement.where(MissingProduct.status == status_filter)

    normalized_search = " ".join(search.strip().split())
    if normalized_search:
        statement = statement.where(
            MissingProduct.name.ilike(_like_pattern(normalized_search), escape="\\")
        )

    pending_first = case((MissingProduct.status == "pending", 0), else_=1)
    statement = (
        statement.order_by(
            pending_first,
            MissingProduct.created_at.desc(),
            MissingProduct.id.desc(),
        )
        .offset(skip)
        .limit(limit)
    )
    return list(db.scalars(statement).all())


@router.post(
    "",
    response_model=MissingProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_missing_product(
    payload: MissingProductCreate,
    db: Session = Depends(get_db),
) -> MissingProduct:
    """Anota un faltante nuevo en estado ``pending``.

    Si ya hay un pendiente para el mismo ``product_id`` responde 409 con la
    anotación existente para que el operador la reutilice en vez de duplicar.
    """
    _assert_referenced_product_exists(payload.product_id, db)

    _raise_pending_conflict(payload.product_id, db)

    record = MissingProduct(
        name=payload.name,
        product_id=payload.product_id,
        quantity=payload.quantity,
        notes=payload.notes,
        status="pending",
    )
    db.add(record)
    _commit_missing_product(record, db)
    db.refresh(record)
    return record


@router.put("/{missing_id}", response_model=MissingProductResponse)
def update_missing_product(
    missing_id: int,
    payload: MissingProductUpdate,
    db: Session = Depends(get_db),
) -> MissingProduct:
    """Edita nombre, cantidad, nota, producto vinculado o estado de una anotación."""
    record = _get_or_404(missing_id, db)
    changes = payload.model_dump(exclude_unset=True)

    if "product_id" in changes:
        _assert_referenced_product_exists(changes["product_id"], db)

    if "status" in changes and changes["status"] != record.status:
        record.status = changes["status"]
        record.resolved_at = (
            datetime.now(timezone.utc)
            if changes["status"] == "resolved"
            else None
        )

    for field in ("name", "product_id", "quantity", "notes"):
        if field in changes:
            setattr(record, field, changes[field])

    _commit_missing_product(record, db)
    db.refresh(record)
    return record


@router.delete("/{missing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_missing_product(
    missing_id: int,
    db: Session = Depends(get_db),
) -> None:
    """Borra definitivamente una anotación de la lista operativa."""
    record = _get_or_404(missing_id, db)
    db.delete(record)
    db.commit()
