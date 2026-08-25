"""Adaptador que transforma archivos tabulares en datos del dominio.

IMPORTANCIA: aísla pandas, Excel/CSV y sus formatos irregulares del controlador.
PATRÓN / SOLID: es un Adapter de entrada y aplica SRP. Las funciones de coerción
son pequeñas y puras, por lo que pueden probarse o reemplazarse aisladamente.
SOLUCIÓN ESPECÍFICA: alias de columnas, fechas `dayfirst` y filas inválidas.
La rama CSV/Excel es un condicional simple, no una implementación de Strategy.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import pandas as pd


def _normalize_header(value: Any) -> str:
    if value is None:
        return ""

    text = str(value).strip().lower()
    return "".join(ch for ch in text if ch.isalnum())


def _find_column(columns: list[str], aliases: tuple[str, ...]) -> str | None:
    normalized_columns = {_normalize_header(column): column for column in columns}

    for alias in aliases:
        if alias in normalized_columns:
            return normalized_columns[alias]

    return None


def _coerce_text(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip()
    return text or None


def _coerce_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None

    if isinstance(value, Decimal):
        return value

    if isinstance(value, (int, float)):
        return Decimal(str(value))

    text = str(value).strip().replace(".", "", 1).replace(",", ".")
    if not text:
        return None

    try:
        return Decimal(text)
    except Exception:
        return None


def _coerce_datetime(value: Any) -> datetime | None:
    if value is None or pd.isna(value):
        return None

    try:
        timestamp = pd.to_datetime(value, dayfirst=True)
    except (TypeError, ValueError):
        return None

    parsed = (
        timestamp.to_pydatetime()
        if hasattr(timestamp, "to_pydatetime")
        else timestamp
    )
    if not isinstance(parsed, datetime):
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_excel_rows(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    if not file_bytes:
        raise ValueError("El archivo está vacío")

    if filename.lower().endswith(".csv"):
        dataframe = pd.read_csv(io.BytesIO(file_bytes))
    else:
        dataframe = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")

    if dataframe.empty:
        return []

    columns = list(dataframe.columns)
    barcode_column = _find_column(
        columns,
        ("barcode", "codigobarras", "codigodebarras", "codigo", "codigo_barra"),
    )
    name_column = _find_column(
        columns,
        ("name", "nombre", "producto", "descripcion", "descripcionproducto"),
    )
    price_column = _find_column(columns, ("price", "precio", "valor", "importe"))

    last_updated_column = _find_column(
        columns,
        ("lastupdated", "fecha", "ultimaactualizacion"),
    )
    if not name_column or not price_column:
        raise ValueError("El archivo debe incluir columnas de nombre y precio.")

    rows: list[dict[str, Any]] = []

    for _, row in dataframe.iterrows():
        barcode = _coerce_text(row[barcode_column] if barcode_column else None)
        if not barcode:
            barcode = _coerce_text(row.iloc[0])

        name = _coerce_text(row[name_column])
        if not name:
            continue

        price = _coerce_decimal(row[price_column])
        if price is None or price <= 0:
            continue

        last_updated = (
            _coerce_datetime(row[last_updated_column])
            if last_updated_column
            else datetime.now(timezone.utc)
        )

        rows.append(
            {
                "barcode": barcode or "",
                "name": name,
                "price": price,
                "last_updated": last_updated or datetime.now(timezone.utc),
                "active": True,
            }
        )

    return rows
