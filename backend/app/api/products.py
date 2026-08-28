"""Controladores HTTP de productos.

IMPORTANCIA: traduce requests HTTP en operaciones sobre el inventario.
PATRÓN / SOLID: es la capa Controller de una arquitectura por capas;
`Depends(get_db)` aplica Dependency Injection y el parser separado aplica SRP.
SOLUCIÓN ESPECÍFICA: rutas, códigos HTTP y política de actualización al importar.
Los bloques CRUD son implementación del supermercado, no patrones por sí mismos.
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import and_, or_, select
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
from app.services.label_state import mark_label_pending, visible_label_changed
from app.services.register_export import RegisterExportError, build_presur_file


router = APIRouter(
    prefix="/products",
    tags=["Products"],
)
IMPORT_QUERY_BATCH_SIZE = 500


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
    print_status: str = Query(default="all", pattern="^(all|pending|printed)$"),
) -> list[Product]:
    statement = select(Product)
    if print_status == "printed":
        statement = statement.where(
            and_(
                Product.printed_at.is_not(None),
                Product.printed_label_version == Product.label_version,
            )
        )
    elif print_status == "pending":
        statement = statement.where(
            or_(
                Product.printed_at.is_(None),
                Product.printed_label_version.is_(None),
                Product.printed_label_version != Product.label_version,
            )
        )
    statement = statement.order_by(Product.name).offset(skip).limit(limit)

    products = db.scalars(statement).all()

    return list(products)


@router.get(
    "/export/register",
    response_class=Response,
    responses={
        status.HTTP_200_OK: {
            "content": {"application/octet-stream": {}},
            "description": "Archivo PRESUR1.DAT listo para la caja registradora",
        }
    },
)
def export_register_products(db: Session = Depends(get_db)) -> Response:
    """Descarga todos los productos activos en el formato binario de la caja."""
    products = db.scalars(
        select(Product).where(Product.active.is_(True)).order_by(Product.id)
    ).all()

    try:
        content = build_presur_file(products)
    except RegisterExportError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="PRESUR1.DAT"'},
    )


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

    if visible_label_changed(product, update_data):
        mark_label_pending(product)

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

    skipped_barcodes: list[str] = []
    rows_by_barcode: dict[str, dict] = {}
    for row in rows:
        barcode = row["barcode"].strip()
        if not barcode:
            skipped_barcodes.append(row["name"])
            continue
        # Si el archivo repite un código, la última fila es la versión vigente.
        rows_by_barcode[barcode] = row

    existing_by_barcode: dict[str, Product] = {}
    barcodes = list(rows_by_barcode)
    for start in range(0, len(barcodes), IMPORT_QUERY_BATCH_SIZE):
        batch = barcodes[start : start + IMPORT_QUERY_BATCH_SIZE]
        products = db.scalars(
            select(Product).where(Product.barcode.in_(batch))
        ).all()
        existing_by_barcode.update(
            {product.barcode: product for product in products}
        )

    imported_count = 0
    updated_count = 0
    for barcode, row in rows_by_barcode.items():
        existing_product = existing_by_barcode.get(barcode)
        if existing_product is None:
            product = Product(**row)
            db.add(product)
            imported_count += 1
        else:
            updated_count += 1
            if visible_label_changed(existing_product, row):
                mark_label_pending(existing_product)
            existing_product.name = row["name"]
            existing_product.price = row["price"]
            if "weight" in row:
                existing_product.weight = row["weight"]
                existing_product.weight_unit = row["weight_unit"]
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
        "updated_count": updated_count,
        "skipped_barcodes": skipped_barcodes,
    }
