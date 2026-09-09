"""Genera un PDF de desarrollo para revisar la matriz 3 × 8 visualmente."""

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
import sys

from app.services.label_pdf import build_labels_pdf


@dataclass
class SampleProduct:
    """Datos de ejemplo compatibles con el protocolo del renderizador."""
    id: int
    barcode: str
    name: str
    price: Decimal
    weight: Decimal | None
    weight_unit: str | None


def sample_products() -> list[SampleProduct]:
    """Prepara 25 carteles y un código vacío para verificar paginación y exclusión."""
    units = [
        (Decimal("500"), "g"),
        (Decimal("1.5"), "l"),
        (Decimal("900"), "ml"),
        (Decimal("1"), "kg"),
        (Decimal("6"), "u"),
        (None, None),
    ]
    barcode_examples = {
        1: "4006381333931",  # EAN-13
        2: "96385074",  # EAN-8
        3: "A1",  # Code128 corto
        4: "MUESTRA-004-LOTE-2026",  # Code128 largo
    }
    products = []
    for index in range(1, 26):
        weight, unit = units[(index - 1) % len(units)]
        name = (
            "PRODUCTO CON NOMBRE MUY LARGO PARA PROBAR AJUSTE"
            if index in {7, 25}
            else f"PRODUCTO MUESTRA {index}"
        )
        products.append(
            SampleProduct(
                id=1000 + index,
                barcode=barcode_examples.get(index, f"MUESTRA-{index:03d}"),
                name=name,
                price=Decimal("950.50") * index,
                weight=weight,
                weight_unit=unit,
            )
        )
    products.append(
        SampleProduct(
            id=1999,
            barcode="",
            name="SIN CODIGO",
            price=Decimal("1000"),
            weight=Decimal("500"),
            weight_unit="g",
        )
    )
    return products


output = Path(sys.argv[1] if len(sys.argv) > 1 else "output/pdf/carteles_muestra.pdf")
output.parent.mkdir(parents=True, exist_ok=True)
result = build_labels_pdf(sample_products())
output.write_bytes(result.content)
print(f"output={output.resolve()}")
print(f"generated={len(result.generated_product_ids)} warnings={len(result.warnings)}")
