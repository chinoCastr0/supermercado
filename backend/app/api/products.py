"""Controladores HTTP de productos.

IMPORTANCIA: traduce requests HTTP en operaciones sobre el inventario.
PATRÓN / SOLID: es la capa Controller de una arquitectura por capas;
`Depends(get_db)` aplica Dependency Injection y el parser separado aplica SRP.
SOLUCIÓN ESPECÍFICA: rutas, códigos HTTP y política de actualización al importar.
Los bloques CRUD son implementación del supermercado, no patrones por sí mismos.
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.schemas.product import (
    ProductCreate,
    ProductResponse,
    ProductUpdate,
)
from app.services.excel_import import parse_excel_rows


router = APIRouter(
    prefix="/products",
    tags=["Products"],
)


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
) -> Product:
    product = Product(**product_data.model_dump())

    db.add(product)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un producto con ese código de barras",
        )

    db.refresh(product)

    return product


@router.get(
    "",
    response_model=list[ProductResponse],
)
def list_products(
    db: Session = Depends(get_db),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[Product]:
    statement = select(Product).order_by(Product.name).offset(skip).limit(limit)

    products = db.scalars(statement).all()

    return list(products)


@router.get(
    "/{product_id}",
    response_model=ProductResponse,
)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
) -> Product:
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    return product


@router.put(
    "/{product_id}",
    response_model=ProductResponse,
)
def update_product(
    product_id: int,
    product_data: ProductUpdate,
    db: Session = Depends(get_db),
) -> Product:
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    update_data = product_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(product, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe otro producto con ese código de barras",
        )

    db.refresh(product)

    return product


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
) -> None:
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    db.delete(product)
    db.commit()


@router.post(
    "/import",
    status_code=status.HTTP_200_OK,
)
def import_products(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, int | list[str]]:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe adjuntar un archivo",
        )

    try:
        rows = parse_excel_rows(file.file.read(), file.filename)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    imported_count = 0
    skipped_barcodes: list[str] = []

    for row in rows:
        barcode = row["barcode"].strip()
        if not barcode:
            skipped_barcodes.append(row["name"])
            continue

        existing_product = db.scalar(
            select(Product).where(Product.barcode == barcode)
        )

        if existing_product is None:
            product = Product(**row)
            db.add(product)
            imported_count += 1
        else:
            existing_product.name = row["name"]
            existing_product.price = row["price"]
            existing_product.active = row["active"]
            existing_product.last_updated = row["last_updated"]

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Hubo un conflicto al importar los productos",
        ) from None

    return {
        "imported_count": imported_count,
        "skipped_barcodes": skipped_barcodes,
    }
