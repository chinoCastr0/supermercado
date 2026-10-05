"""Verificación de la migración de organizaciones (sólo lectura).

Comprueba que ninguna fila quedó sin organization_id y que los conteos por tabla
no cambiaron respecto de un snapshot previo. No imprime datos de negocio.

Uso (con "-" el snapshot va a stdout / se lee de stdin, útil en contenedores):
  python -m scripts.verify_organizations_migration snapshot antes.json
  (migrar)
  python -m scripts.verify_organizations_migration check antes.json
"""

import json
from pathlib import Path
import sys

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

# print_batch_items no tiene organization_id: la hereda de print_batches por FK.
OWNED_TABLES = ("products", "product_price_changes", "print_batches", "missing_products")
COUNTED_TABLES = (*OWNED_TABLES, "print_batch_items")


def table_counts(connection: Connection) -> dict[str, int]:
    """Cantidad de filas de cada tabla existente del dominio."""
    existing = set(inspect(connection).get_table_names())
    return {
        table: int(connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one())
        for table in COUNTED_TABLES
        if table in existing
    }


def verification_errors(connection: Connection, before: dict[str, int]) -> list[str]:
    """Lista de problemas; vacía si la migración es consistente."""
    errors = []
    after = table_counts(connection)
    for table, count in before.items():
        if after.get(table) != count:
            errors.append(f"{table}: {count} filas antes, {after.get(table)} después")
    for table in OWNED_TABLES:
        if table not in after:
            continue
        columns = {c["name"] for c in inspect(connection).get_columns(table)}
        if "organization_id" not in columns:
            errors.append(f"{table}: falta organization_id")
            continue
        orphans = connection.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE organization_id IS NULL")
        ).scalar_one()
        if orphans:
            errors.append(f"{table}: {orphans} filas sin organization_id")
    if "print_batch_items" in after:
        orphans = connection.execute(text(
            "SELECT COUNT(*) FROM print_batch_items i "
            "LEFT JOIN print_batches b ON b.id = i.batch_id WHERE b.id IS NULL"
        )).scalar_one()
        if orphans:
            errors.append(f"print_batch_items: {orphans} ítems sin lote")
    return errors


def main(argv: list[str]) -> int:
    if len(argv) != 3 or argv[1] not in ("snapshot", "check"):
        print(__doc__, file=sys.stderr)
        return 2
    from app.database import engine

    target = argv[2]
    with engine.connect() as connection:
        if argv[1] == "snapshot":
            counts = table_counts(connection)
            if target == "-":
                print(json.dumps(counts))
            else:
                Path(target).write_text(json.dumps(counts, indent=2), encoding="utf-8")
                print(f"Snapshot guardado: {counts}")
            return 0
        raw = sys.stdin.read() if target == "-" else Path(target).read_text(encoding="utf-8")
        before = json.loads(raw)
        errors = verification_errors(connection, before)
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print(f"OK: conteos iguales y 0 filas sin organization_id: {before}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
