"""Ventas y cierres: dinero exacto, reintentos, permisos y aislamiento real HTTP."""
from datetime import date
from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
import app.models
from app import permissions
from app.auth import AuthContext, get_auth_context
from app.database import Base, get_db
from app.api.sales import router as sales_router
from app.api.cash_closures import router as closures_router
from app.models.product import Product
from app.models.sale import Sale

@pytest.fixture
def api():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = Session(engine)
    app = FastAPI()
    app.include_router(sales_router)
    app.include_router(closures_router)
    identity = {"ctx": AuthContext("cashier", "org_a", "org:admin", permissions.ALL)}
    app.dependency_overrides[get_auth_context] = lambda: identity["ctx"]
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        yield client, db, identity
    db.close()
    engine.dispose()

def payload(**changes):
    result = {"client_id": str(uuid4()), "items": [{"kind": "manual", "name": "Pan", "price": "0.10", "quantity": 3}]}
    result.update(changes)
    return result

def amounts(value="0.00"):
    return {"amounts": {"cash": [value, "0.00"], "transfers": ["0.00"], "posnet": ["0.00"], "orders": ["0.00"]}}

def test_admin_can_use_cash_without_new_clerk_permissions(api):
    from app.api.members import my_permissions
    client, _, identity = api
    ctx = AuthContext("admin", "org_a", "org:admin", frozenset())
    identity["ctx"] = ctx
    assert set(my_permissions(ctx).permissions) == permissions.ADMIN_EXTRA
    assert ctx.has(permissions.PRODUCTS_MANAGE)
    sale = client.post("/sales", json=payload())
    assert sale.status_code == 201, sale.text
    assert client.get("/sales").status_code == 200
    path = "/cash-closures/" + sale.json()["date"]
    assert client.put(path, json=amounts("0.30")).status_code == 200
    assert client.post(path + "/confirm").status_code == 200

@pytest.mark.parametrize("role", ["org:member", "org:encargado"])
def test_other_roles_do_not_inherit_admin_cash_permissions(role):
    ctx = AuthContext("user", "org_a", role, frozenset())
    assert ctx.has(permissions.SALES_CREATE)
    assert ctx.has(permissions.SALES_READ) == (role == "org:encargado")
    assert ctx.has(permissions.CLOSURES_MANAGE) == (role == "org:encargado")
    assert not ctx.has("org:sys_memberships:manage")

def test_idempotency_and_recalculation(api):
    client, db, _ = api
    body = payload(total="999.00", paid="1.00")
    one = client.post("/sales", json=body)
    assert one.status_code == 201, one.text
    two = client.post("/sales", json=body)
    assert two.json()["id"] == one.json()["id"]
    assert one.json()["total"] == "0.30"
    assert one.json()["change"] == "0.70"
    assert len(db.scalars(select(Sale)).all()) == 1

def test_product_snapshot_and_price_sent(api):
    client, db, _ = api
    product = Product(organization_id="org_a", barcode="123", name="Original", price=Decimal("5.00"))
    db.add(product); db.commit()
    response = client.post("/sales", json=payload(items=[{"kind": "product", "product_id": product.id, "price": "2.00", "quantity": 2}]))
    assert response.status_code == 201, response.text
    assert response.json()["total"] == "4.00"
    product.name = "Nuevo"; db.commit()
    listed = client.get("/sales").json()
    assert listed["sales"][0]["items"][0]["name"] == "Original"
    assert product.price == Decimal("5.00")

def test_organization_isolation_and_scoped_idempotency(api):
    client, db, identity = api
    body = payload()
    one = client.post("/sales", json=body).json()
    product = Product(organization_id="org_a", barcode="123", name="Privado", price=Decimal("1.00"))
    db.add(product); db.commit()
    identity["ctx"] = AuthContext("other", "org_b", "org:admin", permissions.ALL)
    assert client.get("/sales").json()["sales"] == []
    assert client.post("/sales", json=payload(items=[{"kind": "product", "product_id": product.id, "price": "1.00", "quantity": 1}])).status_code == 422
    assert client.post("/sales", json=body).json()["id"] != one["id"]

