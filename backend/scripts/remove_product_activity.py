"""Retirada explícita de active, independiente del startup HTTP."""
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def remove_product_activity(engine: Engine) -> None:
    sql = (Path(__file__).resolve().parents[1] / "migrations" /
           "20260912_remove_product_activity.sql").read_text(encoding="utf-8")
    with engine.begin() as connection:
        if engine.dialect.name == "sqlite":
            # SQLite no soporta IF EXISTS en DROP COLUMN.
            if "active" not in {c["name"] for c in inspect(connection).get_columns("products")}:
                return
            sql = sql.replace("DROP COLUMN IF EXISTS", "DROP COLUMN")
        connection.execute(text(sql))
        if "active" in {c["name"] for c in inspect(connection).get_columns("products")}:
            raise RuntimeError("No se retiró products.active")


if __name__ == "__main__":
    from app.database import engine

    remove_product_activity(engine)
    print("products.active retirada; migración confirmada")
