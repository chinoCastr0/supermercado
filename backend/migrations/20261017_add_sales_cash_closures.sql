-- Ventas y cierres diarios. Dinero exacto y claves únicas por organización.
BEGIN;
CREATE TABLE IF NOT EXISTS sales (
 id SERIAL PRIMARY KEY, organization_id VARCHAR(64) NOT NULL,
 client_id VARCHAR(36) NOT NULL, cashier VARCHAR(255) NOT NULL,
 date DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 total NUMERIC(12,2) NOT NULL, paid NUMERIC(12,2) NOT NULL, change NUMERIC(12,2) NOT NULL,
 CONSTRAINT uq_sales_org_client UNIQUE (organization_id, client_id)
);
CREATE INDEX IF NOT EXISTS ix_sales_organization_id ON sales(organization_id);
CREATE INDEX IF NOT EXISTS ix_sales_date ON sales(date);
CREATE TABLE IF NOT EXISTS sale_items (
 id SERIAL PRIMARY KEY, organization_id VARCHAR(64) NOT NULL,
 sale_id INTEGER NOT NULL REFERENCES sales(id), kind VARCHAR(10) NOT NULL,
 product_id INTEGER, name VARCHAR(255) NOT NULL, barcode VARCHAR(50) NOT NULL,
 price NUMERIC(12,2) NOT NULL, quantity INTEGER NOT NULL, subtotal NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sale_items_organization_id ON sale_items(organization_id);
CREATE INDEX IF NOT EXISTS ix_sale_items_sale_id ON sale_items(sale_id);
CREATE TABLE IF NOT EXISTS cash_closures (
 id SERIAL PRIMARY KEY, organization_id VARCHAR(64) NOT NULL, date DATE NOT NULL,
 amounts JSON NOT NULL, total NUMERIC(12,2) NOT NULL, sales_total NUMERIC(12,2) NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'draft', confirmed_at TIMESTAMPTZ,
 CONSTRAINT uq_closures_org_date UNIQUE (organization_id, date)
);
CREATE INDEX IF NOT EXISTS ix_cash_closures_organization_id ON cash_closures(organization_id);
COMMIT;
