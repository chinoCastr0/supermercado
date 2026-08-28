import pytest
from pydantic import ValidationError

from app.schemas.product import ProductCreate, ProductUpdate


def test_create_accepts_register_compatible_text() -> None:
    product = ProductCreate(
        barcode="7791234567890",
        name="CAFÉ MOLIDO",
        price=1500,
    )

    assert product.name == "CAFÉ MOLIDO"


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"name": "X" * 19}, "18 bytes"),
        ({"barcode": "1" * 16}, "15 bytes"),
        ({"name": "Producto 🛒"}, "incompatibles"),
    ],
)
def test_create_rejects_values_incompatible_with_register(
    payload: dict[str, str],
    message: str,
) -> None:
    values = {
        "barcode": "7791234567890",
        "name": "Producto",
        "price": 100,
        **payload,
    }

    with pytest.raises(ValidationError, match=message):
        ProductCreate(**values)


def test_update_applies_same_register_limits() -> None:
    with pytest.raises(ValidationError, match="15 bytes"):
        ProductUpdate(barcode="1" * 16)


def test_weight_requires_supported_unit() -> None:
    product = ProductCreate(
        barcode="7791234567890",
        name="Leche",
        price=1500,
        weight=750,
        weight_unit="ml",
    )

    assert product.weight == 750
    assert product.weight_unit == "ml"

    with pytest.raises(ValidationError, match="deben informarse juntos"):
        ProductUpdate(weight=500)
