"""Operaciones HTTP de catálogo, precios, importación y exportación.

Las escrituras coordinan producto, historial y versión del cartel en una sesión.
Este módulo todavía mezcla transporte, consultas y reglas de negocio; extraer
casos de uso antes de agregar otros adaptadores que deban aplicar esas reglas."""

from decimal import Decimal, InvalidOperation
import re
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.price_change import ProductPriceChange
from app.models.product import Product
from app.schemas.product import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    BulkPriceUpdateRequest,
    BulkPriceUpdateResponse,
    ProductCreate,
    ProductPriceChangeResponse,
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
_PRESENTATION_SUFFIX = re.compile(
    r"(?<!\w)(?P<weight>\d+(?:[.,]\d+)?)\s*(?P<unit>kg|g|ml|l|u)?\s*$",
    re.IGNORECASE,
)


def _like_pattern(value: str, *, leading_wildcard: bool = True) -> str:
    """Escapa comodines del usuario para que LIKE busque texto literal."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"{'%' if leading_wildcard else ''}{escaped}%"


def _search_parts(search: str) -> tuple[list[str], Decimal | None, str | None]:
    """Separa términos del nombre y una presentación numérica al final."""
    normalized = " ".join(search.strip().lower().split())
    match = _PRESENTATION_SUFFIX.search(normalized)
    if not match:
        return normalized.split(), None, None
    try:
        weight = Decimal(match.group("weight").replace(",", "."))
    except InvalidOperation:
        return normalized.split(), None, None
    name = normalized[: match.start()].strip()
    return name.split(), weight, match.group("unit").lower() if match.group("unit") else None


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
) -> Product:
    """Inserta producto e historial inicial en una misma transacción."""
    product = Product(**product_data.model_dump())
    try:
        db.add(product)
        db.flush()
        db.add(
            ProductPriceChange(
                product_id=product.id,
                barcode=product.barcode,
                old_price=None,
                new_price=product.price,
                source="manual_create",
            )
        )
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
    active_status: Annotated[
        str, Query(pattern="^(all|active|inactive)$")
    ] = "all",
    search: Annotated[str, Query(max_length=200)] = "",
) -> list[Product]:
    """Filtra y ordena en SQL; devuelve una página limitada sin total global."""
    statement = select(Product)
    if active_status == "active":
        statement = statement.where(Product.active.is_(True))
    elif active_status == "inactive":
        statement = statement.where(Product.active.is_(False))
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
    normalized_search = " ".join(search.strip().lower().split())
    relevance = None
    if normalized_search:
        name_terms, weight, unit = _search_parts(normalized_search)
        barcode_match = Product.barcode.ilike(
            _like_pattern(normalized_search), escape="\\"
        )
        name_conditions = [
            Product.name.ilike(_like_pattern(term), escape="\\")
            for term in name_terms
        ]
        if weight is not None:
            presentation = [Product.weight == weight]
            if unit:
                presentation.append(func.lower(Product.weight_unit) == unit)
            structured = and_(*name_conditions, *presentation)
        else:
            structured = and_(*name_conditions)
        statement = statement.where(or_(barcode_match, structured))
        name_prefix = " ".join(name_terms)
        relevance = case(
            (Product.barcode == search.strip(), 0),
            (
                func.lower(Product.name).like(
                    _like_pattern(name_prefix, leading_wildcard=False),
                    escape="\\",
                ),
                1,
            ) if name_prefix else (barcode_match, 2),
            else_=2,
        )
    order = [Product.name, Product.id]
    if relevance is not None:
        order.insert(0, relevance)
    statement = statement.order_by(*order).offset(skip).limit(limit)

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
    "/by-barcode",
    response_model=ProductResponse,
)
def get_product_by_barcode(
    barcode: str = Query(min_length=1, max_length=50),
    db: Session = Depends(get_db),
) -> Product:
    """Busca un producto por el valor textual exacto de su código de barras."""
    product = db.scalar(
        select(Product).where(Product.barcode == barcode.strip())
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'No existe un producto con el código de barras "{barcode}".',
        )
    return product


@router.get(
    "/{product_id}",
    response_model=ProductResponse,
)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
) -> Product:
    """Obtiene la identidad interna o responde 404 si ya no existe."""
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    return product


@router.get(
    "/{product_id}/price-history",
    response_model=list[ProductPriceChangeResponse],
)
def get_product_price_history(
    product_id: int,
    db: Session = Depends(get_db),
) -> list[ProductPriceChange]:
    """Lista eventos incluso si el producto fue borrado; actualmente sin paginar."""
    return list(
        db.scalars(
            select(ProductPriceChange)
            .where(ProductPriceChange.product_id == product_id)
            .order_by(ProductPriceChange.id)
        ).all()
    )


@router.put(
    "/bulk-price",
    response_model=BulkPriceUpdateResponse,
)
def bulk_update_price(
    payload: BulkPriceUpdateRequest,
    db: Session = Depends(get_db),
) -> BulkPriceUpdateResponse:
    """Aplica un precio absoluto solo si todo el lote conserva su revision."""

    requested = {item.id: item for item in payload.products}
    products = db.scalars(
        select(Product)
        .where(Product.id.in_(requested))
        .order_by(Product.id)
        .with_for_update()
    ).all()
    by_id = {product.id: product for product in products}
    missing_ids = sorted(set(requested) - set(by_id))
    if missing_ids:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "message": "Hay productos seleccionados que ya no existen.",
                "missing_product_ids": missing_ids,
            },
        )

    conflicts = [
        {
            "id": product.id,
            "expected_revision": requested[product.id].expected_revision,
            "current_revision": product.revision,
        }
        for product in products
        if product.revision != requested[product.id].expected_revision
    ]
    if conflicts:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    "Uno o mas productos cambiaron. Recarga y revisa la "
                    "seleccion antes de volver a intentar."
                ),
                "conflicts": conflicts,
            },
        )

    changed_products = [
        product for product in products if product.price != payload.price
    ]
    for product in changed_products:
        old_price = product.price
        mark_label_pending(product)
        product.price = payload.price
        product.revision += 1
        db.add(
            ProductPriceChange(
                product_id=product.id,
                barcode=product.barcode,
                old_price=old_price,
                new_price=product.price,
                source="bulk_manual_update",
            )
        )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se pudo aplicar el lote; ningun precio fue modificado.",
        ) from None

    return BulkPriceUpdateResponse(
        updated_count=len(changed_products),
        unchanged_count=len(products) - len(changed_products),
    )


@router.delete(
    "/bulk",
    response_model=BulkDeleteResponse,
)
def bulk_delete_products(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
) -> BulkDeleteResponse:
    """Elimina la seleccion completa o no elimina ningun producto."""

    requested_ids = set(payload.product_ids)
    products = db.scalars(
        select(Product)
        .where(Product.id.in_(requested_ids))
        .order_by(Product.id)
        .with_for_update()
    ).all()
    found_ids = {product.id for product in products}
    missing_ids = sorted(requested_ids - found_ids)
    if missing_ids:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "message": "Hay productos seleccionados que ya no existen.",
                "missing_product_ids": missing_ids,
            },
        )

    for product in products:
        db.delete(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se pudo eliminar el lote; ningun producto fue eliminado.",
        ) from None

    return BulkDeleteResponse(deleted_count=len(products))


@router.put(
    "/{product_id}",
    response_model=ProductResponse,
)
def update_product(
    product_id: int,
    product_data: ProductUpdate,
    db: Session = Depends(get_db),
) -> Product:
    """Bloquea la fila, verifica revisión y audita cambios efectivos de precio."""
    product = db.scalar(
        select(Product).where(Product.id == product_id).with_for_update()
    )

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    update_data = product_data.model_dump(exclude_unset=True)
    expected_revision = update_data.pop("expected_revision")
    if product.revision != expected_revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "El producto cambió desde que se abrió. Recargá la lista "
                "y revisá el precio antes de volver a guardar."
            ),
        )

    changed_data = {
        field: value
        for field, value in update_data.items()
        if getattr(product, field) != value
    }
    if not changed_data:
        return product

    # El DTO sólo valida el peso y la unidad que llegaron juntos en esta
    # petición; una actualización parcial puede enviar uno solo y dejar el
    # producto con el otro campo desactualizado. Se valida el estado final
    # fusionado con lo persistido, no sólo lo enviado. Ver A03.
    if "weight" in changed_data or "weight_unit" in changed_data:
        final_weight = changed_data.get("weight", product.weight)
        final_weight_unit = changed_data.get("weight_unit", product.weight_unit)
        if (final_weight is None) != (final_weight_unit is None):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="El peso y su unidad deben informarse juntos.",
            )

    if visible_label_changed(product, changed_data):
        mark_label_pending(product)

    old_price = product.price
    for field, value in changed_data.items():
        setattr(product, field, value)
    product.revision += 1
    if "price" in changed_data:
        db.add(
            ProductPriceChange(
                product_id=product.id,
                barcode=product.barcode,
                old_price=old_price,
                new_price=product.price,
                source="manual_update",
            )
        )

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
    """Borra definitivamente el producto; no verifica la revisión del cliente."""
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
    """Deduplica por barcode y confirma todo junto; sólo aumenta precios existentes."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe adjuntar un archivo",
        )

    try:
        parsed = parse_excel_rows(file.file.read(), file.filename)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # Motivos legibles para filas que el archivo no pudo aportar; antes se
    # perdían en silencio y una importación podía "tener éxito" sin cargar
    # nada. Ver A02.
    invalid_rows: list[str] = [
        f"Fila {item.row_number}: {item.reason}" for item in parsed.skipped
    ]

    skipped_barcodes: list[str] = []
    rows_by_barcode: dict[str, dict] = {}
    for row in parsed.rows:
        barcode = row["barcode"].strip()
        if not barcode:
            skipped_barcodes.append(row["name"])
            continue
        # Si el archivo repite un código, la última fila es la versión vigente.
        rows_by_barcode[barcode] = row

    # Conserva los bloqueos de cada bloque hasta el commit del archivo completo.
    # El orden de adquisición aún depende del archivo/plan SQL; ver auditoría A07.
    existing_by_barcode: dict[str, Product] = {}
    barcodes = list(rows_by_barcode)
    for start in range(0, len(barcodes), IMPORT_QUERY_BATCH_SIZE):
        batch = barcodes[start : start + IMPORT_QUERY_BATCH_SIZE]
        products = db.scalars(
            select(Product)
            .where(Product.barcode.in_(batch))
            .with_for_update()
        ).all()
        existing_by_barcode.update(
            {product.barcode: product for product in products}
        )

    imported_count = 0
    updated_count = 0
    price_updated_count = 0
    preserved_price_barcodes: list[str] = []
    new_products: list[Product] = []
    for barcode, row in rows_by_barcode.items():
        existing_product = existing_by_barcode.get(barcode)
        if existing_product is None:
            # Un barcode nuevo persiste todos sus campos: debe cumplir las
            # mismas reglas que el alta manual (límites de caja, peso y
            # unidad) para no crear datos que luego bloqueen la exportación
            # o no puedan editarse con el mismo contenido. Ver A09.
            try:
                validated = ProductCreate(**row)
            except ValidationError as exc:
                invalid_rows.append(
                    f'Código "{barcode}": {exc.errors()[0]["msg"].removeprefix("Value error, ")}'
                )
                continue
            product = Product(
                **validated.model_dump(),
                last_updated=row["last_updated"],
            )
            db.add(product)
            new_products.append(product)
            imported_count += 1
        else:
            updated_count += 1
            # Para un barcode existente, la importacion solo puede aumentar el
            # precio. Nombre, estado, peso, unidad y fechas pertenecen al
            # registro existente y nunca se copian desde el archivo.
            if row["price"] <= existing_product.price:
                if row["price"] < existing_product.price:
                    preserved_price_barcodes.append(barcode)
                continue

            old_price = existing_product.price
            mark_label_pending(existing_product)
            existing_product.price = row["price"]
            existing_product.revision += 1
            price_updated_count += 1
            db.add(
                ProductPriceChange(
                    product_id=existing_product.id,
                    barcode=existing_product.barcode,
                    old_price=old_price,
                    new_price=existing_product.price,
                    source="import_update",
                )
            )

    try:
        db.flush()
        db.add_all(
            [
                ProductPriceChange(
                    product_id=product.id,
                    barcode=product.barcode,
                    old_price=None,
                    new_price=product.price,
                    source="import_create",
                )
                for product in new_products
            ]
        )
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
        "price_updated_count": price_updated_count,
        "preserved_price_barcodes": preserved_price_barcodes,
        "skipped_barcodes": skipped_barcodes,
        "invalid_rows": invalid_rows,
    }
