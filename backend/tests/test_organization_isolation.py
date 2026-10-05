"""Aislamiento entre organizaciones y permisos por endpoint.

La org A nunca ve, edita, imprime, exporta ni borra datos de la org B: un id de
otra organización responde 404, igual que uno inexistente. Los permisos se
prueban por HTTP (TestClient) con el contexto de Clerk reemplazado, porque son
dependencias de FastAPI; el aislamiento se prueba llamando las rutas directo."""

from decimal import Decimal
from io import BytesIO

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app import permissions
from app.api.labels import (
    confirm_batch,
    generate_labels,
    pending_count,
    reprint_batch_pdf,
    router as labels_router,
    set_print_status,
)
from app.api.missing_products import (
    create_missing_product,
    delete_missing_product,
    list_missing_products,
    router as missing_router,
    update_missing_product,
)
from app.api.offers import OfferTicketRequest, generate_offer_ticket, router as offers_router
from app.api.products import (
    bulk_delete_products,
    bulk_update_price,
    create_product,
    delete_product,
    export_register_products,
    get_product,
    get_product_by_barcode,
    get_product_price_history,
    import_products,
    list_products,
    router as products_router,
    update_product,
)
from app.auth import get_auth_context
from app.database import Base, get_db
from app.models.price_change import ProductPriceChange
from app.models.product import Product
from app.schemas.missing_product import MissingProductCreate, MissingProductUpdate
from app.schemas.product import (
    BulkDeleteRequest,
    BulkPriceUpdateRequest,
    LabelGenerationRequest,
    ProductCreate,
    ProductPrintStatusUpdate,
    ProductUpdate,
)
from org_context import ADMIN_A, ADMIN_B, MEMBER_A, ORG_A, ORG_B, ctx_for

BARCODE = "7790001000017"


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


def _product(db: Session, ctx, barcode: str = BARCODE, price: str = "1000") -> Product:
    return create_product(
        ProductCreate(barcode=barcode, name=f"Producto {ctx.org_id}", price=price),
        db,
        ctx,
    )


def _assert_404(call) -> None:
    with pytest.raises(HTTPException) as error:
        call()
    assert error.value.status_code == 404


@pytest.fixture
def db():
    with Session(_engine()) as session:
        yield session


@pytest.fixture
def b_product(db):
    """Producto de B con un lote impreso, para intentar alcanzarlo desde A."""
    return _product(db, ADMIN_B)


def test_same_barcode_is_allowed_in_two_organizations(db):
    a = _product(db, ADMIN_A, price="100")
    b = _product(db, ADMIN_B, price="200")
    assert a.id != b.id
    assert get_product_by_barcode(BARCODE, db, ADMIN_A).id == a.id
    assert get_product_by_barcode(BARCODE, db, ADMIN_B).id == b.id
    with pytest.raises(HTTPException) as duplicate:
        _product(db, ADMIN_A)
    assert duplicate.value.status_code == 409


def test_reads_never_include_other_organization(db, b_product):
    a = _product(db, ADMIN_A, barcode="A-1")
    assert [p.id for p in list_products(db, ADMIN_A, skip=0, limit=500,
                                        print_status="all", search="")] == [a.id]
    assert list_products(db, ADMIN_A, skip=0, limit=500, print_status="all",
                         search=BARCODE) == []
    _assert_404(lambda: get_product(b_product.id, db, ADMIN_A))
    _assert_404(lambda: get_product_by_barcode(BARCODE, db, ADMIN_A))
    assert get_product_price_history(b_product.id, db, ADMIN_A) == []
    assert pending_count(db, ADMIN_A) == {"pending_count": 1}


def test_writes_on_other_organization_respond_404_and_change_nothing(db, b_product):
    _assert_404(lambda: update_product(
        b_product.id,
        ProductUpdate(expected_revision=b_product.revision, price=Decimal("1")),
        db, ADMIN_A,
    ))
    _assert_404(lambda: delete_product(b_product.id, db, ADMIN_A))
    _assert_404(lambda: bulk_update_price(
        BulkPriceUpdateRequest(
            products=[{"id": b_product.id, "expected_revision": b_product.revision}],
            price=Decimal("1"),
        ),
        db, ADMIN_A,
    ))
    _assert_404(lambda: bulk_delete_products(
        BulkDeleteRequest(product_ids=[b_product.id]), db, ADMIN_A
    ))
    db.expire_all()
    stored = db.get(Product, b_product.id)
    assert stored.price == Decimal("1000.00")
    assert stored.revision == 1


def test_labels_and_offers_cannot_reach_other_organization(db, b_product):
    request = LabelGenerationRequest(product_ids=[b_product.id])
    _assert_404(lambda: generate_labels(request, db, ADMIN_A))
    _assert_404(lambda: set_print_status(
        ProductPrintStatusUpdate(product_ids=[b_product.id], printed=True), db, ADMIN_A
    ))
    _assert_404(lambda: generate_offer_ticket(
        OfferTicketRequest(product_id=b_product.id, promo_text="2x1"), db, ADMIN_A
    ))

    batch_id = generate_labels(request, db, ADMIN_B).headers["X-Print-Batch-Id"]
    _assert_404(lambda: reprint_batch_pdf(batch_id, db, ADMIN_A))
    _assert_404(lambda: confirm_batch(batch_id, db, ADMIN_A))
    assert reprint_batch_pdf(batch_id, db, ADMIN_B).body.startswith(b"%PDF")


def test_register_export_only_contains_own_products(db, b_product):
    _product(db, ADMIN_A, barcode="A-ONLY")
    content = export_register_products(db, ADMIN_A).body
    assert b"A-ONLY" in content
    assert BARCODE.encode() not in content


