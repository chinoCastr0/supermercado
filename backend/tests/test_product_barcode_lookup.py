from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import app.models
from app.api.products import get_product_by_barcode
from app.database import Base
from app.models.product import Product


def test_get_product_by_barcode_returns_exact_match() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        product = Product(
            barcode="07797906054925",
            name="Producto",
            price=Decimal("1500"),
        )
        db.add(product)
        db.commit()

        result = get_product_by_barcode("07797906054925", db)

        assert result.id == product.id
        assert result.barcode == "07797906054925"


def test_get_product_by_barcode_returns_404_when_missing() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        with pytest.raises(HTTPException) as exc_info:
            get_product_by_barcode("7797906054925", db)

    assert exc_info.value.status_code == 404
    assert "7797906054925" in str(exc_info.value.detail)
