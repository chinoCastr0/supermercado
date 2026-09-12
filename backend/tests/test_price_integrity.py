"""Trazabilidad monetaria, revisiones y snapshots con SQLite y PDFs en memoria."""
from decimal import Decimal
from io import BytesIO

from fastapi import HTTPException, UploadFile
import pytest
from pypdf import PdfReader
from sqlalchemy import Numeric, create_engine, inspect, select
from sqlalchemy.orm import Session

import app.models
from app.api.labels import (
    confirm_batch,
    generate_labels,
    reprint_batch_pdf,
    set_print_status,
)
from app.api.products import (
    create_product,
    export_register_products,
    get_product,
    get_product_price_history,
    import_products,
    list_products,
    update_product,
)
from app.database import Base
from app.models.product import Product
from app.schemas.product import (
    LabelGenerationRequest,
    ProductCreate,
    ProductPrintStatusUpdate,
    ProductResponse,
    ProductUpdate,
)


def _engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine


def _serialized_price(product: Product) -> str:
    response = ProductResponse.model_validate(product)
    return response.model_dump(mode="json")["price"]


def test_price_1234_56_remains_exact_from_payload_to_refetch_and_edit() -> None:
    engine = _engine()
    frontend_payload = {
        "barcode": "TRACE-1234",
        "name": "Trazabilidad",
        "price": "1234.56",
    }

    with Session(engine) as db:
        received = ProductCreate.model_validate(frontend_payload)
        assert received.price == Decimal("1234.56")

        created = create_product(received, db)
        assert created.price == Decimal("1234.56")
        assert _serialized_price(created) == "1234.56"

        stored = db.execute(
            select(Product.__table__.c.price).where(Product.id == created.id)
        ).scalar_one()
        assert stored == Decimal("1234.56")

        fetched = get_product(created.id, db)
        refreshed = list_products(db, skip=0, limit=500, print_status="all")
        assert fetched.price == Decimal("1234.56")
        assert _serialized_price(refreshed[0]) == "1234.56"

        edited = update_product(
            created.id,
            ProductUpdate(
                expected_revision=created.revision,
                name="Trazabilidad 2",
                price="1234.56",
            ),
            db,
        )
        assert edited.price == Decimal("1234.56")
        assert _serialized_price(edited) == "1234.56"


def test_price_10_50_and_comma_input_keep_their_cents() -> None:
    dot = ProductCreate(barcode="DOT-1050", name="Con punto", price="10.50")
    comma = ProductCreate(barcode="COMMA-1050", name="Con coma", price="10,50")

    assert dot.price == Decimal("10.50")
    assert comma.price == Decimal("10.50")
    assert dot.model_dump(mode="json")["price"] == "10.50"
    assert comma.model_dump(mode="json")["price"] == "10.50"


def test_import_does_not_turn_dot_decimal_into_an_integer_price() -> None:
    engine = _engine()
    csv = (
        "barcode,name,price\n"
        "TRACE-CSV,Trazabilidad,1234.56\n"
        'TRACE-AR,Formato argentino,"1.234,56"\n'
    ).encode()

    with Session(engine) as db:
        result = import_products(
            UploadFile(filename="precios.csv", file=BytesIO(csv)),
            db,
        )
        prices = db.scalars(select(Product.price).order_by(Product.barcode)).all()

    assert result["imported_count"] == 2
    assert prices == [Decimal("1234.56"), Decimal("1234.56")]


def test_reimporting_same_barcode_does_not_mutate_the_saved_price() -> None:
    engine = _engine()
    with Session(engine) as db:
        product = create_product(
            ProductCreate(
                barcode="TRACE-SAME",
                name="Producto",
                price="1234.56",
            ),
            db,
        )
        csv = b"barcode,name,price\nTRACE-SAME,Producto,1234.56\n"

        import_products(
            UploadFile(filename="precios.csv", file=BytesIO(csv)),
            db,
        )
        db.refresh(product)

        assert product.price == Decimal("1234.56")


def test_printing_flows_read_price_without_modifying_it() -> None:
    engine = _engine()
    with Session(engine) as db:
        product = create_product(
            ProductCreate(
                barcode="TRACE-PRINT",
                name="Producto PDF",
                price="1234.56",
            ),
            db,
        )
        response = generate_labels(
            LabelGenerationRequest(product_ids=[product.id]),
            db,
        )
        text = PdfReader(BytesIO(response.body)).pages[0].extract_text() or ""
        db.refresh(product)
        assert "$ 1.234,56" in text
        assert product.price == Decimal("1234.56")

        set_print_status(
            ProductPrintStatusUpdate(product_ids=[product.id], printed=True),
            db,
        )
        db.refresh(product)
        assert product.price == Decimal("1234.56")

        confirm_batch(response.headers["X-Print-Batch-Id"], db)
        db.refresh(product)
        assert product.price == Decimal("1234.56")

        register_response = export_register_products(db)
        assert len(register_response.body) > 0
        db.refresh(product)
        assert product.price == Decimal("1234.56")


