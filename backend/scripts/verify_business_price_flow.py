"""Exercise the 5300/7000/6000 scenario in PostgreSQL and roll it all back."""

from decimal import Decimal
from io import BytesIO
from uuid import uuid4

from fastapi import UploadFile
from pypdf import PdfReader
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.labels import generate_labels, reprint_batch_pdf
from app.api.products import create_product, import_products
from app.database import engine
from app.models.product import Product
from app.schemas.product import LabelGenerationRequest, ProductCreate


def pdf_text(content: bytes) -> str:
    """Extrae texto del PDF generado para comprobar precios visibles."""
    return "\n".join(
        page.extract_text() or "" for page in PdfReader(BytesIO(content)).pages
    )


# El rollback elimina las filas de prueba; no revierte valores de secuencias.
# Las comprobaciones impresas son diagnóstico y no sustituyen asserts de CI.
barcode = f"BIZ{uuid4().hex[:12]}"
with engine.connect() as connection:
    outer_transaction = connection.begin()
    database = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        product = create_product(
            ProductCreate(
                barcode=barcode,
                name="CONTROL ORIGINAL",
                price="5300",
                weight="500",
                weight_unit="g",
            ),
            database,
        )
        print(f"1.saved={product.price!r} revision={product.revision}")

        direct = connection.execute(
            text("SELECT price FROM products WHERE id = :product_id"),
            {"product_id": product.id},
        ).scalar_one()
        print(f"2.database={direct!r}")

        original = generate_labels(
            LabelGenerationRequest(product_ids=[product.id]),
            database,
        )
        batch_id = original.headers["X-Print-Batch-Id"]
        print(f"3.printed_5300={'$ 5.300,00' in pdf_text(original.body)}")

        csv = (
            f"barcode,name,price,peso,unidad\n"
            f"{barcode},NOMBRE IMPORTADO,7000,2,kg\n"
        ).encode()
        import_result = import_products(
            UploadFile(filename="precios.csv", file=BytesIO(csv)),
            database,
        )
        database.refresh(product)
        fields_unchanged = (
            product.name == "CONTROL ORIGINAL"
            and product.weight == Decimal("500.00")
            and product.weight_unit == "g"
        )
        print(
            f"4.import_7000_increased={product.price!r} "
            f"other_fields_unchanged={fields_unchanged}"
        )

        lower_csv = (
            f"barcode,name,price,peso,unidad\n"
            f"{barcode},OTRO NOMBRE,6000,3,l\n"
        ).encode()
        lower_result = import_products(
            UploadFile(filename="precios.csv", file=BytesIO(lower_csv)),
            database,
        )
        database.refresh(product)
        print(
            "5.import_6000_preserved="
            f"price:{product.price!r} "
            f"barcodes:{lower_result['preserved_price_barcodes']}"
        )

        reprint = reprint_batch_pdf(batch_id, database)
        print(f"6.reprint_keeps_5300={'$ 5.300,00' in pdf_text(reprint.body)}")
        print(f"7.reprint_byte_identical={reprint.body == original.body}")
    finally:
        database.close()
        outer_transaction.rollback()

with engine.connect() as connection:
    remaining = connection.scalar(select(Product.id).where(Product.barcode == barcode))
print(f"8.rollback_verified={remaining is None}")
