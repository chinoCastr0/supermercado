"""Validación Pydantic del alta y actualización; no ejercita transporte HTTP."""
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
        ProductUpdate(expected_revision=1, weight=500)


def test_weight_rejects_more_than_two_decimal_places() -> None:
    """Regresión A03: 0.001 no debe truncarse en silencio a 0.00 al persistir."""
    with pytest.raises(ValidationError, match="2 decimal"):
        ProductCreate(
            barcode="7791234567890",
            name="Producto",
            price=100,
            weight="0.001",
            weight_unit="kg",
        )


@pytest.mark.parametrize("field", ["barcode", "name", "price", "active"])
def test_update_rejects_explicit_null_on_required_fields(field: str) -> None:
    """Regresión A08: un null explícito no debe llegar a un IntegrityError genérico."""
    with pytest.raises(ValidationError, match="no puede ser nulo"):
        ProductUpdate(expected_revision=1, **{field: None})


def test_create_trims_surrounding_whitespace_from_barcode_and_name() -> None:
    """Regresión A09: evita que ' 001 ' y '001' coexistan como productos distintos."""
    product = ProductCreate(
        barcode="  7791234567890  ",
        name="  Café molido  ",
        price=100,
    )

    assert product.barcode == "7791234567890"
    assert product.name == "Café molido"
