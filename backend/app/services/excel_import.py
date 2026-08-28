"""Adaptador que transforma archivos tabulares en datos del dominio.

IMPORTANCIA: aísla pandas, Excel/CSV y sus formatos irregulares del controlador.
PATRÓN / SOLID: es un Adapter de entrada y aplica SRP. Las funciones de coerción
son pequeñas y puras, por lo que pueden probarse o reemplazarse aisladamente.
SOLUCIÓN ESPECÍFICA: alias de columnas, fechas `dayfirst` y filas inválidas.
La rama CSV/Excel es un condicional simple, no una implementación de Strategy.
"""

from __future__ import annotations

import io
import math
import re
from datetime import datetime, timezone
from decimal import Decimal
from numbers import Integral, Real
from typing import Any

import pandas as pd


WEIGHT_PATTERN = re.compile(
    r"^\s*(\d+(?:[.,]\d+)?)\s*"
    r"(kg|kilos?|kilogramos?|g|gr|gramos?|ml|mililitros?|l|litros?|u|un|unidades?)?\s*$",
    re.IGNORECASE,
)


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
    if value is None or pd.isna(value):
        return None

    text = str(value).strip()
    return text or None


def _coerce_barcode(value: Any) -> str | None:
    """Conserva identificadores numéricos sin agregarles un sufijo `.0`."""
    if value is None or pd.isna(value):
        return None
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, Integral):
        return str(value)
    if isinstance(value, Decimal) and value == value.to_integral_value():
        return str(int(value))
    if isinstance(value, Real):
        numeric = float(value)
        if math.isfinite(numeric) and numeric.is_integer():
            return str(int(numeric))
    return _coerce_text(value)


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


def _normalize_weight_unit(value: Any) -> str | None:
    text = _coerce_text(value)
    if text is None:
        return None
    normalized = text.lower().replace(".", "")
    if normalized in {"g", "gr", "gramo", "gramos"}:
        return "g"
    if normalized in {"kg", "kilo", "kilos", "kilogramo", "kilogramos"}:
        return "kg"
    if normalized in {"ml", "mililitro", "mililitros"}:
        return "ml"
    if normalized in {"l", "litro", "litros"}:
        return "l"
    if normalized in {"u", "un", "unidad", "unidades"}:
        return "u"
    raise ValueError(
        f'Unidad de peso inválida: "{text}". Use g, kg, ml, l o u.'
    )


def _coerce_weight(value: Any, unit_value: Any) -> tuple[Decimal | None, str | None]:
    if value is None or pd.isna(value):
        if _coerce_text(unit_value) is not None:
            raise ValueError("Hay una unidad informada sin peso.")
        return None, None

    if isinstance(value, (int, float, Decimal)):
        weight = Decimal(str(value))
        unit = _normalize_weight_unit(unit_value) or "g"
    else:
        match = WEIGHT_PATTERN.fullmatch(str(value))
        if match is None:
            raise ValueError(f'Peso inválido: "{value}".')
        weight = Decimal(match.group(1).replace(",", "."))
        unit = _normalize_weight_unit(unit_value or match.group(2)) or "g"

    if weight <= 0:
        raise ValueError("El peso debe ser mayor que cero.")
    return weight, unit


def parse_excel_rows(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    if not file_bytes:
        raise ValueError("El archivo está vacío")

    if filename.lower().endswith(".csv"):
        dataframe = pd.read_csv(io.BytesIO(file_bytes), dtype=object)
    else:
        # `dtype=object` evita que pandas convierta una columna de códigos con
        # celdas vacías a float (por ejemplo, `90435225` -> `90435225.0`).
        dataframe = pd.read_excel(
            io.BytesIO(file_bytes),
            engine="openpyxl",
            dtype=object,
        )

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
    weight_column = _find_column(
        columns,
        ("weight", "peso", "contenido", "cantidad"),
    )
    weight_unit_column = _find_column(
        columns,
        ("weightunit", "unidad", "unidadmedida", "unidadpeso"),
    )

    last_updated_column = _find_column(
        columns,
        ("lastupdated", "fecha", "ultimaactualizacion"),
    )
    if not name_column or not price_column:
        raise ValueError("El archivo debe incluir columnas de nombre y precio.")

    rows: list[dict[str, Any]] = []

    for row_index, row in dataframe.iterrows():
        barcode = _coerce_barcode(
            row[barcode_column] if barcode_column else None
        )
        if not barcode:
            barcode = _coerce_barcode(row.iloc[0])

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
        weight_fields: dict[str, Decimal | str | None] = {}
        if weight_column or weight_unit_column:
            try:
                weight, weight_unit = _coerce_weight(
                    row[weight_column] if weight_column else None,
                    row[weight_unit_column] if weight_unit_column else None,
                )
            except ValueError as exc:
                raise ValueError(f"Fila {row_index + 2}: {exc}") from exc
            weight_fields = {"weight": weight, "weight_unit": weight_unit}

        rows.append(
            {
                "barcode": barcode or "",
                "name": name,
                "price": price,
                "last_updated": last_updated or datetime.now(timezone.utc),
                "active": True,
                **weight_fields,
            }
        )

    return rows
