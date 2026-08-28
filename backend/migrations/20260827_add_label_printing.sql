-- Migración PostgreSQL equivalente a initialize_database().
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS label_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS printed_label_version INTEGER,
    ADD COLUMN IF NOT EXISTS printed_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS print_batches (
    id VARCHAR(36) PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    confirmed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS print_batch_items (
    batch_id VARCHAR(36) NOT NULL REFERENCES print_batches(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    label_version INTEGER NOT NULL,
    PRIMARY KEY (batch_id, product_id)
);
