"""Fachada del paquete de modelos.

IMPORTANCIA: importar este paquete registra todos los modelos en SQLAlchemy.
PATRÓN: Package Facade; la lista concreta de modelos es específica del dominio.
"""

from app.models.product import Product

__all__ = ["Product"]
