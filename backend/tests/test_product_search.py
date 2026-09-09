"""Combinaciones de nombre, presentación, barcode, filtros y paginación."""
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import app.models
from app.api.products import list_products
from app.database import Base
from app.models.product import Product


def _engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine


def _seed(db: Session) -> list[Product]:
    products = [
        Product(barcode="000123", name="COCA COLA", price=Decimal("10"), weight=Decimal("500"), weight_unit="ml"),
        Product(barcode="000124", name="COCA COLA", price=Decimal("20"), weight=Decimal("1.5"), weight_unit="l"),
        Product(barcode="000125", name="COCA COLA ZERO", price=Decimal("30"), weight=Decimal("500"), weight_unit="ml"),
        Product(barcode="000126", name="COCA COLA ZERO", price=Decimal("40"), weight=Decimal("2.25"), weight_unit="l"),
        Product(barcode="000127", name="Galletita Mana", price=Decimal("50"), weight=Decimal("165"), weight_unit="g"),
        Product(barcode="000128", name="Galletita Mana", price=Decimal("60"), weight=Decimal("300"), weight_unit="g", active=False),
    ]
    db.add_all(products)
    db.commit()
    for product in products:
        db.refresh(product)
    products[0].printed_label_version = products[0].label_version
    from datetime import datetime, timezone
    products[0].printed_at = datetime.now(timezone.utc)
    db.commit()
    return products


def _search(db: Session, search: str, **kwargs) -> list[Product]:
    return list_products(
        db,
        skip=kwargs.get("skip", 0),
        limit=kwargs.get("limit", 500),
        print_status=kwargs.get("print_status", "all"),
        active_status=kwargs.get("active_status", "all"),
        search=search,
    )


def test_search_by_exact_partial_and_case_insensitive_name() -> None:
    with Session(_engine()) as db:
        _seed(db)
        assert len(_search(db, "COCA COLA")) == 4
        assert len(_search(db, "cOcA")) == 4
        assert [item.name for item in _search(db, "coca zero")] == [
            "COCA COLA ZERO",
            "COCA COLA ZERO",
        ]


def test_search_combines_name_weight_and_unit_without_mixing_sizes() -> None:
    with Session(_engine()) as db:
        _seed(db)
        assert {item.barcode for item in _search(db, "coca 500")} == {
            "000123",
            "000125",
        }
        assert {item.barcode for item in _search(db, "coca 500ml")} == {
            "000123",
            "000125",
        }
        assert [item.barcode for item in _search(db, "galletita 300 g")] == [
            "000128"
        ]
        assert [item.barcode for item in _search(db, "mana 165")] == ["000127"]


def test_search_accepts_decimal_weight_with_dot_or_comma() -> None:
    with Session(_engine()) as db:
        _seed(db)
        assert [item.barcode for item in _search(db, "coca 1.5l")] == ["000124"]
        assert [item.barcode for item in _search(db, "coca 1,5 l")] == ["000124"]


def test_search_combines_print_active_filters_and_pagination() -> None:
    with Session(_engine()) as db:
        _seed(db)
        assert [item.barcode for item in _search(db, "coca", print_status="printed")] == ["000123"]
        assert "000128" not in {
            item.barcode for item in _search(db, "galletita", active_status="active")
        }
        first = _search(db, "coca", skip=0, limit=2)
        second = _search(db, "coca", skip=2, limit=2)
        assert len(first) == len(second) == 2
        assert {item.id for item in first}.isdisjoint(item.id for item in second)


def test_barcode_search_remains_textual_and_supports_partial_match() -> None:
    with Session(_engine()) as db:
        _seed(db)
        assert [item.barcode for item in _search(db, "000123")] == ["000123"]
        assert {item.barcode for item in _search(db, "00012")} == {
            "000123",
            "000124",
            "000125",
            "000126",
            "000127",
            "000128",
        }
