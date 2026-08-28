"""Renderiza páginas PDF a PNG para control visual de desarrollo."""

from pathlib import Path
import sys

import pymupdf


source = Path(sys.argv[1])
output_directory = Path(sys.argv[2])
output_directory.mkdir(parents=True, exist_ok=True)

document = pymupdf.open(source)
for page_number, page in enumerate(document, start=1):
    image = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
    image.save(output_directory / f"page-{page_number}.png")
print(f"pages={len(document)} output={output_directory.resolve()}")
