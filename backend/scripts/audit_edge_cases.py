"""Reproduce defectos de la auditoría sin acceder a la base configurada.

Ejecutar desde la raíz con PYTHONPATH=backend y DATABASE_URL=sqlite:///:memory:.
Cada caso usa datos sintéticos; los resultados describen el comportamiento actual,
no lo aprueban como contrato. Al corregir un defecto, convertirlo en regresión.
"""

import json
from decimal import Decimal
from io import BytesIO

from fastapi import UploadFile
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

import app.models
from app.api.products import create_product, import_products, update_product
from app.database import Base
from app.models.product import Product
from app.money import parse_money
from app.schemas.product import ProductCreate, ProductUpdate
from app.services.excel_import import parse_excel_rows


def main() -> None:
    """Imprime evidencia JSON con un motor SQLite independiente por ejecución."""
    evidence = {}
    evidence["missing_barcode_column"] = parse_excel_rows(
        b"name,price\nArroz,100\n", "sample.csv"
    )[0]["barcode"]
    evidence["invalid_price_rows_returned"] = len(parse_excel_rows(
        b"barcode,name,price\n001,Arroz,incorrecto\n", "sample.csv"
    ))
    try:
        parse_money("9" * 40)
    except Exception as error:
        evidence["oversized_money_exception"] = type(error).__name__

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        import_products(UploadFile(
            filename="sample.csv",
            file=BytesIO(b"barcode,name,price\n002,ABCDEFGHIJKLMNOPQRST,100\n"),
        ), db)
        evidence["imported_name_length"] = len(db.scalar(
            select(Product).where(Product.barcode == "002")
        ).name)
        product = create_product(ProductCreate(
            barcode="003", name="Peso", price="100", weight="0.001", weight_unit="g"
        ), db)
        evidence["persisted_small_weight"] = str(product.weight)
        evidence["null_price_accepted_by_dto"] = ProductUpdate(
            expected_revision=1, price=None
        ).model_dump(exclude_unset=True)
        weighted = create_product(ProductCreate(
            barcode="004", name="Peso parcial", price="100", weight="500", weight_unit="g"
        ), db)
        update_product(weighted.id, ProductUpdate(
            expected_revision=weighted.revision, weight=None
        ), db)
        db.refresh(weighted)
        evidence["partial_weight_update"] = {
            "weight": weighted.weight, "unit": weighted.weight_unit
        }
        # La restricción de precio positivo sólo vive en los DTOs, no en la tabla.
        db.add(Product(barcode="005", name="Escritura directa", price=Decimal("-1")))
        db.commit()
        evidence["negative_price_persisted"] = str(db.scalar(
            select(Product.price).where(Product.barcode == "005")
        ))
    engine.dispose()
    print(json.dumps(evidence, ensure_ascii=True, indent=2, default=str))


if __name__ == "__main__":
    main()