def test_import_matches_barcodes_only_inside_the_organization(db, b_product):
    csv = f"codigo,descripcion,precio\n{BARCODE},Importado A,5000\n".encode()
    result = import_products(
        UploadFile(filename="precios.csv", file=BytesIO(csv)), db, ADMIN_A
    )
    assert result["imported_count"] == 1
    assert result["price_updated_count"] == 0
    db.expire_all()
    assert db.get(Product, b_product.id).price == Decimal("1000.00")
    assert get_product_by_barcode(BARCODE, db, ADMIN_A).price == Decimal("5000.00")


def test_missing_products_are_isolated(db, b_product):
    b_record = create_missing_product(
        MissingProductCreate(name="Faltante B", product_id=b_product.id), db, ADMIN_B
    )
    a_record = create_missing_product(MissingProductCreate(name="Faltante A"), db, ADMIN_A)
    assert [r.id for r in list_missing_products(
        db, ADMIN_A, skip=0, limit=200, status_filter="all", search=""
    )] == [a_record.id]
    _assert_404(lambda: update_missing_product(
        b_record.id, MissingProductUpdate(status="resolved"), db, ADMIN_A
    ))
    _assert_404(lambda: delete_missing_product(b_record.id, db, ADMIN_A))
    with pytest.raises(HTTPException) as foreign_link:
        create_missing_product(
            MissingProductCreate(name="Ajeno", product_id=b_product.id), db, ADMIN_A
        )
    assert foreign_link.value.status_code == 422


def test_price_changes_record_organization_and_actor(db):
    product = _product(db, ADMIN_A)
    update_product(
        product.id,
        ProductUpdate(expected_revision=product.revision, price=Decimal("1500")),
        db, ctx_for(ORG_A, user_id="user_encargado"),
    )
    history = db.scalars(select(ProductPriceChange).order_by(ProductPriceChange.id)).all()
    assert [(h.organization_id, h.changed_by, h.source) for h in history] == [
        (ORG_A, "user_admin", "manual_create"),
        (ORG_A, "user_encargado", "manual_update"),
    ]


# --- Permisos por HTTP -------------------------------------------------------

def _client(engine, ctx) -> TestClient:
    api = FastAPI()
    for router in (products_router, labels_router, offers_router, missing_router):
        api.include_router(router, dependencies=[])
    factory = sessionmaker(bind=engine)

    def override_db():
        with factory() as session:
            yield session

    api.dependency_overrides[get_db] = override_db
    api.dependency_overrides[get_auth_context] = lambda: ctx
    return TestClient(api)


@pytest.fixture
def seeded():
    engine = _engine()
    with Session(engine) as session:
        product = _product(session, ADMIN_A)
        return engine, product.id, product.revision


def test_member_can_read_print_and_manage_missing(seeded):
    engine, product_id, _ = seeded
    with _client(engine, MEMBER_A) as client:
        assert client.get("/products").status_code == 200
        assert client.get(f"/products/{product_id}/price-history").status_code == 200
        assert client.post("/labels/generate",
                           json={"product_ids": [product_id]}).status_code == 200
        assert client.post("/missing-products",
                           json={"name": "Yerba"}).status_code == 201


@pytest.mark.parametrize("method,path,body", [
    ("put", "/products/bulk-price", "bulk_price"),
    ("put", "/products/{id}", "price"),
    ("put", "/products/{id}", "name"),
    ("delete", "/products/{id}", None),
    ("delete", "/products/bulk", "bulk_delete"),
    ("post", "/products", "create"),
    ("get", "/products/export/register", None),
])
def test_member_gets_403_without_permission(seeded, method, path, body):
    engine, product_id, revision = seeded
    payloads = {
        "bulk_price": {"products": [{"id": product_id, "expected_revision": revision}],
                       "price": "1"},
        "price": {"expected_revision": revision, "price": "1"},
        "name": {"expected_revision": revision, "name": "Otro"},
        "bulk_delete": {"product_ids": [product_id]},
        "create": {"barcode": "NEW", "name": "Nuevo", "price": "10"},
    }
    with _client(engine, MEMBER_A) as client:
        response = client.request(method.upper(), path.format(id=product_id),
                                  json=payloads.get(body))
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "permission_denied"
    with Session(engine) as session:
        assert session.scalar(select(func.count(Product.id))) == 1
        assert session.get(Product, product_id).price == Decimal("1000.00")


def test_member_cannot_import(seeded):
    engine, _, _ = seeded
    with _client(engine, MEMBER_A) as client:
        response = client.post(
            "/products/import",
            files={"file": ("p.csv", b"codigo,descripcion,precio\nX,Y,1\n", "text/csv")},
        )
    assert response.status_code == 403


def test_import_price_increase_requires_prices_edit_and_is_all_or_nothing(seeded):
    engine, _, _ = seeded
    catalog_only = ctx_for(ORG_A, permissions.ALL - {permissions.PRICES_EDIT})
    csv = f"codigo,descripcion,precio\n{BARCODE},Sube,9000\nNUEVO-1,Nuevo,10\n".encode()
    with _client(engine, catalog_only) as client:
        response = client.post("/products/import",
                               files={"file": ("p.csv", csv, "text/csv")})
    assert response.status_code == 403
    with Session(engine) as session:
        assert session.scalar(select(func.count(Product.id))) == 1
        assert session.scalar(select(Product.price)) == Decimal("1000.00")


def test_other_organization_ids_return_404_over_http(seeded):
    engine, product_id, _ = seeded
    with _client(engine, ADMIN_B) as client:
        assert client.get(f"/products/{product_id}").status_code == 404
        assert client.delete(f"/products/{product_id}").status_code == 404
        assert client.post("/offers/ticket", json={
            "product_id": product_id, "promo_text": "2x1"}).status_code == 404
        assert client.get("/products").json() == []
