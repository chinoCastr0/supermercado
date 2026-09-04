"""Parsing and validation helpers for exact monetary values."""

from decimal import Decimal, InvalidOperation
import re
from typing import Any


CENT = Decimal("0.01")
MONEY_MAX_DIGITS = 12
_PLAIN_NUMBER = re.compile(r"^\d+(?:[.,]\d+)?$")
_GROUPED_INTEGER = re.compile(r"^\d{1,3}(?:[.,]\d{3})+$")


def _canonical_money_text(value: str) -> str:
    """Return an unambiguous dot-decimal representation.

    A single separator followed by one or two digits is decimal. A repeated
    separator, or a single separator followed by exactly three digits, is a
    thousands separator. When both separators exist, the rightmost one is the
    decimal separator. These rules accept both ``1234.56`` and ``1.234,56``
    without silently turning cents into integer pesos.
    """

    text = value.strip()
    if not text or not all(
        character.isdigit() or character in ".," for character in text
    ):
        raise ValueError("El precio debe ser un número decimal válido")

    dot_count = text.count(".")
    comma_count = text.count(",")
    if dot_count and comma_count:
        decimal_separator = "." if text.rfind(".") > text.rfind(",") else ","
        thousands_separator = "," if decimal_separator == "." else "."
        integer_part, fractional_part = text.rsplit(decimal_separator, 1)
        if not fractional_part or len(fractional_part) > 2:
            raise ValueError("El precio admite como máximo dos decimales")
        if thousands_separator in integer_part:
            if not _GROUPED_INTEGER.fullmatch(integer_part):
                raise ValueError("El precio tiene separadores de miles inválidos")
            integer_part = integer_part.replace(thousands_separator, "")
        elif not integer_part.isdigit():
            raise ValueError("El precio debe ser un número decimal válido")
        return f"{integer_part}.{fractional_part}"

    separator = "." if dot_count else "," if comma_count else None
    if separator is None:
        if not text.isdigit():
            raise ValueError("El precio debe ser un número decimal válido")
        return text

    if text.count(separator) > 1:
        if not _GROUPED_INTEGER.fullmatch(text):
            raise ValueError("El precio tiene separadores inválidos")
        return text.replace(separator, "")

    if not _PLAIN_NUMBER.fullmatch(text):
        raise ValueError("El precio debe ser un número decimal válido")
    integer_part, fractional_part = text.split(separator)
    if len(fractional_part) <= 2:
        return f"{integer_part}.{fractional_part}"
    if (
        len(fractional_part) == 3
        and 1 <= len(integer_part) <= 3
        and integer_part != "0"
    ):
        return f"{integer_part}{fractional_part}"
    raise ValueError("El precio admite como máximo dos decimales")


def parse_money(value: Any) -> Decimal:
    """Parse supported API/import values and preserve exactly two cents digits."""

    if isinstance(value, bool) or value is None:
        raise ValueError("El precio debe ser un número decimal válido")
    if isinstance(value, Decimal):
        decimal_value = value
    elif isinstance(value, int):
        decimal_value = Decimal(value)
    elif isinstance(value, float):
        # Spreadsheet readers expose numeric cells as floats. Using their
        # shortest decimal string avoids importing the binary expansion.
        decimal_value = Decimal(str(value))
    elif isinstance(value, str):
        try:
            decimal_value = Decimal(_canonical_money_text(value))
        except InvalidOperation as exc:
            raise ValueError("El precio debe ser un número decimal válido") from exc
    else:
        raise ValueError("El precio debe ser un número decimal válido")

    if not decimal_value.is_finite():
        raise ValueError("El precio debe ser un número decimal finito")
    if decimal_value.as_tuple().exponent < -2:
        raise ValueError("El precio admite como máximo dos decimales")

    normalized = decimal_value.quantize(CENT)
    if len(normalized.as_tuple().digits) > MONEY_MAX_DIGITS:
        raise ValueError("El precio supera el máximo de 12 dígitos")
    return normalized
