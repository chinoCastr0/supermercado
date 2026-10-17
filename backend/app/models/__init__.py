"""Fachada del paquete de modelos.

IMPORTANCIA: importar este paquete registra todos los modelos en SQLAlchemy.
PATRÓN: Package Facade; la lista concreta de modelos es específica del dominio.
"""

from app.models.member_role import MemberRole
from app.models.missing_product import MissingProduct
from app.models.print_batch import PrintBatch, PrintBatchItem
from app.models.price_change import ProductPriceChange
from app.models.product import Product

__all__ = [
    "MemberRole",
    "MissingProduct",
    "PrintBatch",
    "PrintBatchItem",
    "Product",
    "ProductPriceChange",
]

from app.models.sale import Sale, SaleItem
from app.models.cash_closure import CashClosure
