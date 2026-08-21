from datetime import datetime
from pathlib import Path

import pandas as pd

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
    assert isinstance(rows[0]["last_updated"], datetime)


def test_parse_excel_rows_accepts_fecha_alias(tmp_path: Path) -> None:
    path = tmp_path / "products.xlsx"
    dataframe = pd.DataFrame(
        [{"barcode": "111", "name": "Leche", "price": 12.5, "fecha": "14/08/2026 18:30"}]
    )
    dataframe.to_excel(path, index=False, engine="openpyxl")

    rows = parse_excel_rows(path.read_bytes(), path.name)

    assert rows[0]["last_updated"].isoformat() == "2026-08-14T18:30:00+00:00"
