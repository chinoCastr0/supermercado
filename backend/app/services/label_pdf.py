"""Cálculos y generación PDF para carteles de góndola A4 3 × 8."""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
import math
from typing import Protocol

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import createBarcodeDrawing
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


LABELS_PER_PAGE = 24
GRID_COLUMNS = 3
GRID_ROWS = 8
PRICE_MAX_FONT_SIZE = 33
PRICE_BASELINE_FROM_TOP = 48
BARCODE_HEIGHT = 9 * mm
VISIBLE_LABEL_FIELDS = frozenset({"barcode", "name", "price", "weight", "weight_unit"})


class LabelProduct(Protocol):
    """Interfaz estructural de lectura: el renderizador no necesita modelos ORM."""
    id: int
    barcode: str
    name: str
    price: Decimal
    weight: Decimal | None
    weight_unit: str | None


@dataclass(frozen=True)
class LabelProductSnapshot:
    """Immutable values used to create and later reprint one label."""

    id: int
    barcode: str
    name: str
    price: Decimal
    weight: Decimal | None
    weight_unit: str | None


@dataclass(frozen=True)
class ComparablePrice:
    """Precio normalizado por kilo, litro o unidad y su leyenda."""
    label: str
    price: Decimal


@dataclass(frozen=True)
class LabelWarning:
    """Producto omitido y causa para informar al operador."""
    product_id: int
    product_name: str
    reason: str


@dataclass(frozen=True)
class LabelPdfResult:
    """Bytes generados, orden efectivo de productos y exclusiones del lote."""
    content: bytes
    generated_product_ids: list[int]
    warnings: list[LabelWarning]


def calculate_comparable_price(
    price: Decimal,
    weight: Decimal | None,
    unit: str | None,
) -> ComparablePrice | None:
    """Normaliza el precio a kilogramo, litro o unidad."""
    if weight is None or weight <= 0 or unit is None or price <= 0:
        return None

    if unit == "g":
        comparable = price * Decimal(1000) / weight
        label = "1 KG"
    elif unit == "kg":
        comparable = price / weight
        label = "1 KG"
    elif unit == "ml":
        comparable = price * Decimal(1000) / weight
        label = "1 L"
    elif unit == "l":
        comparable = price / weight
        label = "1 L"
    elif unit == "u":
        comparable = price / weight
        label = "1 UN"
    else:
        return None

    return ComparablePrice(
        label=label,
        price=comparable.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
    )


def format_ars(value: Decimal, *, keep_cents: bool = True) -> str:
    """Formatea pesos argentinos sin depender del locale del servidor."""
    rounded = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    integer, cents = f"{rounded:,.2f}".split(".")
    integer = integer.replace(",", ".")
    if not keep_cents and cents == "00":
        return f"$ {integer}"
    return f"$ {integer},{cents}"


def format_presentation(weight: Decimal | None, unit: str | None) -> str:
    """Presenta cantidad sin ceros decimales innecesarios y unidad visible."""
    if weight is None or unit is None:
        return ""
    display_weight = weight.normalize()
    number = format(display_weight, "f").replace(".", ",")
    unit_label = "UN" if unit == "u" else unit.upper()
    return f"{number} {unit_label}"


def _ean_checksum(payload: str) -> int:
    """Calcula el dígito verificador EAN alternando pesos desde la derecha."""
    total = sum(
        int(digit) * (3 if (len(payload) - index) % 2 == 1 else 1)
        for index, digit in enumerate(payload)
    )
    return (10 - (total % 10)) % 10


def barcode_spec(value: str) -> tuple[str, str] | None:
    """Elige EAN cuando el checksum es válido y Code128 para otros ASCII."""
    barcode = value.strip()
    if len(barcode) == 13 and barcode.isdigit():
        if _ean_checksum(barcode[:12]) == int(barcode[-1]):
            return "EAN13", barcode[:12]
    if len(barcode) == 8 and barcode.isdigit():
        if _ean_checksum(barcode[:7]) == int(barcode[-1]):
            return "EAN8", barcode[:7]
    try:
        barcode.encode("ascii")
    except UnicodeEncodeError:
        return None
    if not barcode or len(barcode) > 32 or any(ord(char) < 32 for char in barcode):
        return None
    return "Code128", barcode


def _fit_font_size(text: str, font: str, maximum: float, width: float) -> float:
    """Reduce la fuente hasta el mínimo; textos extremos todavía pueden exceder el ancho."""
    size = maximum
    while size > 5.5 and pdfmetrics.stringWidth(text, font, size) > width:
        size -= 0.25
    return size


def _fit_text(
    text: str,
    font: str,
    maximum_size: float,
    width: float,
) -> tuple[str, float]:
    """Ajusta fuente y luego agrega puntos suspensivos si el nombre no entra."""
    size = _fit_font_size(text, font, maximum_size, width)
    if pdfmetrics.stringWidth(text, font, size) <= width:
        return text, size

    suffix = "..."
    trimmed = text
    while trimmed and pdfmetrics.stringWidth(
        f"{trimmed}{suffix}", font, size
    ) > width:
        trimmed = trimmed[:-1]
    return f"{trimmed.rstrip()}{suffix}", size


