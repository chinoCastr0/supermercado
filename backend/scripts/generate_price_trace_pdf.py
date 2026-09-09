"""Generate a PDF from values first persisted in an isolated NUMERIC database."""

from decimal import Decimal
from pathlib import Path
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

import app.models
from app.database import Base
from app.models.product import Product
from app.services.label_pdf import build_labels_pdf


# El destino recibido se sobrescribe. Sólo se persisten ejemplos en SQLite en memoria.
output = Path(sys.argv[1])
output.parent.mkdir(parents=True, exist_ok=True)
engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)

with Session(engine) as database:
    database.add_all(
        [
            Product(barcode="TRACE-10", name="Precio entero", price=Decimal("10.00")),
            Product(barcode="TRACE-1050", name="Precio centavos", price=Decimal("10.50")),
            Product(barcode="TRACE-123456", name="Caso trazado", price=Decimal("1234.56")),
            Product(
                barcode="TRACE-HIGH",
                name="Precio máximo",
                price=Decimal("9999999999.99"),
            ),
        ]
    )
    database.commit()
    persisted = list(database.scalars(select(Product).order_by(Product.id)).all())
    result = build_labels_pdf(persisted)
    output.write_bytes(result.content)

print("persisted_prices=" + ",".join(str(product.price) for product in persisted))
print(f"pdf={output.resolve()} bytes={len(result.content)}")
