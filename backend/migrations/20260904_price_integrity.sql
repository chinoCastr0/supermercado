-- Add concurrency control, immutable label snapshots and a price audit trail.
-- Existing product prices and historical batches are deliberately not rewritten.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE print_batch_items
    ADD COLUMN IF NOT EXISTS position INTEGER,
    ADD COLUMN IF NOT EXISTS snapshot_barcode VARCHAR(50),
    ADD COLUMN IF NOT EXISTS snapshot_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS snapshot_price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS snapshot_weight NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS snapshot_weight_unit VARCHAR(2);

CREATE TABLE IF NOT EXISTS product_price_changes (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    barcode VARCHAR(50) NOT NULL,
    old_price NUMERIC(12, 2),
    new_price NUMERIC(12, 2) NOT NULL,
    source VARCHAR(30) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_product_price_changes_product_id
    ON product_price_changes (product_id);
