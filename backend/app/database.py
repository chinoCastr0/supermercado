"""Motor SQLAlchemy, sesiones por petición y adaptación del esquema.

Los controladores deciden cuándo confirmar la transacción; get_db sólo cierra
la sesión. initialize_database no reemplaza un historial de migraciones versionado."""

import os
from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Carga variables locales en desarrollo; producción puede inyectarlas sin `.env`.
load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("No se encontró DATABASE_URL en el archivo .env")


engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """Clase base compartida por todos los modelos SQLAlchemy."""

    pass


def initialize_database() -> None:
    """Crea tablas nuevas y adapta instalaciones anteriores de forma idempotente."""
    Base.metadata.create_all(bind=engine)

    if "products" not in inspect(engine).get_table_names():
        return
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("products")}
    with engine.begin() as connection:
        if "last_updated" not in columns:
            column_type = (
                "TIMESTAMP WITH TIME ZONE"
                if engine.dialect.name == "postgresql"
                else "DATETIME"
            )
            connection.execute(
                text(
                    "ALTER TABLE products ADD COLUMN last_updated "
                    f"{column_type} NOT NULL DEFAULT CURRENT_TIMESTAMP"
                )
            )
        if "weight" not in columns:
            connection.execute(
                text("ALTER TABLE products ADD COLUMN weight NUMERIC(10, 2)")
            )
        if "weight_unit" not in columns:
            connection.execute(
                text("ALTER TABLE products ADD COLUMN weight_unit VARCHAR(2)")
            )
        if "label_version" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE products ADD COLUMN label_version "
                    "INTEGER NOT NULL DEFAULT 1"
                )
            )
        if "printed_label_version" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE products ADD COLUMN printed_label_version INTEGER"
                )
            )
        if "printed_at" not in columns:
            timestamp_type = (
                "TIMESTAMP WITH TIME ZONE"
                if engine.dialect.name == "postgresql"
                else "DATETIME"
            )
            connection.execute(
                text(
                    "ALTER TABLE products ADD COLUMN printed_at "
                    f"{timestamp_type}"
                )
            )
        if "revision" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE products ADD COLUMN revision "
                    "INTEGER NOT NULL DEFAULT 1"
                )
            )

        if "print_batch_items" not in inspector.get_table_names():
            return
        item_columns = {
            column["name"]
            for column in inspector.get_columns("print_batch_items")
        }
        snapshot_columns = {
            "position": "INTEGER",
            "snapshot_barcode": "VARCHAR(50)",
            "snapshot_name": "VARCHAR(255)",
            "snapshot_price": "NUMERIC(12, 2)",
            "snapshot_weight": "NUMERIC(10, 2)",
            "snapshot_weight_unit": "VARCHAR(2)",
        }
        for column_name, column_type in snapshot_columns.items():
            if column_name not in item_columns:
                connection.execute(
                    text(
                        "ALTER TABLE print_batch_items "
                        f"ADD COLUMN {column_name} {column_type}"
                    )
                )


def get_db() -> Generator[Session, None, None]:
    """Entrega una sesión por request y garantiza su cierre mediante `finally`."""

    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
