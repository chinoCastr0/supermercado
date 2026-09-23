"""Tickets de oferta sin estado: cuatro cuadrantes por hoja A4 apaisada."""

from io import BytesIO

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import createBarcodeDrawing
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

from app.services.label_pdf import (
    LabelProduct, _fit_font_size, _fit_text, barcode_spec,
    calculate_comparable_price, format_ars, format_presentation,
)


def _draw_ticket(pdf: canvas.Canvas, product: LabelProduct, promo_text: str,
                 x: float, y: float, width: float, height: float) -> None:
    """Compone encabezado, promoción ajustable y pie dentro del cuadrante."""
    padding = 20
    center = x + width / 2
    available = width - padding * 2
    pdf.setFont("Helvetica-Bold", 33)
    pdf.drawCentredString(center, y + height - 45, "OFERTA")
    presentation = format_presentation(product.weight, product.weight_unit)
    name, size = _fit_text(
        f"{product.name.strip()} {presentation}".strip(),
        "Helvetica-Bold", 16, available,
    )
    pdf.setFont("Helvetica-Bold", size)
    pdf.drawCentredString(center, y + height - 70, name)

    box_y = y + 76
    box_height = height - 162
    pdf.setLineWidth(0.8)
    pdf.rect(x + padding, box_y, available, box_height)
    text_width = available - 24
    font = "Helvetica-Bold"
    size = min(_fit_font_size(word, font, 48, text_width)
               for word in promo_text.split())
    # Wrap instead of truncating promotional terms, including explicit newlines.
    while True:
        lines = simpleSplit(promo_text, font, size, text_width)
        if (len(lines) * size * 1.15 <= box_height - 20
                and all(pdfmetrics.stringWidth(line, font, size) <= text_width for line in lines)):
            break
        size -= 0.25
    ascent, descent = pdfmetrics.getAscentDescent(font, size)
    baseline = box_y + box_height / 2 + (len(lines) - 1) * size * 1.15 / 2
    baseline -= (ascent + descent) / 2
    pdf.setFont(font, size)
    for line in lines:
        pdf.drawCentredString(center, baseline, line)
        baseline -= size * 1.15

    kind, value = barcode_spec(product.barcode)
    drawing = createBarcodeDrawing(kind, value=value, barHeight=30,
                                   humanReadable=False, quiet=True)
    half_width = available / 2 - 8
    scale = min(1, half_width / drawing.width)
    pdf.saveState()
    pdf.translate(x + padding + (half_width - drawing.width * scale) / 2, y + 30)
    pdf.scale(scale, 30 / drawing.height)
    renderPDF.draw(drawing, pdf, 0, 0)
    pdf.restoreState()
    code, size = _fit_text(product.barcode, "Helvetica", 9, half_width)
    pdf.setFont("Helvetica", size)
    pdf.drawCentredString(x + padding + half_width / 2, y + 17, code)
    comparable = calculate_comparable_price(product.price, product.weight, product.weight_unit)
    if comparable:
        text, size = _fit_text(
            f"{comparable.label} {format_ars(comparable.price)}",
            "Helvetica-Bold", 14, half_width,
        )
        pdf.setFont("Helvetica-Bold", size)
        pdf.drawCentredString(x + width - padding - half_width / 2, y + 40, text)


def build_offer_ticket_pdf(product: LabelProduct, promo_text: str, copies: int) -> bytes:
    """Genera copias sin persistencia y deja vacíos los cuadrantes sobrantes."""
    promo_text = promo_text.strip()
    if not promo_text or len(promo_text) > 500:
        raise ValueError("Ingresá una promoción de entre 1 y 500 caracteres.")
    if isinstance(copies, bool) or not isinstance(copies, int) or not 1 <= copies <= 1000:
        raise ValueError("Ingresá entre 1 y 1000 copias.")
    if barcode_spec(product.barcode) is None:
        raise ValueError("El código de barras del producto no es representable.")
    output = BytesIO()
    width, height = landscape(A4)
    pdf = canvas.Canvas(output, pagesize=(width, height), pageCompression=1, invariant=1)
    pdf.setTitle("Ticket de oferta")
    pdf.setAuthor("Sistema Supermercado")
    for start in range(0, copies, 4):
        pdf.saveState()
        pdf.setLineWidth(0.45)
        pdf.setStrokeColorRGB(0.6, 0.6, 0.6)
        pdf.setDash(3, 3)
        pdf.line(width / 2, 0, width / 2, height)
        pdf.line(0, height / 2, width, height / 2)
        pdf.restoreState()
        for position in range(min(4, copies - start)):
            row, column = divmod(position, 2)
            _draw_ticket(pdf, product, promo_text, column * width / 2,
                         height - (row + 1) * height / 2, width / 2, height / 2)
        pdf.showPage()
    pdf.save()
    return output.getvalue()