@pytest.mark.parametrize("path,method,body", [
    ("/sales", "post", payload()), ("/sales", "get", None),
    ("/cash-closures/2026-10-17", "get", None),
    ("/cash-closures/2026-10-17", "put", amounts()),
    ("/cash-closures/2026-10-17/confirm", "post", None),
    ("/cash-closures/2026-10-17/reopen", "post", None),
])
def test_permissions_403(api, path, method, body):
    client, _, identity = api
    identity["ctx"] = AuthContext("viewer", "org_a", "org:viewer", frozenset())
    kwargs = {"json": body} if body is not None else {}
    assert getattr(client, method)(path, **kwargs).status_code == 403

def test_closure_snapshot_lock_reopen_and_isolation(api):
    client, _, identity = api
    sale = client.post("/sales", json=payload()).json()
    path = "/cash-closures/" + sale["date"]
    assert client.put(path, json=amounts("0.20")).status_code == 200
    confirmed = client.post(path + "/confirm").json()
    assert confirmed["difference"] == "-0.10"
    assert confirmed["sales_total"] == "0.30"
    assert client.put(path, json=amounts("0.40")).status_code == 409
    client.post("/sales", json=payload())
    assert client.get(path).json()["sales_total"] == "0.30"
    identity["ctx"] = AuthContext("boss", "org_a", "org:encargado", permissions.ALL)
    assert client.post(path + "/reopen").status_code == 403
    identity["ctx"] = AuthContext("admin", "org_a", "org:admin", permissions.ALL)
    assert client.post(path + "/reopen").status_code == 200
    assert client.put(path, json=amounts("0.80")).json()["difference"] == "0.20"
    identity["ctx"] = AuthContext("admin", "org_b", "org:admin", permissions.ALL)
    assert client.get(path).json()["total"] == "0.00"
    assert client.post(path + "/confirm").status_code == 404

@pytest.mark.parametrize("bad", [0.1, "-1.00", "NaN", "1.001", "10000000000.00"])
def test_invalid_money(api, bad):
    client, _, _ = api
    assert client.post("/sales", json=payload(items=[{"kind": "manual", "price": bad, "quantity": 1}])).status_code == 422

def test_insufficient_payment_and_overflow(api):
    client, _, _ = api
    assert client.post("/sales", json=payload(paid="0.10")).status_code == 422
    assert client.post("/sales", json=payload(items=[{"kind": "manual", "price": "9999999999.99", "quantity": 2}])).status_code == 422

def test_date_timezone_and_empty_history(api, monkeypatch):
    from app.api import sales
    class Clock:
        @staticmethod
        def now(zone):
            from datetime import datetime, timezone
            return datetime(2026, 10, 18, 1, 0, tzinfo=timezone.utc).astimezone(zone)
    monkeypatch.setattr(sales, "datetime", Clock)
    client, _, _ = api
    assert client.post("/sales", json=payload()).json()["date"] == "2026-10-17"
    assert client.get("/sales?date=2026-10-16").json()["sales"] == []

def test_member_sells_but_cannot_read_history_or_close(api):
    client, _, identity = api
    identity["ctx"] = AuthContext("employee", "org_new", "org:member", frozenset())
    sale = client.post("/sales", json=payload())
    assert sale.status_code == 201, sale.text
    assert client.get("/sales").status_code == 403
    path = "/cash-closures/" + sale.json()["date"]
    assert client.get(path).status_code == 403
    assert client.put(path, json=amounts()).status_code == 403
    assert client.post(path + "/confirm").status_code == 403

def test_local_encargado_sells_reads_and_closes(api):
    from app.auth import apply_local_role
    from app.models.member_role import MemberRole
    client, db, identity = api
    db.add(MemberRole(organization_id="org_new", user_id="boss", role="org:encargado", updated_by="admin"))
    db.commit()
    identity["ctx"] = apply_local_role(AuthContext("boss", "org_new", "org:member", frozenset()), db)
    sale = client.post("/sales", json=payload())
    assert sale.status_code == 201, sale.text
    assert client.get("/sales").status_code == 200
    path = "/cash-closures/" + sale.json()["date"]
    assert client.put(path, json=amounts("0.30")).status_code == 200
    assert client.post(path + "/confirm").status_code == 200
    assert client.post(path + "/reopen").status_code == 403
