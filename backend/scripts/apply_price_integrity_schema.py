"""Apply additive price-integrity schema changes and prove prices stay untouched."""

from sqlalchemy import inspect, text

import app.models
from app.database import engine, initialize_database


def product_price_fingerprint() -> tuple[int, str, str]:
    """Calcula conteo, suma y huella de precios; requiere PostgreSQL y no bloquea escrituras."""
    with engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT COUNT(*) AS count, "
                "COALESCE(SUM(price), 0)::text AS total, "
                "MD5(COALESCE(STRING_AGG(id::text || ':' || price::text, ',' "
                "ORDER BY id), '')) AS fingerprint "
                "FROM products"
            )
        ).one()
    return int(row.count), row.total, row.fingerprint


# Este script modifica la base configurada y confirma DDL. La comparación final
# detecta diferencias, pero no revierte una migración ya confirmada (auditoría A06).
before = product_price_fingerprint()
initialize_database()
after = product_price_fingerprint()
if before != after:
    raise RuntimeError("La migración cambió precios existentes; revisión abortada.")

inspector = inspect(engine)
product_columns = {column["name"] for column in inspector.get_columns("products")}
batch_columns = {
    column["name"] for column in inspector.get_columns("print_batch_items")
}
required_batch_columns = {
    "position",
    "snapshot_barcode",
    "snapshot_name",
    "snapshot_price",
    "snapshot_weight",
    "snapshot_weight_unit",
}
assert "revision" in product_columns
assert required_batch_columns <= batch_columns
assert "product_price_changes" in inspector.get_table_names()

print(f"products={before[0]}")
print(f"price_total_unchanged={before[1]}")
print(f"price_fingerprint_unchanged={before[2]}")
print("revision_column=ok")
print("price_history_table=ok")
print("label_snapshot_columns=ok")
