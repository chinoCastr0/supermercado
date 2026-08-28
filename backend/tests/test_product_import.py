from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO

import pandas as pd
from fastapi import UploadFile
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

import app.models
from app.api.products import import_products
from app.database import Base
from app.models.product import Product


def test_import_updates_existing_and_creates_new_products_in_one_batch() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    dataframe = pd.DataFrame(
        [
            {"barcode": "111", "name": "Leche", "price": 1800},
            {"barcode": "222", "name": "Arroz", "price": 1200},
            {"barcode": None, "name": "Sin código", "price": 900},
        ]
    )
    content = BytesIO()
    dataframe.to_excel(content, index=False, engine="openpyxl")
    upload = UploadFile(filename="productos.xlsx", file=BytesIO(content.getvalue()))

    with Session(engine) as db:
        existing = Product(
            barcode="111",
            name="Leche",
            price=Decimal("1500"),
            label_version=3,
            printed_label_version=3,
            printed_at=datetime.now(timezone.utc),
        )
        db.add(existing)
        db.commit()

        result = import_products(upload, db)
        products = db.scalars(select(Product).order_by(Product.barcode)).all()

        assert result == {
            "imported_count": 1,
            "updated_count": 1,
            "skipped_barcodes": ["Sin código"],
        }
        assert [product.barcode for product in products] == ["111", "222"]
        assert products[0].price == Decimal("1800.00")
        assert products[0].label_version == 4
        assert products[0].printed is False
        assert products[1].printed is False
