from datetime import datetime
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

    rows = parse_excel_rows(path.read_bytes(), path.name)

    assert len(rows) == 2
    assert rows[0]["barcode"] == "111"
    assert rows[0]["price"] == 12.5
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

    rows = parse_excel_rows(path.read_bytes(), path.name)

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

    rows = parse_excel_rows(path.read_bytes(), path.name)

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

    rows = parse_excel_rows(path.read_bytes(), path.name)

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
"""Pruebas del adaptador de importación.

IMPORTANCIA: documentan y protegen el contrato observable del parser.
PATRÓN: cada prueba sigue Arrange–Act–Assert. Esto es una estructura de tests,
no una solución del dominio; los ejemplos y el alias `fecha` sí son específicos.
"""
