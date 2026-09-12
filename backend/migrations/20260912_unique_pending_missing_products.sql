-- Aplicar después de 20260910_add_missing_products.sql.
-- Duplicados existentes hacen fallar el índice; no se borran anotaciones.
CREATE UNIQUE INDEX IF NOT EXISTS uq_missing_products_pending_product
    ON missing_products (product_id)
    WHERE status = 'pending' AND product_id IS NOT NULL;
