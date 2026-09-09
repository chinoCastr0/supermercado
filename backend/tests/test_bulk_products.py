"""Atomicidad de lotes de precio y borrado usando sesiones SQLite."""
from decimal import Decimal

from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

import app.models
from app.api.labels import generate_labels, set_print_status
from app.api.products import (
    bulk_delete_products,
    bulk_update_price,
    create_product,
)
from app.database import Base
from app.models.price_change import ProductPriceChange
from app.models.print_batch import PrintBatchItem
from app.models.product import Product
from app.schemas.product import (
    BulkDeleteRequest,
    BulkPriceUpdateRequest,
    LabelGenerationRequest,
    ProductCreate,
    ProductPrintStatusUpdate,
)


def _engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine


def _create(db: Session, barcode: str, price: str) -> Product:
    return create_product(
        ProductCreate(barcode=barcode, name=barcode, price=price),
        db,
    )


def test_bulk_price_single_product_can_go_down_and_keeps_exact_cents() -> None:
    engine = _engine()
    with Session(engine) as db:
        product = _create(db, "BULK-ONE", "20.00")
        set_print_status(
            ProductPrintStatusUpdate(product_ids=[product.id], printed=True),
            db,
        )
        initial_revision = product.revision
        initial_label_version = product.label_version

        result = bulk_update_price(
            BulkPriceUpdateRequest(
                price="10.50",
                products=[
                    {"id": product.id, "expected_revision": initial_revision}
                ],
            ),
            db,
        )
        db.refresh(product)

        assert result.updated_count == 1
        assert result.unchanged_count == 0
        assert product.price == Decimal("10.50")
        assert product.revision == initial_revision + 1
        assert product.label_version == initial_label_version + 1
        assert product.printed is False
        history = db.scalars(
            select(ProductPriceChange)
            .where(ProductPriceChange.product_id == product.id)
            .order_by(ProductPriceChange.id)
        ).all()
        assert [entry.new_price for entry in history] == [
            Decimal("20.00"),
            Decimal("10.50"),
        ]
        assert history[-1].source == "bulk_manual_update"


def test_bulk_price_updates_multiple_products_and_skips_equal_price() -> None:
    engine = _engine()
    with Session(engine) as db:
        lower = _create(db, "BULK-LOW", "17.00")
        higher = _create(db, "BULK-HIGH", "25.00")
        equal = _create(db, "BULK-EQUAL", "20.00")
        equal_revision = equal.revision
        equal_label_version = equal.label_version

        result = bulk_update_price(
            BulkPriceUpdateRequest(
                price="20.00",
                products=[
                    {"id": lower.id, "expected_revision": lower.revision},
                    {"id": higher.id, "expected_revision": higher.revision},
                    {"id": equal.id, "expected_revision": equal.revision},
                ],
            ),
            db,
        )
        for product in (lower, higher, equal):
            db.refresh(product)

        assert result.updated_count == 2
        assert result.unchanged_count == 1
        assert [product.price for product in (lower, higher, equal)] == [
            Decimal("20.00"),
            Decimal("20.00"),
            Decimal("20.00"),
        ]
        assert equal.revision == equal_revision
        assert equal.label_version == equal_label_version
        history_counts = {
            product.id: db.scalar(
                select(func.count(ProductPriceChange.id)).where(
                    ProductPriceChange.product_id == product.id
                )
            )
            for product in (lower, higher, equal)
        }
        assert history_counts == {lower.id: 2, higher.id: 2, equal.id: 1}


def test_one_stale_revision_rolls_back_entire_bulk_price_change() -> None:
    engine = _engine()
    with Session(engine) as db:
        current = _create(db, "BULK-CURRENT", "10.00")
        stale = _create(db, "BULK-STALE", "11.00")
        initial_revisions = {current.id: current.revision, stale.id: stale.revision}

        with pytest.raises(HTTPException) as conflict:
            bulk_update_price(
                BulkPriceUpdateRequest(
                    price="99.99",
                    products=[
                        {
                            "id": current.id,
                            "expected_revision": current.revision,
                        },
                        {
                            "id": stale.id,
                            "expected_revision": stale.revision + 1,
                        },
                    ],
                ),
                db,
            )

        assert conflict.value.status_code == 409
        assert conflict.value.detail["conflicts"] == [
            {
                "id": stale.id,
                "expected_revision": initial_revisions[stale.id] + 1,
                "current_revision": initial_revisions[stale.id],
            }
        ]
        db.refresh(current)
        db.refresh(stale)
        assert current.price == Decimal("10.00")
        assert stale.price == Decimal("11.00")
        assert current.revision == initial_revisions[current.id]
        assert stale.revision == initial_revisions[stale.id]
        assert db.scalar(select(func.count(ProductPriceChange.id))) == 2


def test_bulk_delete_preserves_price_history_and_label_snapshots() -> None:
    engine = _engine()
    with Session(engine) as db:
        first = _create(db, "DELETE-ONE", "10.00")
        second = _create(db, "DELETE-TWO", "20.00")
        response = generate_labels(
            LabelGenerationRequest(product_ids=[first.id, second.id]),
            db,
        )
        batch_id = response.headers["X-Print-Batch-Id"]
        product_ids = [first.id, second.id]

        result = bulk_delete_products(
            BulkDeleteRequest(product_ids=product_ids),
            db,
        )

        assert result.deleted_count == 2
        assert db.scalars(select(Product).where(Product.id.in_(product_ids))).all() == []
        assert db.scalar(select(func.count(ProductPriceChange.id))) == 2
        assert db.scalar(
            select(func.count(PrintBatchItem.product_id)).where(
                PrintBatchItem.batch_id == batch_id
            )
        ) == 2


def test_missing_id_prevents_any_bulk_delete() -> None:
    engine = _engine()
    with Session(engine) as db:
        product = _create(db, "DELETE-ROLLBACK", "10.00")

        with pytest.raises(HTTPException) as missing:
            bulk_delete_products(
                BulkDeleteRequest(product_ids=[product.id, product.id + 999]),
                db,
            )

        assert missing.value.status_code == 404
        assert missing.value.detail["missing_product_ids"] == [product.id + 999]
        assert db.get(Product, product.id) is not None
