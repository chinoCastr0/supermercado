"""Lista de faltantes: CRUD, orden, duplicados y aislamiento del catálogo.

Usa SQLite en memoria y llama a las funciones de ruta directamente, igual que
el resto de la suite. El foco está en que ninguna operación de faltantes toque
``products`` ni el historial de precios.
"""
from datetime import datetime

from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

import app.models
from app.api.missing_products import (
    create_missing_product,
    delete_missing_product,
    list_missing_products,
    update_missing_product,
)
from app.api.products import create_product
from app.database import Base
from app.models.missing_product import MissingProduct
from app.models.price_change import ProductPriceChange
from app.models.product import Product
from app.schemas.missing_product import (
    MissingProductCreate,
    MissingProductUpdate,
)
from app.schemas.product import ProductCreate


def _engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine


def _product(db: Session, barcode: str = "MISS-REF", price: str = "1234.56") -> Product:
    return create_product(
        ProductCreate(barcode=barcode, name="Producto ref", price=price),
        db,
    )


def _create(db: Session, **overrides) -> MissingProduct:
    payload = {"name": "COCA COLA 2.25L"}
    payload.update(overrides)
    return create_missing_product(MissingProductCreate(**payload), db)


def _list(db: Session, *, status_filter: str = "all", search: str = ""):
    return list_missing_products(
        db, skip=0, limit=200, status_filter=status_filter, search=search
    )


def test_create_missing_product_defaults_to_pending() -> None:
    engine = _engine()
    with Session(engine) as db:
        record = _create(
            db,
            quantity="3 bultos",
            notes="comprar si está menos de $X",
        )

        assert record.id is not None
        assert record.status == "pending"
        assert record.resolved_at is None
        assert record.quantity == "3 bultos"
        assert record.notes == "comprar si está menos de $X"
        assert isinstance(record.created_at, datetime)


def test_create_without_product_id_is_allowed() -> None:
    engine = _engine()
    with Session(engine) as db:
        record = _create(db, name="GALLETITAS SONRISA", quantity="media caja")

        assert record.product_id is None
        assert record.quantity == "media caja"


def test_quantity_keeps_free_text_and_blanks_become_null() -> None:
    engine = _engine()
    with Session(engine) as db:
        text_quantity = _create(db, name="Fideos", quantity="15 unidades")
        blank_quantity = _create(db, name="Arroz", quantity="   ")

        assert text_quantity.quantity == "15 unidades"
        assert blank_quantity.quantity is None


def test_list_orders_pending_before_resolved_then_by_recent() -> None:
    engine = _engine()
    with Session(engine) as db:
        first = _create(db, name="Primero")
        second = _create(db, name="Segundo")
        resolved = _create(db, name="Resuelto")
        update_missing_product(
            resolved.id, MissingProductUpdate(status="resolved"), db
        )

        listed = _list(db)

        assert [item.name for item in listed] == ["Segundo", "Primero", "Resuelto"]
        assert first.id and second.id  # identidades intactas


def test_list_filters_by_status_and_name() -> None:
    engine = _engine()
    with Session(engine) as db:
        _create(db, name="COCA COLA 2.25L")
        _create(db, name="Agua saborizada")
        resolved = _create(db, name="COCA COLA lata")
        update_missing_product(
            resolved.id, MissingProductUpdate(status="resolved"), db
        )

        only_pending = _list(db, status_filter="pending")
        by_name = _list(db, search="coca")
        resolved_only = _list(db, status_filter="resolved")

        assert {item.name for item in only_pending} == {
            "COCA COLA 2.25L",
            "Agua saborizada",
        }
        assert {item.name for item in by_name} == {
            "COCA COLA 2.25L",
            "COCA COLA lata",
        }
        assert [item.name for item in resolved_only] == ["COCA COLA lata"]


def test_edit_quantity_and_notes() -> None:
    engine = _engine()
    with Session(engine) as db:
        record = _create(db, quantity="1 bulto", notes="vieja nota")

        updated = update_missing_product(
            record.id,
            MissingProductUpdate(quantity="4 bultos", notes="nota nueva"),
            db,
        )

        assert updated.quantity == "4 bultos"
        assert updated.notes == "nota nueva"
        assert updated.status == "pending"
        assert updated.name == "COCA COLA 2.25L"


def test_notes_can_be_cleared_with_explicit_null() -> None:
    engine = _engine()
    with Session(engine) as db:
        record = _create(db, notes="algo")

        updated = update_missing_product(
            record.id, MissingProductUpdate(notes=None), db
        )

        assert updated.notes is None


def test_mark_resolved_then_reopen_toggles_timestamp() -> None:
    engine = _engine()
    with Session(engine) as db:
        record = _create(db)

        resolved = update_missing_product(
            record.id, MissingProductUpdate(status="resolved"), db
        )
        assert resolved.status == "resolved"
        assert isinstance(resolved.resolved_at, datetime)

        reopened = update_missing_product(
            record.id, MissingProductUpdate(status="pending"), db
        )
        assert reopened.status == "pending"
        assert reopened.resolved_at is None


def test_delete_missing_product() -> None:
    engine = _engine()
    with Session(engine) as db:
        record = _create(db)

        delete_missing_product(record.id, db)

        assert db.get(MissingProduct, record.id) is None
        with pytest.raises(HTTPException) as missing:
            delete_missing_product(record.id, db)
        assert missing.value.status_code == 404


def test_update_missing_id_returns_404() -> None:
    engine = _engine()
    with Session(engine) as db:
        with pytest.raises(HTTPException) as error:
            update_missing_product(
                999, MissingProductUpdate(quantity="1"), db
            )
        assert error.value.status_code == 404


