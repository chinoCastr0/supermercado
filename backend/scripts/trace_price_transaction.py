"""Trace one price through the live schema inside a rolled-back transaction."""

from decimal import Decimal
import json
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.products import create_product, get_product, list_products, update_product
from app.database import engine
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductResponse, ProductUpdate


# La transacción exterior revierte filas, pero las secuencias PostgreSQL pueden
# avanzar igualmente. Ejecutar sobre una base de pruebas restaurada.
barcode = f"TRC{uuid4().hex[:12]}"
frontend_input = "1234.56"
payload = {
    "barcode": barcode,
    "name": "000 PRICE TRACE",
    "price": frontend_input,
    "active": True,
}
print(f"1.frontend_input={frontend_input!r} type=str")
print(f"2.api_payload={json.dumps(payload, separators=(',', ':'))}")

with engine.connect() as connection:
    outer_transaction = connection.begin()
    database = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        received = ProductCreate.model_validate(payload)
        print(f"3.backend_received={received.price!r} type={type(received.price).__name__}")

        pending = Product(**received.model_dump())
        print(f"4.before_save={pending.price!r} type={type(pending.price).__name__}")

        created = create_product(received, database)
        print(f"5.after_save={created.price!r} type={type(created.price).__name__}")

        stored = connection.execute(
            text("SELECT price FROM products WHERE id = :product_id"),
            {"product_id": created.id},
        ).scalar_one()
        print(f"6.database_direct={stored!r} type={type(stored).__name__}")

        fetched = get_product(created.id, database)
        response_price = ProductResponse.model_validate(fetched).model_dump(
            mode="json"
        )["price"]
        print(f"7.product_endpoint={response_price!r} type={type(response_price).__name__}")

        listed: Product | None = None
        for skip in range(0, 20_000, 500):
            batch = list_products(
                database,
                skip=skip,
                limit=500,
                print_status="all",
            )
            listed = next((item for item in batch if item.id == created.id), None)
            if listed is not None or len(batch) < 500:
                break
        if listed is None:
            raise AssertionError("The traced product was not returned by GET /products")
        list_price = ProductResponse.model_validate(listed).model_dump(mode="json")[
            "price"
        ]
        print(f"8.list_refetch={list_price!r} type={type(list_price).__name__}")

        edited = update_product(
            created.id,
            ProductUpdate(
                expected_revision=created.revision,
                name="000 PRICE TRACE 2",
                price=response_price,
            ),
            database,
        )
        modal_price = ProductResponse.model_validate(edited).model_dump(mode="json")[
            "price"
        ]
        print(f"9.edit_reopen={modal_price!r} type={type(modal_price).__name__}")

        assert all(
            price == "1234.56" for price in (response_price, list_price, modal_price)
        )
        assert created.price == Decimal("1234.56")
    finally:
        database.close()
        outer_transaction.rollback()

with engine.connect() as connection:
    remaining = connection.scalar(
        select(Product.id).where(Product.barcode == barcode)
    )
print(f"10.rollback_verified={remaining is None}")
