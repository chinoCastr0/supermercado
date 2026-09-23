"""Regresiones de tickets: geometría, validación HTTP y ausencia de escrituras."""

from decimal import Decimal
from io import BytesIO

import pytest
import pymupdf
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.models
from app.api.offers import router
from app.database import Base, get_db
from app.models.product import Product
from app.models.print_batch import PrintBatch
from app.services.label_pdf import LabelProductSnapshot
from app.services.offer_ticket_pdf import build_offer_ticket_pdf


def sample(barcode="4006381333931"):
    return LabelProductSnapshot(1, barcode, "Yerba mate", Decimal("2300"), Decimal("500"), "g")


@pytest.mark.parametrize("copies", [1, 2, 4, 5, 9])
def test_quadrants_and_pagination(copies):
    content = build_offer_ticket_pdf(sample(), "Antes $500 Ahora $350", copies)
    reader = PdfReader(BytesIO(content))
    assert len(reader.pages) == (copies + 3) // 4
    for index, page in enumerate(reader.pages):
        assert float(page.mediabox.width) == pytest.approx(841.89, abs=0.1)
        assert float(page.mediabox.height) == pytest.approx(595.28, abs=0.1)
        text = page.extract_text()
        count = min(4, copies - index * 4)
        for expected in ["OFERTA", "Yerba mate 500 G", "4006381333931", "1 KG $ 4.600,00"]:
            assert text.count(expected) == count


@pytest.mark.parametrize("promo", ["2x1", "Antes $500\nAhora $350", "W" * 500, "Oferta especial " * 30])
@pytest.mark.parametrize("barcode", ["4006381333931", "96385074", "ABC-123"])
def test_all_text_stays_inside_occupied_quadrant(promo, barcode):
    with pymupdf.open(stream=build_offer_ticket_pdf(sample(barcode), promo, 1), filetype="pdf") as doc:
        cell = pymupdf.Rect(0, 0, doc[0].rect.width / 2, doc[0].rect.height / 2)
        for word in doc[0].get_text("words"):
            assert cell.contains(pymupdf.Rect(word[:4]))


def test_endpoint_validation_and_no_persistence():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    app = FastAPI()
    app.include_router(router)
    with Session(engine) as db:
        product = Product(barcode="ABC-123", name="Yerba", price=Decimal("2300"))
        db.add(product)
        db.commit()
        db.refresh(product)
        before = (product.revision, product.label_version, product.printed_at, product.printed_label_version)
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            payload = {"product_id": product.id, "promo_text": "2x1", "copies": 2}
            response = client.post("/offers/ticket", json=payload)
            assert response.status_code == 200
            assert response.headers["content-type"] == "application/pdf"
            assert response.content.startswith(b"%PDF")
            assert "filename=" in response.headers["content-disposition"]
            assert "x-print-batch-id" not in response.headers
            for changes in [{"copies": 0}, {"copies": -1}, {"copies": 1.5}, {"copies": True},
                            {"copies": 1001}, {"promo_text": "  "}, {"promo_text": "a" * 501}]:
                assert client.post("/offers/ticket", json=payload | changes).status_code == 422
            assert client.post("/offers/ticket", json=payload | {"product_id": 9999}).status_code == 404
            db.refresh(product)
            assert before == (product.revision, product.label_version, product.printed_at, product.printed_label_version)
            assert db.scalar(select(func.count()).select_from(PrintBatch)) == 0
            product.barcode = "Inválido"
            db.commit()
            assert client.post("/offers/ticket", json=payload).status_code == 422
