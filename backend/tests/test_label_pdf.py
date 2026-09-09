"""Contenido, geometría y paginación PDF con productos sintéticos."""
from dataclasses import dataclass
from decimal import Decimal
from io import BytesIO

import pytest
import pymupdf
from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm

from app.services.label_pdf import (
    BARCODE_HEIGHT,
    LABELS_PER_PAGE,
    PRICE_BASELINE_FROM_TOP,
    PRICE_MAX_FONT_SIZE,
    barcode_spec,
    build_labels_pdf,
    calculate_comparable_price,
    format_ars,
)


@dataclass
class LabelProductStub:
    id: int
    barcode: str
    name: str
    price: Decimal
    weight: Decimal | None
    weight_unit: str | None


@pytest.mark.parametrize(
    ("price", "weight", "unit", "expected_label", "expected_price"),
    [
        ("2300", "500", "g", "1 KG", "4600.00"),
        ("1400", "900", "ml", "1 L", "1555.56"),
        ("7600", "1.5", "l", "1 L", "5066.67"),
        ("4000", "1", "kg", "1 KG", "4000.00"),
        ("1200", "6", "u", "1 UN", "200.00"),
    ],
)
def test_calculates_comparable_prices(
    price: str,
    weight: str,
    unit: str,
    expected_label: str,
    expected_price: str,
) -> None:
    result = calculate_comparable_price(
        Decimal(price),
        Decimal(weight),
        unit,
    )

    assert result is not None
    assert result.label == expected_label
    assert result.price == Decimal(expected_price)


def test_comparable_price_handles_missing_or_invalid_data() -> None:
    assert calculate_comparable_price(Decimal("10"), None, None) is None
    assert calculate_comparable_price(Decimal("10"), Decimal("0"), "g") is None
    assert calculate_comparable_price(Decimal("10"), Decimal("1"), "oz") is None
    assert format_ars(Decimal("1555.555")) == "$ 1.555,56"


def test_label_visual_constants_keep_price_large_and_barcode_compact() -> None:
    assert PRICE_MAX_FONT_SIZE == 33
    assert PRICE_BASELINE_FROM_TOP == 48
    assert BARCODE_HEIGHT == pytest.approx(9 * 72 / 25.4)


def test_recognizes_ean_and_falls_back_to_code128() -> None:
    assert barcode_spec("4006381333931") == ("EAN13", "400638133393")
    assert barcode_spec("96385074") == ("EAN8", "9638507")
    assert barcode_spec("ABC-123") == ("Code128", "ABC-123")
    assert barcode_spec("Código") is None


def test_pdf_is_a4_portrait_and_paginates_every_24_labels() -> None:
    products = [
        LabelProductStub(
            id=index,
            barcode=f"TEST-{index:04d}",
            name=f"Producto de prueba {index}",
            price=Decimal("2300") + index,
            weight=Decimal("500"),
            weight_unit="g",
        )
        for index in range(1, LABELS_PER_PAGE + 2)
    ]

    result = build_labels_pdf(products)
    reader = PdfReader(BytesIO(result.content))

    assert len(result.generated_product_ids) == 25
    assert len(reader.pages) == 2
    for page in reader.pages:
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        assert width == pytest.approx(A4[0], abs=0.1)
        assert height == pytest.approx(A4[1], abs=0.1)
        assert height > width
    assert "TEST-0001" in (reader.pages[0].extract_text() or "")
    assert "TEST-0025" in (reader.pages[1].extract_text() or "")


def test_invalid_barcode_is_skipped_without_blocking_other_labels() -> None:
    products = [
        LabelProductStub(1, "VALID-1", "Válido", Decimal("100"), None, None),
        LabelProductStub(2, "Inválido🛒", "Inválido", Decimal("200"), None, None),
    ]

    result = build_labels_pdf(products)

    assert result.generated_product_ids == [1]
    assert [warning.product_id for warning in result.warnings] == [2]


@pytest.mark.parametrize(
    ("price", "expected"),
    [
        ("10", "$ 10,00"),
        ("10.50", "$ 10,50"),
        ("1234.56", "$ 1.234,56"),
        ("9999999999.99", "$ 9.999.999.999,99"),
    ],
)
def test_pdf_prints_the_persisted_price_with_two_cents(
    price: str,
    expected: str,
) -> None:
    product = LabelProductStub(
        1,
        "TRACE-PRICE",
        "Precio persistido",
        Decimal(price),
        None,
        None,
    )

    result = build_labels_pdf([product])
    text = PdfReader(BytesIO(result.content)).pages[0].extract_text() or ""

    assert expected in text


def test_prices_are_inside_their_cells_without_overlapping_product_names() -> None:
    cases = [
        ("10", "$ 10,00"),
        ("10.50", "$ 10,50"),
        ("1234.56", "$ 1.234,56"),
        ("9999999999.99", "$ 9.999.999.999,99"),
    ]
    products = [
        LabelProductStub(
            index,
            f"VISUAL-{index}",
            f"Producto {index}",
            Decimal(price),
            None,
            None,
        )
        for index, (price, _) in enumerate(cases, start=1)
    ]

    result = build_labels_pdf(products)
    document = pymupdf.open(stream=result.content, filetype="pdf")
    page = document[0]
    margin = 7 * mm
    cell_width = (A4[0] - margin * 2) / 3
    cell_height = (A4[1] - margin * 2) / 8

    for position, (_, expected_price) in enumerate(cases):
        row, column = divmod(position, 3)
        cell = pymupdf.Rect(
            margin + column * cell_width,
            margin + row * cell_height,
            margin + (column + 1) * cell_width,
            margin + (row + 1) * cell_height,
        )
        price_rects = page.search_for(expected_price)
        name_rects = page.search_for(f"PRODUCTO {position + 1}")

        assert len(price_rects) == 1
        assert len(name_rects) == 1
        assert cell.contains(price_rects[0])
        assert not price_rects[0].intersects(name_rects[0])
