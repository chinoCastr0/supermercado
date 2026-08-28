from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import app.models
from app.api.labels import confirm_batch, generate_labels
from app.database import Base
from app.models.product import Product
from app.schemas.product import LabelGenerationRequest


def test_old_batch_cannot_confirm_modified_product() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        current = Product(
            barcode="BATCH-1",
            name="Producto",
            price=Decimal("100"),
            weight=Decimal("500"),
            weight_unit="g",
        )
        db.add(current)
        db.commit()
        db.refresh(current)

        response = generate_labels(
            LabelGenerationRequest(product_ids=[current.id]),
            db,
        )
        batch_id = response.headers["X-Print-Batch-Id"]
        current.label_version += 1
        db.commit()

        confirmation = confirm_batch(batch_id, db)
        db.refresh(current)

        assert confirmation.marked_count == 0
        assert confirmation.stale_product_ids == [current.id]
        assert current.printed is False
