"""Generación puntual de ofertas PDF, sin cambios en productos ni lotes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.services.offer_ticket_pdf import build_offer_ticket_pdf

router = APIRouter(prefix="/offers", tags=["Offers"])


class OfferTicketRequest(BaseModel):
    """Datos transitorios para una tirada de tickets del producto guardado."""

    product_id: int = Field(gt=0, strict=True)
    promo_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    copies: int = Field(default=1, ge=1, le=1000, strict=True)


@router.post("/ticket", response_class=Response,
             responses={200: {"content": {"application/pdf": {}}}})
def generate_offer_ticket(payload: OfferTicketRequest, db: Session = Depends(get_db)) -> Response:
    """Lee el producto y devuelve un PDF descargable sin escrituras en la base."""
    product = db.get(Product, payload.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    try:
        content = build_offer_ticket_pdf(product, payload.promo_text, payload.copies)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return Response(content=content, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="oferta-{product.id}.pdf"',
    })