def _draw_label(
    pdf: canvas.Canvas,
    product: LabelProduct,
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    """Dibuja una celda con recorte; guarda y restaura el estado gráfico."""
    padding = 5
    pdf.saveState()
    clip = pdf.beginPath()
    clip.rect(x, y, width, height)
    pdf.clipPath(clip, stroke=0, fill=0)

    pdf.setStrokeColorRGB(0, 0, 0)
    pdf.setLineWidth(0.45)
    pdf.rect(x, y, width, height, stroke=1, fill=0)

    presentation = format_presentation(product.weight, product.weight_unit)
    presentation_width = (
        pdfmetrics.stringWidth(presentation, "Helvetica-Bold", 7.5)
        if presentation
        else 0
    )
    if presentation:
        pdf.setFont("Helvetica-Bold", 7.5)
        pdf.drawRightString(x + width - padding, y + height - 10, presentation)

    name_width = width - (padding * 2) - presentation_width - (5 if presentation else 0)
    name = product.name.strip().upper()
    fitted_name, name_size = _fit_text(
        name,
        "Helvetica-Bold",
        8.5,
        name_width,
    )
    pdf.setFont("Helvetica-Bold", name_size)
    pdf.drawString(x + padding, y + height - 10, fitted_name)

    price_text = format_ars(Decimal(product.price), keep_cents=True)
    price_size = _fit_font_size(
        price_text,
        "Helvetica-Bold",
        PRICE_MAX_FONT_SIZE,
        width - 12,
    )
    pdf.setFont("Helvetica-Bold", price_size)
    pdf.drawCentredString(
        x + width / 2,
        y + height - PRICE_BASELINE_FROM_TOP,
        price_text,
    )

    comparable = calculate_comparable_price(
        Decimal(product.price),
        product.weight,
        product.weight_unit,
    )
    if comparable:
        comparable_text = (
            f"{comparable.label} {format_ars(comparable.price, keep_cents=True)}"
        )
        comparable_size = _fit_font_size(
            comparable_text,
            "Helvetica-Bold",
            8.2,
            width * 0.46,
        )
        pdf.setFont("Helvetica-Bold", comparable_size)
        pdf.drawRightString(
            x + width - padding,
            y + 25,
            comparable_text,
        )

    kind, barcode_value = barcode_spec(product.barcode) or ("Code128", "")
    if barcode_value:
        drawing = createBarcodeDrawing(
            kind,
            value=barcode_value,
            barHeight=BARCODE_HEIGHT,
            humanReadable=False,
            quiet=True,
        )
        maximum_width = width * 0.52
        horizontal_scale = min(1.0, maximum_width / drawing.width)
        vertical_scale = BARCODE_HEIGHT / drawing.height
        pdf.saveState()
        pdf.translate(x + padding, y + 14)
        # El ancho puede comprimirse para entrar en la celda, pero el alto se
        # normaliza de manera independiente para ser idéntico en cada etiqueta.
        pdf.scale(horizontal_scale, vertical_scale)
        renderPDF.draw(drawing, pdf, 0, 0)
        pdf.restoreState()

        barcode_font = _fit_font_size(
            product.barcode,
            "Helvetica",
            6.2,
            width * 0.52,
        )
        pdf.setFont("Helvetica", barcode_font)
        pdf.drawString(x + padding, y + 6, product.barcode)

    pdf.setFont("Helvetica-Bold", 6.4)
    pdf.drawRightString(x + width - padding, y + 6, f"cod:{product.id}")
    pdf.restoreState()


def build_labels_pdf(products: list[LabelProduct]) -> LabelPdfResult:
    """Genera un A4 vertical con matriz fija de 3 × 8 por página."""
    valid_products: list[LabelProduct] = []
    warnings: list[LabelWarning] = []
    for product in products:
        if barcode_spec(product.barcode) is None:
            warnings.append(
                LabelWarning(
                    product_id=product.id,
                    product_name=product.name,
                    reason="Código de barras inválido o no representable.",
                )
            )
            continue
        valid_products.append(product)

    if not valid_products:
        return LabelPdfResult(b"", [], warnings)

    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4, pageCompression=1, invariant=1)
    page_width, page_height = A4
    margin_x = 7 * mm
    margin_y = 7 * mm
    cell_width = (page_width - margin_x * 2) / GRID_COLUMNS
    cell_height = (page_height - margin_y * 2) / GRID_ROWS
    page_count = math.ceil(len(valid_products) / LABELS_PER_PAGE)

    pdf.setTitle("Carteles de precios")
    pdf.setAuthor("Sistema Supermercado")
    for page_index in range(page_count):
        page_products = valid_products[
            page_index * LABELS_PER_PAGE : (page_index + 1) * LABELS_PER_PAGE
        ]
        for position in range(LABELS_PER_PAGE):
            row = position // GRID_COLUMNS
            column = position % GRID_COLUMNS
            x = margin_x + column * cell_width
            y = page_height - margin_y - (row + 1) * cell_height
            if position < len(page_products):
                _draw_label(pdf, page_products[position], x, y, cell_width, cell_height)
            else:
                pdf.setLineWidth(0.45)
                pdf.rect(x, y, cell_width, cell_height, stroke=1, fill=0)
        pdf.showPage()
    pdf.save()

    return LabelPdfResult(
        content=output.getvalue(),
        generated_product_ids=[product.id for product in valid_products],
        warnings=warnings,
    )
