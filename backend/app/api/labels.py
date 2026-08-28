"""Endpoints transaccionales para generación y confirmación de carteles."""

from datetime import datetime, timezone
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.print_batch import PrintBatch, PrintBatchItem
from app.models.product import Product
from app.schemas.product import (
    BatchConfirmationResponse,
    LabelGenerationRequest,
    PrintStatusResponse,
    ProductPrintStatusUpdate,
)
from app.services.label_pdf import build_labels_pdf


router = APIRouter(prefix="/labels", tags=["Labels"])


def _products_in_requested_order(
    db: Session,
    product_ids: list[int],
) -> list[Product]:
    unique_ids = list(dict.fromkeys(product_ids))
    products = db.scalars(select(Product).where(Product.id.in_(unique_ids))).all()
    by_id = {product.id: product for product in products}
    missing = [product_id for product_id in unique_ids if product_id not in by_id]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existen los productos: {', '.join(map(str, missing))}",
        )
    return [by_id[product_id] for product_id in unique_ids]


@router.get("/pending-count")
def pending_count(db: Session = Depends(get_db)) -> dict[str, int]:
    count = db.scalar(
        select(func.count(Product.id)).where(
            or_(
                Product.printed_at.is_(None),
                Product.printed_label_version.is_(None),
                Product.printed_label_version != Product.label_version,
            )
        )
    )
    return {"pending_count": int(count or 0)}


@router.put("/status", response_model=PrintStatusResponse)
def set_print_status(
    payload: ProductPrintStatusUpdate,
    db: Session = Depends(get_db),
) -> PrintStatusResponse:
    products = _products_in_requested_order(db, payload.product_ids)
    now = datetime.now(timezone.utc)
    for product in products:
        if payload.printed:
            product.printed_label_version = product.label_version
            product.printed_at = now
        else:
            product.printed_label_version = None
            product.printed_at = None
    db.commit()
    return PrintStatusResponse(updated_count=len(products))


@router.post(
    "/generate",
    response_class=Response,
    responses={status.HTTP_200_OK: {"content": {"application/pdf": {}}}},
)
def generate_labels(
    payload: LabelGenerationRequest,
    db: Session = Depends(get_db),
) -> Response:
    products = _products_in_requested_order(db, payload.product_ids)
    pdf_result = build_labels_pdf(products)
    if not pdf_result.generated_product_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Ningún producto tiene un código de barras representable.",
        )

    batch = PrintBatch(id=str(uuid4()), status="generated")
    db.add(batch)
    by_id = {product.id: product for product in products}
    for product_id in pdf_result.generated_product_ids:
        db.add(
            PrintBatchItem(
                batch_id=batch.id,
                product_id=product_id,
                label_version=by_id[product_id].label_version,
            )
        )
    db.commit()

    skipped_ids = [warning.product_id for warning in pdf_result.warnings]
    warnings = [
        {
            "product_id": warning.product_id,
            "name": warning.product_name,
            "reason": warning.reason,
        }
        for warning in pdf_result.warnings
    ]
    timestamp = datetime.now().strftime("%Y%m%d-%H%M")
    return Response(
        content=pdf_result.content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'inline; filename="carteles-precios-{timestamp}.pdf"'
            ),
            "X-Print-Batch-Id": batch.id,
            "X-Print-Product-Count": str(len(pdf_result.generated_product_ids)),
            "X-Print-Skipped-Ids": ",".join(map(str, skipped_ids)),
            "X-Print-Warnings": json.dumps(warnings, ensure_ascii=True),
        },
    )


@router.post(
    "/batches/{batch_id}/confirm",
    response_model=BatchConfirmationResponse,
)
def confirm_batch(
    batch_id: str,
    db: Session = Depends(get_db),
) -> BatchConfirmationResponse:
    batch = db.get(PrintBatch, batch_id)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lote de impresión no encontrado.",
        )

    items = db.scalars(
        select(PrintBatchItem).where(PrintBatchItem.batch_id == batch_id)
    ).all()
    products = db.scalars(
        select(Product).where(Product.id.in_([item.product_id for item in items]))
    ).all()
    by_id = {product.id: product for product in products}
    stale_ids: list[int] = []
    missing_ids: list[int] = []
    marked_count = 0
    now = datetime.now(timezone.utc)

    for item in items:
        product = by_id.get(item.product_id)
        if product is None:
            missing_ids.append(item.product_id)
        elif product.label_version != item.label_version:
            stale_ids.append(item.product_id)
        else:
            product.printed_label_version = item.label_version
            product.printed_at = now
            marked_count += 1

    batch.confirmed_at = now
    batch.status = "confirmed" if not stale_ids and not missing_ids else "partial"
    db.commit()
    return BatchConfirmationResponse(
        batch_id=batch_id,
        marked_count=marked_count,
        stale_product_ids=stale_ids,
        missing_product_ids=missing_ids,
    )
