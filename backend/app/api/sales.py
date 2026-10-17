"""Registro atómico e idempotente y consulta diaria de ventas."""
from datetime import date as Date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app import permissions
from app.auth import AuthContext, require_permission
from app.database import get_db
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.schemas.sale import SaleCreate, SaleResponse, SalesResponse
from app.tenancy import get_owned

router = APIRouter(prefix="/sales", tags=["Sales"])
ZONE = ZoneInfo("America/Argentina/Buenos_Aires")
MAX_AMOUNT = Decimal("9999999999.99")

def today():
    return datetime.now(ZONE).date()

def bounded(value: Decimal):
    if value > MAX_AMOUNT:
        raise HTTPException(422, "El total excede el máximo permitido.")
    return value

def day_sales(db: Session, org: str, date: Date):
    return list(db.scalars(select(Sale).where(Sale.organization_id == org, Sale.date == date).order_by(Sale.created_at.desc(), Sale.id.desc())).all())

def sales_total(db: Session, org: str, date: Date):
    return bounded(sum((sale.total for sale in day_sales(db, org, date)), Decimal("0.00")))

@router.post("", response_model=SaleResponse, status_code=201)
def create_sale(payload: SaleCreate, db: Session = Depends(get_db), ctx: AuthContext = Depends(require_permission(permissions.SALES_CREATE))):
    client_id = str(payload.client_id)
    query = select(Sale).where(Sale.organization_id == ctx.org_id, Sale.client_id == client_id)
    existing = db.scalar(query)
    if existing is not None:
        return existing
    items = []
    for line in payload.items:
        product = None
        if line.kind == "product":
            product = get_owned(db, Product, line.product_id, ctx.org_id)
            if product is None:
                raise HTTPException(422, "El producto referenciado no existe.")
        items.append(SaleItem(
            organization_id=ctx.org_id, kind=line.kind,
            product_id=product.id if product else None,
            name=product.name if product else (line.name.strip() or "Producto manual"),
            barcode=product.barcode if product else "",
            price=line.price, quantity=line.quantity, subtotal=bounded(line.price * line.quantity),
        ))
    total = bounded(sum((item.subtotal for item in items), Decimal("0.00")))
    paid = payload.paid if payload.paid is not None else total
    if paid < total:
        raise HTTPException(422, "El pago no alcanza.")
    sale = Sale(organization_id=ctx.org_id, client_id=client_id, cashier=ctx.user_id,
                date=today(), total=total, paid=paid, change=paid-total, items=items)
    db.add(sale)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(query)
        if existing is not None:
            return existing
        raise
    db.refresh(sale)
    return sale

@router.get("", response_model=SalesResponse)
def list_sales(date: Date | None = Query(default=None), db: Session = Depends(get_db),
               ctx: AuthContext = Depends(require_permission(permissions.SALES_READ))):
    selected = date or today()
    sales = day_sales(db, ctx.org_id, selected)
    return {"date": selected, "total": sum((sale.total for sale in sales), Decimal("0.00")), "sales": sales}
