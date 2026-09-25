"""Orígenes confiables para CORS."""

import os

from sqlalchemy.engine import URL


def get_database_url() -> str | URL:
    """POSTGRES_HOST selecciona campos separados; DATABASE_URL sigue válido en local."""
    if os.getenv("POSTGRES_HOST"):
        missing = [name for name in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD") if not os.getenv(name)]
        if missing:
            raise RuntimeError("Faltan variables de base de datos: " + ", ".join(missing))
        return URL.create(
            "postgresql+psycopg2",
            username=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
            host=os.environ["POSTGRES_HOST"],
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            database=os.environ["POSTGRES_DB"],
        )
    if url := os.getenv("DATABASE_URL"):
        return url
    raise RuntimeError("Configurá DATABASE_URL o POSTGRES_HOST/POSTGRES_PORT/POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD")


def get_allowed_origins() -> list[str]:
    """Orígenes que CORSMiddleware acepta; configurable por ALLOWED_ORIGINS."""
    configured = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return [
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    ]
