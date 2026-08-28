from decimal import Decimal

from app.models.product import Product
from app.services.label_state import mark_label_pending, visible_label_changed


def product() -> Product:
    return Product(
        id=1,
        barcode="7790075198934",
        name="Yerba 500 g",
        price=Decimal("2300"),
        weight=Decimal("500"),
        weight_unit="g",
        active=True,
        label_version=3,
        printed_label_version=3,
    )


def test_new_product_is_pending() -> None:
    new_product = Product(
        barcode="123",
        name="Nuevo",
        price=Decimal("100"),
    )

    assert new_product.printed is False


def test_visible_change_marks_current_version_pending() -> None:
    current = product()

    assert visible_label_changed(current, {"price": Decimal("2500")}) is True
    mark_label_pending(current)

    assert current.label_version == 4
    assert current.printed_label_version is None
    assert current.printed is False


def test_internal_change_does_not_change_label_state() -> None:
    current = product()

    assert visible_label_changed(current, {"active": False}) is False
    assert current.label_version == 3
    assert current.printed_label_version == 3
