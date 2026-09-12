"""Startup conserva active; la migración explícita la retira sin perder productos."""
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session

import app.database as database
import app.models
from app.api.products import export_register_products
from app.models.product import Product
from scripts.remove_product_activity import remove_product_activity


@pytest.fixture
def legacy_engine():
    engine = create_engine("sqlite:///:memory:")
    database.Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text(
            "ALTER TABLE products ADD COLUMN active BOOLEAN NOT NULL DEFAULT FALSE"
        ))
    with Session(engine) as db:
        db.add(Product(barcode="001", name="Leche", price=Decimal("10.00")))
        db.commit()
    yield engine
    engine.dispose()


def test_startup_does_not_drop_activity(monkeypatch, legacy_engine):
    monkeypatch.setattr(database, "engine", legacy_engine)
    statements = []
    event.listen(legacy_engine, "before_cursor_execute",
                 lambda conn, cursor, statement, params, context, many: statements.append(statement))
    database.initialize_database()
    database.initialize_database()
    assert "active" in {c["name"] for c in inspect(legacy_engine).get_columns("products")}
    assert not any("ALTER" in sql.upper() and "ACTIVE" in sql.upper() for sql in statements)
    with Session(legacy_engine) as db:
        assert db.get(Product, 1).barcode == "001"


def test_explicit_migration_preserves_and_exports_all_products(legacy_engine):
    with legacy_engine.connect() as connection:
        before = connection.execute(text("SELECT id, barcode, name, price FROM products")).all()
    remove_product_activity(legacy_engine)
    remove_product_activity(legacy_engine)
    assert "active" not in {c["name"] for c in inspect(legacy_engine).get_columns("products")}
    with legacy_engine.connect() as connection:
        assert connection.execute(text("SELECT id, barcode, name, price FROM products")).all() == before
    with Session(legacy_engine) as db:
        db.add(Product(barcode="002", name="Pan", price=Decimal("20.00")))
        db.commit()
        response = export_register_products(db)
        assert response.body[25:40].rstrip() == b"002"
        assert response.body[83:98].rstrip() == b"001"
