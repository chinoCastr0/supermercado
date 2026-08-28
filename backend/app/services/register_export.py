"""Serializa el catálogo al formato binario PRESUR1.DAT de la caja."""

from collections.abc import Iterable
from decimal import Decimal
import math
import struct
from typing import Protocol


RECORD_COUNT = 20_000
RECORD_SIZE = 58
NAME_SIZE = 18
BARCODE_SIZE = 15
TEXT_ENCODING = "cp1252"
TRAILER = (b"\x00" * 8) + (b" " * 8) + b"\x00"


class ExportableProduct(Protocol):
    """Campos mínimos que necesita el serializador."""

    id: int
    barcode: str
    name: str
    price: Decimal


class RegisterExportError(ValueError):
    """Indica que el catálogo no puede representarse sin romper el formato."""


def _encode_text(value: str, field: str, product_id: int) -> bytes:
    if any(character in value for character in ("\x00", "\r", "\n", "\t")):
        raise RegisterExportError(
            f"El producto ID {product_id} tiene caracteres de control en {field}."
        )
    try:
        return value.encode(TEXT_ENCODING)
    except UnicodeEncodeError as exc:
        raise RegisterExportError(
            f"El producto ID {product_id} contiene caracteres no compatibles "
            f"con la caja en {field}."
        ) from exc


def _assign_plu(product: ExportableProduct, used: set[int]) -> int:
    """Conserva IDs compatibles como PLU y asigna huecos a IDs más grandes."""
    if 0 <= product.id < RECORD_COUNT and product.id not in used:
        used.add(product.id)
        return product.id

    for candidate in range(RECORD_COUNT):
        if candidate not in used:
            used.add(candidate)
            return candidate

    raise RegisterExportError("No quedan posiciones PLU disponibles.")


def _record(plu: int, price: float, name: bytes, barcode: bytes) -> bytes:
    name_field = name[:NAME_SIZE].ljust(NAME_SIZE, b" ") + b"\x00"
    barcode_field = barcode.ljust(BARCODE_SIZE, b" ") + b"\x00"
    result = struct.pack("<Hf", plu, price) + name_field + barcode_field + TRAILER
    if len(result) != RECORD_SIZE:
        raise AssertionError("El registro PRESUR1 no mide 58 bytes.")
    return result


def build_presur_file(products: Iterable[ExportableProduct]) -> bytes:
    """Construye los 20.000 registros que conforman PRESUR1.DAT."""
    catalog = list(products)
    if len(catalog) > RECORD_COUNT:
        raise RegisterExportError(
            f"La caja admite hasta {RECORD_COUNT} productos activos."
        )

    used_plus: set[int] = set()
    serialized: list[tuple[bytes, bytes]] = []

    for product in sorted(catalog, key=lambda item: item.id):
        barcode_value = product.barcode.strip()
        if not barcode_value:
            raise RegisterExportError(
                f"El producto ID {product.id} no tiene código de barras."
            )

        barcode = _encode_text(barcode_value, "el código de barras", product.id)
        if len(barcode) > BARCODE_SIZE:
            raise RegisterExportError(
                f"El código del producto ID {product.id} supera los "
                f"{BARCODE_SIZE} bytes admitidos por la caja."
            )

        name_value = product.name.strip()
        if not name_value:
            raise RegisterExportError(
                f"El producto ID {product.id} no tiene nombre."
            )
        name = _encode_text(name_value, "el nombre", product.id)
        numeric_price = float(product.price)
        if not math.isfinite(numeric_price) or numeric_price <= 0:
            raise RegisterExportError(
                f"El producto ID {product.id} tiene un precio inválido."
            )

        plu = _assign_plu(product, used_plus)
        serialized.append(
            (barcode, _record(plu, numeric_price, name, barcode))
        )

    # La referencia ordena los códigos de barras de mayor a menor.
    records = [record for _, record in sorted(serialized, reverse=True)]

    placeholder_name = b"aaa"
    for plu in range(RECORD_COUNT):
        if plu not in used_plus:
            records.append(_record(plu, 0.0, placeholder_name, b""))

    result = b"".join(records)
    expected_size = RECORD_COUNT * RECORD_SIZE
    if len(result) != expected_size:
        raise AssertionError("PRESUR1.DAT no tiene el tamaño esperado.")
    return result
