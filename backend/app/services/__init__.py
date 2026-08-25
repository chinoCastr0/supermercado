"""Paquete de servicios y adaptadores de la aplicación.

IMPORTANCIA: crea una frontera para lógica que no pertenece a HTTP ni al ORM.
PATRÓN / SOLID: Package Facade y SRP; expone una entrada estable al paquete.
SOLUCIÓN ESPECÍFICA: el adaptador Excel es hoy el único servicio publicado.
"""

from app.services.excel_import import parse_excel_rows

__all__ = ["parse_excel_rows"]
