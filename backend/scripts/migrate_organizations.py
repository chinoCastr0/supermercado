"""Aplica 20261003_add_organizations.sql en una única transacción PostgreSQL.

Lee BOOTSTRAP_ORGANIZATION_ID (org_... de Clerk), toma conteos antes, ejecuta la
migración y verifica dentro de la misma transacción: si la verificación falla,
no se confirma nada. --dry-run ejecuta todo y hace rollback.

Hacer pg_dump antes y detener el backend (ver docs/DEPLOY_BACKEND.md):
  docker compose run --rm --no-deps -e BOOTSTRAP_ORGANIZATION_ID backend \\
      python -m scripts.migrate_organizations [--dry-run]
"""

import os
from pathlib import Path
import re
import sys

from sqlalchemy import text
from sqlalchemy.engine import Engine

from scripts.verify_organizations_migration import table_counts, verification_errors

MIGRATION = (
    Path(__file__).resolve().parents[1] / "migrations" / "20261003_add_organizations.sql"
)
ORGANIZATION_ID = re.compile(r"^org_[A-Za-z0-9]+$")


def migrate_organizations(
    engine: Engine, organization_id: str, *, dry_run: bool = False
) -> dict[str, int]:
    """Migra y devuelve los conteos verificados; lanza RuntimeError si algo no cuadra."""
    if not ORGANIZATION_ID.fullmatch(organization_id or ""):
        raise RuntimeError("BOOTSTRAP_ORGANIZATION_ID debe ser un ID org_... de Clerk")
    if engine.dialect.name != "postgresql":
        raise RuntimeError("La migración de organizaciones es sólo para PostgreSQL")
    sql = MIGRATION.read_text(encoding="utf-8")
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            before = table_counts(connection)
            # is_local=true: el parámetro vive sólo dentro de esta transacción.
            connection.execute(
                text("SELECT set_config('app.bootstrap_organization_id', :org, true)"),
                {"org": organization_id},
            )
            connection.exec_driver_sql(sql)
            errors = verification_errors(connection, before)
            if errors:
                raise RuntimeError("Verificación fallida: " + "; ".join(errors))
        except BaseException:
            transaction.rollback()
            raise
        if dry_run:
            transaction.rollback()
        else:
            transaction.commit()
    return before


if __name__ == "__main__":
    from app.database import engine

    dry_run = "--dry-run" in sys.argv[1:]
    counts = migrate_organizations(
        engine, os.getenv("BOOTSTRAP_ORGANIZATION_ID", ""), dry_run=dry_run
    )
    action = "Ensayo revertido" if dry_run else "Migración confirmada"
    print(f"{action}: conteos verificados {counts}; 0 filas sin organization_id")
