-- Migración PostgreSQL aditiva: lista operativa de faltantes.
-- Equivalente al create_all() que ejecuta initialize_database() al importar
-- app.main. No modifica products ni ninguna otra tabla existente.
CREATE TABLE IF NOT EXISTS missing_products (
    id SERIAL PRIMARY KEY,
    product_id INTEGER,
    name VARCHAR(255) NOT NULL,
    quantity VARCHAR(120),
    notes VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_missing_products_product_id
    ON missing_products (product_id);
CREATE INDEX IF NOT EXISTS ix_missing_products_name
    ON missing_products (name);
CREATE INDEX IF NOT EXISTS ix_missing_products_status
    ON missing_products (status);
