from dataclasses import dataclass, replace
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import struct

import pytest

from app.services.register_export import (
    RECORD_COUNT,
    RECORD_SIZE,
    RegisterExportError,
    build_presur_file,
)


@dataclass
class ProductStub:
    id: int
    barcode: str
    name: str
    price: Decimal
    weight: Decimal | None = None
    weight_unit: str | None = None
    label_version: int = 1
    printed_label_version: int | None = None
    printed_at: datetime | None = None


def test_builds_exact_fixed_width_reference_format() -> None:
    product = ProductStub(42, "7791234567890", "CAFÉ MOLIDO EXTRA LARGO", Decimal("1520.50"))

    result = build_presur_file([product])
    first = result[:RECORD_SIZE]

    assert len(result) == RECORD_COUNT * RECORD_SIZE == 1_160_000
    assert struct.unpack("<H", first[0:2]) == (42,)
    assert struct.unpack("<f", first[2:6]) == pytest.approx((1520.5,))
    assert first[6:25] == "CAFÉ MOLIDO EXTRA".encode("cp1252").ljust(18) + b"\x00"
    assert first[25:41] == b"7791234567890  \x00"
    assert first[41:58] == (b"\x00" * 8) + (b" " * 8) + b"\x00"


def test_orders_barcodes_descending_and_fills_unused_plus() -> None:
    products = [
        ProductStub(7, "111", "Primero", Decimal("10")),
        ProductStub(2, "999", "Último", Decimal("20")),
    ]

    result = build_presur_file(products)
    first = result[:RECORD_SIZE]
    second = result[RECORD_SIZE : RECORD_SIZE * 2]
    placeholder = result[RECORD_SIZE * 2 : RECORD_SIZE * 3]

    assert struct.unpack("<H", first[:2]) == (2,)
    assert first[25:40].rstrip() == b"999"
    assert struct.unpack("<H", second[:2]) == (7,)
    assert second[25:40].rstrip() == b"111"
    assert struct.unpack("<H", placeholder[:2]) == (0,)
    assert placeholder[6:24].rstrip() == b"aaa"


def test_rejects_barcode_that_does_not_fit_register_field() -> None:
    product = ProductStub(1, "1234567890123456", "Producto", Decimal("10"))

    with pytest.raises(RegisterExportError, match="15 bytes"):
        build_presur_file([product])


def test_rejects_characters_outside_cp1252() -> None:
    product = ProductStub(1, "123", "Producto 🛒", Decimal("10"))

    with pytest.raises(RegisterExportError, match="no compatibles"):
        build_presur_file([product])


def test_weight_never_changes_presur_file() -> None:
    product = ProductStub(15, "7791234567890", "Leche", Decimal("1500"))
    with_weight = replace(product, weight=Decimal("750"), weight_unit="ml")

    assert build_presur_file([product]) == build_presur_file([with_weight])


def test_label_print_state_never_changes_presur_file() -> None:
    product = ProductStub(15, "7791234567890", "Leche", Decimal("1500"))
    printed = replace(
        product,
        label_version=7,
        printed_label_version=7,
        printed_at=datetime.now(timezone.utc),
    )

    assert build_presur_file([product]) == build_presur_file([printed])


def test_price_1234_56_round_trips_through_register_format_to_same_cents() -> None:
    product = ProductStub(16, "TRACE-1234", "Trazabilidad", Decimal("1234.56"))

    result = build_presur_file([product])
    exported = Decimal(str(struct.unpack("<f", result[2:6])[0])).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    assert product.price == Decimal("1234.56")
    assert exported == Decimal("1234.56")


def test_rejects_register_price_that_cannot_preserve_exact_cents() -> None:
    product = ProductStub(
        17,
        "TRACE-HIGH",
        "Precio alto",
        Decimal("9999999999.99"),
    )

    with pytest.raises(RegisterExportError, match="centavos exactos"):
        build_presur_file([product])
