#database.py
import os
from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv()   #aca doten transporta variables de entorno


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
    pass


def initialize_database() -> None:
    """Create new tables and add columns required by older installations."""
    Base.metadata.create_all(bind=engine)

    if "products" not in inspect(engine).get_table_names():
        return
    columns = {column["name"] for column in inspect(engine).get_columns("products")}
    if "last_updated" in columns:
        return

    column_type = (
        "TIMESTAMP WITH TIME ZONE"
        if engine.dialect.name == "postgresql"
        else "DATETIME"
    )
    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE products ADD COLUMN last_updated "
                f"{column_type} NOT NULL DEFAULT CURRENT_TIMESTAMP"
            )
        )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
