"""Motor SQLAlchemy, sesiones por petición y adaptación del esquema.

Los controladores deciden cuándo confirmar la transacción; get_db sólo cierra
la sesión. initialize_database no reemplaza un historial de migraciones versionado."""

from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_database_url

# Carga variables locales en desarrollo; producción puede inyectarlas sin `.env`.
load_dotenv()


DATABASE_URL = get_database_url()

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """Clase base compartida por todos los modelos SQLAlchemy."""

    pass


# Columnas que agrega migrations/20261003_add_organizations.sql. Sin ellas el
# aislamiento entre organizaciones no es posible, así que no se arranca.
ORGANIZATION_COLUMNS = {
    "products": ("organization_id",),
    "product_price_changes": ("organization_id", "changed_by"),
    "print_batches": ("organization_id",),
    "missing_products": ("organization_id",),
}


def pending_organization_migration() -> list[str]:
    """Columnas de organización faltantes en tablas existentes (vacía si está al día)."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    missing = []
    for table, required in ORGANIZATION_COLUMNS.items():
        if table not in tables:
            continue
        columns = {column["name"] for column in inspector.get_columns(table)}
        missing.extend(f"{table}.{name}" for name in required if name not in columns)
    return missing


def initialize_database() -> None:
    """Crea tablas nuevas y adapta instalaciones anteriores de forma idempotente.

    Una base previa a organizaciones NO se migra automáticamente: asignar todos
    los datos a una organización exige backup y confirmación explícita, así que
    el arranque falla con instrucciones antes de ejecutar cualquier DDL."""
    if missing := pending_organization_migration():
        raise RuntimeError(
            "La base no tiene las columnas de organización ("
            + ", ".join(missing)
            + "). Hacer pg_dump y ejecutar `python -m scripts.migrate_organizations` "
            "con BOOTSTRAP_ORGANIZATION_ID (ver docs/DEPLOY_BACKEND.md)."
        )
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