def test_database_schema_uses_numeric_with_two_decimal_places() -> None:
    engine = _engine()
    price_column = next(
        column
        for column in inspect(engine).get_columns("products")
        if column["name"] == "price"
    )

    assert isinstance(price_column["type"], Numeric)
    assert price_column["type"].precision == 12
    assert price_column["type"].scale == 2


def test_import_only_increases_existing_prices() -> None:
    engine = _engine()
    with Session(engine) as db:
        product = create_product(
            ProductCreate(
                barcode="SAFE-IMPORT",
                name="Producto original",
                price="5300",
                weight="500",
                weight_unit="g",
            ),
            db,
        )
        csv = (
            b"barcode,name,price,peso,unidad\n"
            b"SAFE-IMPORT,Nombre importado,7000,2,kg\n"
        )

        increased = import_products(
            UploadFile(filename="precios.csv", file=BytesIO(csv)),
            db,
        )
        db.refresh(product)
        assert product.price == Decimal("7000.00")
        assert product.name == "Producto original"
        assert product.weight == Decimal("500.00")
        assert product.weight_unit == "g"
        assert increased["price_updated_count"] == 1
        assert increased["preserved_price_barcodes"] == []

        lower_csv = (
            b"barcode,name,price,peso,unidad\n"
            b"SAFE-IMPORT,Otro nombre,6000,3,l\n"
        )
        preserved = import_products(
            UploadFile(filename="precios.csv", file=BytesIO(lower_csv)),
            db,
        )
        db.refresh(product)
        assert product.price == Decimal("7000.00")
        assert product.name == "Producto original"
        assert product.weight == Decimal("500.00")
        assert product.weight_unit == "g"
        assert preserved["price_updated_count"] == 0
        assert preserved["preserved_price_barcodes"] == ["SAFE-IMPORT"]

        equal = import_products(
            UploadFile(filename="precios.csv", file=BytesIO(csv)),
            db,
        )
        db.refresh(product)
        assert product.price == Decimal("7000.00")
        assert equal["price_updated_count"] == 0
        assert equal["preserved_price_barcodes"] == []

        history = get_product_price_history(product.id, db)
        assert [entry.new_price for entry in history] == [
            Decimal("5300.00"),
            Decimal("7000.00"),
        ]
        assert [entry.source for entry in history] == [
            "manual_create",
            "import_update",
        ]


def test_stale_edit_cannot_overwrite_a_newer_price() -> None:
    engine = _engine()
    with Session(engine) as db:
        product = create_product(
            ProductCreate(barcode="STALE-EDIT", name="Producto", price="5300"),
            db,
        )
        stale_revision = product.revision

        updated = update_product(
            product.id,
            ProductUpdate(expected_revision=stale_revision, price="6000"),
            db,
        )
        assert updated.price == Decimal("6000.00")

        with pytest.raises(HTTPException) as conflict:
            update_product(
                product.id,
                ProductUpdate(expected_revision=stale_revision, price="7000"),
                db,
            )
        db.refresh(product)

        assert conflict.value.status_code == 409
        assert product.price == Decimal("6000.00")


def test_update_rejects_a_weight_left_without_its_unit() -> None:
    """Regresión A03: enviar sólo `weight` no debe dejar `weight_unit` huérfano."""
    engine = _engine()
    with Session(engine) as db:
        product = create_product(
            ProductCreate(
                barcode="WEIGHT-PAIR",
                name="Producto",
                price="5300",
                weight="500",
                weight_unit="g",
            ),
            db,
        )

        with pytest.raises(HTTPException) as error:
            update_product(
                product.id,
                ProductUpdate(expected_revision=product.revision, weight=None),
                db,
            )
        db.refresh(product)

        assert error.value.status_code == 422
        assert product.weight == Decimal("500.00")
        assert product.weight_unit == "g"


def test_print_batch_is_an_immutable_snapshot_after_catalog_price_changes() -> None:
    engine = _engine()
    with Session(engine) as db:
        product = create_product(
            ProductCreate(barcode="SNAPSHOT", name="Producto", price="7000"),
            db,
        )
        original = generate_labels(
            LabelGenerationRequest(product_ids=[product.id]),
            db,
        )
        batch_id = original.headers["X-Print-Batch-Id"]

        update_product(
            product.id,
            ProductUpdate(expected_revision=product.revision, price="6000"),
            db,
        )
        db.refresh(product)
        reprinted = reprint_batch_pdf(batch_id, db)
        original_text = PdfReader(BytesIO(original.body)).pages[0].extract_text() or ""
        reprint_text = PdfReader(BytesIO(reprinted.body)).pages[0].extract_text() or ""

        assert product.price == Decimal("6000.00")
        assert "$ 7.000,00" in original_text
        assert "$ 7.000,00" in reprint_text
        assert "$ 6.000,00" not in reprint_text
        assert reprinted.body == original.body
