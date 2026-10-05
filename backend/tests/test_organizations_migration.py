"""Migración de organizaciones sobre una base PostgreSQL con datos previos.

Requiere TEST_POSTGRES_URL apuntando a una base DESCARTABLE: cada test borra y
recrea el schema public. Sin la variable, los tests se omiten. Ejemplo local:
  docker run -d --rm --name supermercado-test-pg -e POSTGRES_PASSWORD=test \\
    -e POSTGRES_DB=test -p 127.0.0.1:55432:5432 postgres:17
  TEST_POSTGRES_URL=postgresql://postgres:test@127.0.0.1:55432/test

El esquema "legacy" es el de la versión anterior: products como lo creaba
SQLAlchemy (barcode con índice único global) más las migraciones SQL previas."""

from decimal import Decimal
import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import app.database as database
import app.models
from app.models.missing_product import MissingProduct
from app.models.product import Product
from scripts.migrate_organizations import migrate_organizations

TEST_POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(
    not TEST_POSTGRES_URL, reason="TEST_POSTGRES_URL no definida"
)

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
LEGACY_PRODUCTS = """
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    weight NUMERIC(10, 2),
    weight_unit VARCHAR(2),
    revision INTEGER NOT NULL DEFAULT 1,
    label_version INTEGER NOT NULL DEFAULT 1,
    printed_label_version INTEGER,
    printed_at TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_products_id ON products (id);
CREATE UNIQUE INDEX ix_products_barcode ON products (barcode);
CREATE INDEX ix_products_name ON products (name);
"""
LEGACY_MIGRATIONS = (
    "20260827_add_label_printing.sql",
    "20260904_price_integrity.sql",
    "20260910_add_missing_products.sql",
    "20260912_unique_pending_missing_products.sql",
)
LEGACY_DATA = """
INSERT INTO products (barcode, name, price) VALUES
    ('779001', 'Leche', 1500.00), ('779002', 'Pan', 900.50);
INSERT INTO product_price_changes (product_id, barcode, old_price, new_price, source)
    VALUES (1, '779001', NULL, 1500.00, 'manual_create'),
           (2, '779002', NULL, 900.50, 'import_create'),
           (1, '779001', 1500.00, 1600.00, 'manual_update');
INSERT INTO print_batches (id, status, generated_at)
    VALUES ('batch-1', 'confirmed', CURRENT_TIMESTAMP);
INSERT INTO print_batch_items (batch_id, product_id, label_version, position)
    VALUES ('batch-1', 1, 1, 0), ('batch-1', 2, 1, 1);
INSERT INTO missing_products (product_id, name, status)
    VALUES (1, 'Leche', 'pending'), (NULL, 'Yerba', 'resolved');
"""
BOOTSTRAP = "org_LeandroSupermercado"


@pytest.fixture
def legacy_engine():
    engine = create_engine(TEST_POSTGRES_URL)
    with engine.begin() as connection:
        connection.exec_driver_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        connection.exec_driver_sql(LEGACY_PRODUCTS)
        for name in LEGACY_MIGRATIONS:
            connection.exec_driver_sql((MIGRATIONS / name).read_text(encoding="utf-8"))
        connection.exec_driver_sql(LEGACY_DATA)
    yield engine
    engine.dispose()


def _owners(engine, table: str) -> set:
    with engine.connect() as connection:
        return set(connection.execute(
            text(f"SELECT DISTINCT organization_id FROM {table}")
        ).scalars())


def test_migration_assigns_every_row_to_bootstrap_organization(legacy_engine):
    counts = migrate_organizations(legacy_engine, BOOTSTRAP)

    assert counts == {"products": 2, "product_price_changes": 3, "print_batches": 1,
                      "missing_products": 2, "print_batch_items": 2}
    for table in ("products", "product_price_changes", "print_batches", "missing_products"):
        assert _owners(legacy_engine, table) == {BOOTSTRAP}
        column = next(c for c in inspect(legacy_engine).get_columns(table)
                      if c["name"] == "organization_id")
        assert column["nullable"] is False
    with legacy_engine.connect() as connection:
        # El historial previo no tiene actor conocido.
        assert connection.execute(text(
            "SELECT COUNT(*) FROM product_price_changes WHERE changed_by IS NULL"
        )).scalar_one() == 3
        assert connection.execute(text(
            "SELECT price FROM products WHERE barcode = '779001'"
        )).scalar_one() == Decimal("1500.00")


def test_migration_is_idempotent(legacy_engine):
    first = migrate_organizations(legacy_engine, BOOTSTRAP)
    second = migrate_organizations(legacy_engine, "org_OtraOrganizacion")
    assert first == second
    # Una segunda corrida no reasigna filas que ya tienen dueño.
    assert _owners(legacy_engine, "products") == {BOOTSTRAP}


def test_barcode_and_pending_missing_are_unique_per_organization(legacy_engine):
    migrate_organizations(legacy_engine, BOOTSTRAP)

    with Session(legacy_engine) as db:
        db.add(Product(organization_id="org_Otra", barcode="779001",
                       name="Leche", price=Decimal("10.00")))
        db.add(MissingProduct(organization_id="org_Otra", product_id=1, name="Leche"))
        db.commit()

    with Session(legacy_engine) as db:
        db.add(Product(organization_id=BOOTSTRAP, barcode="779001",
                       name="Duplicado", price=Decimal("10.00")))
        with pytest.raises(IntegrityError):
            db.commit()

    with Session(legacy_engine) as db:
        db.add(MissingProduct(organization_id=BOOTSTRAP, product_id=1, name="Leche"))
        with pytest.raises(IntegrityError):
            db.commit()


def test_dry_run_and_invalid_id_leave_legacy_schema_untouched(legacy_engine):
    migrate_organizations(legacy_engine, BOOTSTRAP, dry_run=True)
    with pytest.raises(RuntimeError):
        migrate_organizations(legacy_engine, "Leandro Supermercado")
    columns = {c["name"] for c in inspect(legacy_engine).get_columns("products")}
    assert "organization_id" not in columns


def test_startup_refuses_legacy_schema_until_migrated(monkeypatch, legacy_engine):
    monkeypatch.setattr(database, "engine", legacy_engine)
    with pytest.raises(RuntimeError, match="migrate_organizations"):
        database.initialize_database()

    migrate_organizations(legacy_engine, BOOTSTRAP)
    database.initialize_database()
    assert database.pending_organization_migration() == []
