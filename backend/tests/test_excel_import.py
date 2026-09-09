"""Casos del parser CSV/XLSX: alias, códigos textuales, fechas y medidas."""
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pandas as pd
import pytest

from app.services.excel_import import parse_excel_rows


def test_parse_excel_rows_from_simple_dataframe(tmp_path: Path) -> None:
    path = tmp_path / "products.xlsx"
    dataframe = pd.DataFrame(
        [
            {"barcode": "111", "name": "Leche", "price": 12.5},
            {"barcode": "222", "name": "Arroz", "price": 1500},
        ]
    )
    dataframe.to_excel(path, index=False, engine="openpyxl")

    parsed = parse_excel_rows(path.read_bytes(), path.name)
    rows = parsed.rows

    assert len(rows) == 2
    assert parsed.skipped == []
    assert rows[0]["barcode"] == "111"
    assert rows[0]["price"] == Decimal("12.50")
    assert rows[1]["name"] == "Arroz"
    assert "weight" not in rows[0]
    assert isinstance(rows[0]["last_updated"], datetime)


def test_preserves_text_barcodes_when_column_contains_empty_cells(
    tmp_path: Path,
) -> None:
    path = tmp_path / "products.xlsx"
    dataframe = pd.DataFrame(
        [
            {"barcode": "90435225", "name": "Energizante", "price": 4000},
            {
                "barcode": "9002490288341",
                "name": "Energizante 2",
                "price": 3400,
            },
            {"barcode": None, "name": "Sin código", "price": 1000},
        ]
    )
    dataframe.to_excel(path, index=False, engine="openpyxl")

    parsed = parse_excel_rows(path.read_bytes(), path.name)
    rows = parsed.rows

    assert rows[0]["barcode"] == "90435225"
    assert rows[1]["barcode"] == "9002490288341"
    assert not rows[0]["barcode"].endswith(".0")


def test_parse_excel_rows_accepts_fecha_alias(tmp_path: Path) -> None:
    path = tmp_path / "products.xlsx"
    dataframe = pd.DataFrame(
        [
            {
                "barcode": "111",
                "name": "Leche",
                "price": 12.5,
                "fecha": "14/08/2026 18:30",
            }
        ]
    )
    dataframe.to_excel(path, index=False, engine="openpyxl")

    rows = parse_excel_rows(path.read_bytes(), path.name).rows

    assert rows[0]["last_updated"].isoformat() == "2026-08-14T18:30:00+00:00"


def test_parse_excel_rows_accepts_weight_and_unit_columns(tmp_path: Path) -> None:
    path = tmp_path / "products.xlsx"
    dataframe = pd.DataFrame(
        [
            {
                "barcode": "111",
                "name": "Leche",
                "price": 1500,
                "peso": 750,
                "unidad": "ml",
            },
            {
                "barcode": "222",
                "name": "Arroz",
                "price": 1200,
                "peso": "500 g",
            },
        ]
    )
    dataframe.to_excel(path, index=False, engine="openpyxl")

    rows = parse_excel_rows(path.read_bytes(), path.name).rows

    assert rows[0]["weight"] == 750
    assert rows[0]["weight_unit"] == "ml"
    assert rows[1]["weight"] == 500
    assert rows[1]["weight_unit"] == "g"


def test_parse_excel_rows_rejects_invalid_weight_unit(tmp_path: Path) -> None:
    path = tmp_path / "products.xlsx"
    dataframe = pd.DataFrame(
        [
            {
                "barcode": "111",
                "name": "Leche",
                "price": 1500,
                "peso": 1,
                "unidad": "onzas",
            }
        ]
    )
    dataframe.to_excel(path, index=False, engine="openpyxl")

    with pytest.raises(ValueError, match="Fila 2.*Use g, kg, ml, l o u"):
        parse_excel_rows(path.read_bytes(), path.name)


def test_parse_excel_rows_rejects_legacy_xls_with_clear_message() -> None:
    with pytest.raises(ValueError, match=r"Convertí el archivo a \.xlsx o \.csv"):
        parse_excel_rows(b"legacy-excel-content", "productos.xls")


def test_parse_excel_rows_never_fabricates_a_barcode_from_another_column() -> None:
    """Regresión A02: sin columna de código, no debe inventarse desde el nombre."""
    csv = b"name,price\nArroz,100\n"

    parsed = parse_excel_rows(csv, "productos.csv")

    assert len(parsed.rows) == 1
    assert parsed.rows[0]["barcode"] == ""
    assert parsed.rows[0]["barcode"] != "Arroz"
    assert parsed.skipped == []


def test_parse_excel_rows_reports_rows_with_invalid_price_instead_of_dropping_them() -> None:
    """Regresión A02: un precio ilegible se informa, no desaparece en silencio."""
    csv = b"barcode,name,price\n111,Arroz,incorrecto\n"

    parsed = parse_excel_rows(csv, "productos.csv")

    assert parsed.rows == []
    assert len(parsed.skipped) == 1
    assert parsed.skipped[0].row_number == 2
    assert "precio" in parsed.skipped[0].reason


def test_parse_excel_rows_reports_rows_without_a_valid_name() -> None:
    """Regresión A02: un nombre vacío se informa, no desaparece en silencio."""
    csv = "barcode,name,price\n111,,100\n".encode()

    parsed = parse_excel_rows(csv, "productos.csv")

    assert parsed.rows == []
    assert len(parsed.skipped) == 1
    assert "nombre" in parsed.skipped[0].reason
