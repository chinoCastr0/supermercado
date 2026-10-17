"""Borradores y confirmación de cierres; las filas bloqueadas evitan editar confirmados."""
from datetime import date as Date, datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app import permissions
from app.auth import AuthContext, require_permission, require_admin
from app.database import get_db
from app.models.cash_closure import CashClosure
from app.schemas.cash_closure import ClosureWrite, ClosureResponse
from app.api.sales import bounded, sales_total

router = APIRouter(prefix="/cash-closures", tags=["Cash closures"])

def get_closure(db, org, date, lock=False):
    query = select(CashClosure).where(CashClosure.organization_id == org, CashClosure.date == date)
    return db.scalar(query.with_for_update() if lock else query)

def response(record, db, org, date):
    system = record.sales_total if record and record.status == "confirmed" else sales_total(db, org, date)
    total = record.total if record else Decimal("0.00")
    return {"date": date, "amounts": record.amounts if record else {
        "cash": ["0.00", "0.00"], "transfers": ["0.00"], "posnet": ["0.00"], "orders": ["0.00"]},
        "total": total, "sales_total": system, "difference": total-system,
        "status": record.status if record else "draft",
        "confirmed_at": record.confirmed_at if record else None}

@router.get("/{date}", response_model=ClosureResponse)
def read_closure(date: Date, db: Session = Depends(get_db), ctx: AuthContext = Depends(require_permission(permissions.CLOSURES_MANAGE))):
    return response(get_closure(db, ctx.org_id, date), db, ctx.org_id, date)

@router.put("/{date}", response_model=ClosureResponse)
def save_closure(date: Date, payload: ClosureWrite, db: Session = Depends(get_db),
                 ctx: AuthContext = Depends(require_permission(permissions.CLOSURES_MANAGE))):
    record = get_closure(db, ctx.org_id, date, True)
    if record and record.status == "confirmed":
        raise HTTPException(409, "El cierre está confirmado. Un administrador debe reabrirlo.")
    amounts = payload.amounts.model_dump()
    total = bounded(sum((amount for group in amounts.values() for amount in group), Decimal("0.00")))
    system_total = sales_total(db, ctx.org_id, date)
    if record is None:
        record = CashClosure(organization_id=ctx.org_id, date=date, status="draft")
        db.add(record)
    record.amounts = {key: [format(value, ".2f") for value in values] for key, values in amounts.items()}
    record.total = total
    record.sales_total = system_total
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Otro usuario creó este cierre. Recargá antes de guardar.")
    return response(record, db, ctx.org_id, date)

@router.post("/{date}/confirm", response_model=ClosureResponse)
def confirm_closure(date: Date, db: Session = Depends(get_db), ctx: AuthContext = Depends(require_permission(permissions.CLOSURES_MANAGE))):
    record = get_closure(db, ctx.org_id, date, True)
    if record is None:
        raise HTTPException(404, "Guardá el borrador antes de confirmar.")
    if record.status != "confirmed":
        record.sales_total = sales_total(db, ctx.org_id, date)
        record.status = "confirmed"
        record.confirmed_at = datetime.now(timezone.utc)
        db.commit()
    return response(record, db, ctx.org_id, date)

@router.post("/{date}/reopen", response_model=ClosureResponse)
def reopen_closure(date: Date, db: Session = Depends(get_db), ctx: AuthContext = Depends(require_admin)):
    record = get_closure(db, ctx.org_id, date, True)
    if record is None:
        raise HTTPException(404, "Cierre no encontrado.")
    record.status = "draft"
    record.confirmed_at = None
    db.commit()
    return response(record, db, ctx.org_id, date)