def test_missing_product_operations_never_touch_the_linked_product() -> None:
    engine = _engine()
    with Session(engine) as db:
        product = _product(db, barcode="UNTOUCHED", price="999.99")
        original = {
            "name": product.name,
            "price": product.price,
            "barcode": product.barcode,
            "revision": product.revision,
            "label_version": product.label_version,
        }
        price_history_before = db.scalar(
            select(func.count(ProductPriceChange.id))
        )

        record = _create(db, product_id=product.id, quantity="2 bultos")
        update_missing_product(
            record.id,
            MissingProductUpdate(quantity="6 bultos", notes="ojo el precio"),
            db,
        )
        update_missing_product(
            record.id, MissingProductUpdate(status="resolved"), db
        )
        delete_missing_product(record.id, db)
        db.refresh(product)

        assert product.name == original["name"]
        assert product.price == original["price"]
        assert product.barcode == original["barcode"]
        assert product.revision == original["revision"]
        assert product.label_version == original["label_version"]
        assert db.scalar(
            select(func.count(ProductPriceChange.id))
        ) == price_history_before


def test_duplicate_pending_for_same_product_returns_409_with_existing() -> None:
    engine = _engine()
    with Session(engine) as db:
        product = _product(db)
        first = _create(db, product_id=product.id, name="COCA COLA 2.25L")

        with pytest.raises(HTTPException) as conflict:
            _create(db, product_id=product.id, name="Coca cola (otra anotación)")

        assert conflict.value.status_code == 409
        assert conflict.value.detail["existing"]["id"] == first.id
        assert conflict.value.detail["existing"]["name"] == "COCA COLA 2.25L"

        # Un segundo faltante SÍ se permite una vez resuelto el primero.
        update_missing_product(
            first.id, MissingProductUpdate(status="resolved"), db
        )
        again = _create(db, product_id=product.id, name="Coca cola de nuevo")
        assert again.status == "pending"


def test_same_name_without_product_id_is_not_blocked() -> None:
    engine = _engine()
    with Session(engine) as db:
        one = _create(db, name="PAN LACTAL")
        two = _create(db, name="PAN LACTAL")

        assert one.id != two.id


def test_linking_a_missing_product_that_does_not_exist_is_rejected() -> None:
    engine = _engine()
    with Session(engine) as db:
        with pytest.raises(HTTPException) as error:
            _create(db, product_id=4321)
        assert error.value.status_code == 422


def test_database_conflict_after_fast_path_miss_returns_409(monkeypatch):
    with Session(_engine()) as db:
        product = _product(db)
        first = _create(db, product_id=product.id)
        original_scalar = db.scalar
        calls = 0

        def miss_once(statement, *args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                return None  # Otro request insertó después de nuestro chequeo.
            return original_scalar(statement, *args, **kwargs)

        monkeypatch.setattr(db, "scalar", miss_once)
        with pytest.raises(HTTPException) as conflict:
            _create(db, product_id=product.id)
        assert calls == 2
        assert conflict.value.status_code == 409
        assert conflict.value.detail["existing"]["id"] == first.id
        assert conflict.value.detail["message"] == "Ya hay un faltante pendiente para ese producto."
        assert len(_list(db)) == 1
        assert _create(db, name="Sin vínculo").id != first.id  # Sesión recuperada.


@pytest.mark.parametrize("reopen", [True, False])
def test_update_pending_conflict_rolls_back_all_changes(reopen):
    with Session(_engine()) as db:
        product = _product(db)
        record = _create(db, product_id=product.id if reopen else None)
        if reopen:
            update_missing_product(record.id, MissingProductUpdate(status="resolved"), db)
        original_status, original_date = record.status, record.resolved_at
        first = _create(db, product_id=product.id)
        changes = {"status": "pending"} if reopen else {"product_id": product.id}
        with pytest.raises(HTTPException) as conflict:
            update_missing_product(record.id, MissingProductUpdate(notes="No persistir", **changes), db)
        assert conflict.value.status_code == 409
        assert conflict.value.detail["existing"]["id"] == first.id
        db.refresh(record)
        assert record.notes is None
        assert record.status == original_status
        assert record.resolved_at == original_date
        assert record.product_id == (product.id if reopen else None)


def test_unrelated_integrity_error_is_not_reported_as_pending_conflict():
    from sqlalchemy.exc import IntegrityError
    from app.api.missing_products import _commit_missing_product

    with Session(_engine()) as db:
        record = MissingProduct(name=None, status="pending")
        db.add(record)
        with pytest.raises(IntegrityError):
            _commit_missing_product(record, db)
        assert _create(db).id is not None



def test_sql_index_migration_is_repeatable_on_existing_table():
    from pathlib import Path
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    engine = _engine()
    sql = (Path(__file__).resolve().parents[1] / "migrations" /
           "20260912_unique_pending_missing_products.sql").read_text(encoding="utf-8")
    with engine.begin() as connection:
        connection.execute(text("DROP INDEX uq_missing_products_pending_product"))
    with Session(engine) as db:
        product = _product(db)
        first = _create(db, product_id=product.id)
        first_id, product_id = first.id, product.id
    with engine.begin() as connection:
        connection.execute(text(sql))
        connection.execute(text(sql))
    with Session(engine) as db:
        assert db.get(MissingProduct, first_id).product_id == product_id
        db.add(MissingProduct(name="Duplicado directo", product_id=product_id))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        assert len(_list(db)) == 1
        assert _create(db).product_id is None
        assert _create(db).product_id is None
