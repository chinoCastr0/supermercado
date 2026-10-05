-- Migración PostgreSQL: datos por organización de Clerk (multi-organización).
--
-- Asigna TODAS las filas existentes a la organización inicial, cuyo ID se lee
-- del parámetro de sesión app.bootstrap_organization_id (nunca hardcodeado).
-- Forma recomendada: backend/scripts/migrate_organizations.py, que lo toma de
-- BOOTSTRAP_ORGANIZATION_ID, ejecuta todo en una transacción y verifica conteos.
-- Con psql (también en una sola transacción):
--   PGOPTIONS='-c app.bootstrap_organization_id=org_xxx' \
--     psql -v ON_ERROR_STOP=1 --single-transaction -f 20261003_add_organizations.sql
--
-- Idempotente: volver a ejecutarla no cambia datos ya migrados.
-- Hacer pg_dump antes (ver docs/DEPLOY_BACKEND.md).

DO $$
BEGIN
    IF coalesce(current_setting('app.bootstrap_organization_id', true), '')
            !~ '^org_[A-Za-z0-9]+$' THEN
        RAISE EXCEPTION 'Definir app.bootstrap_organization_id con un ID org_... de Clerk';
    END IF;
END $$;

-- 1. Columnas nullable para poder completar las filas existentes.
ALTER TABLE products ADD COLUMN IF NOT EXISTS organization_id VARCHAR(64);
ALTER TABLE product_price_changes ADD COLUMN IF NOT EXISTS organization_id VARCHAR(64);
ALTER TABLE product_price_changes ADD COLUMN IF NOT EXISTS changed_by VARCHAR(64);
ALTER TABLE print_batches ADD COLUMN IF NOT EXISTS organization_id VARCHAR(64);
ALTER TABLE missing_products ADD COLUMN IF NOT EXISTS organization_id VARCHAR(64);

-- 2. Backfill: sólo filas sin dueño. changed_by queda NULL en el historial
--    previo porque no se conoce el actor real.
UPDATE products
    SET organization_id = current_setting('app.bootstrap_organization_id')
    WHERE organization_id IS NULL;
UPDATE product_price_changes
    SET organization_id = current_setting('app.bootstrap_organization_id')
    WHERE organization_id IS NULL;
UPDATE print_batches
    SET organization_id = current_setting('app.bootstrap_organization_id')
    WHERE organization_id IS NULL;
UPDATE missing_products
    SET organization_id = current_setting('app.bootstrap_organization_id')
    WHERE organization_id IS NULL;

-- 3. Obligatorias desde ahora.
ALTER TABLE products ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE product_price_changes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE print_batches ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE missing_products ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_products_organization_id
    ON products (organization_id);
CREATE INDEX IF NOT EXISTS ix_product_price_changes_organization_id
    ON product_price_changes (organization_id);
CREATE INDEX IF NOT EXISTS ix_print_batches_organization_id
    ON print_batches (organization_id);
CREATE INDEX IF NOT EXISTS ix_missing_products_organization_id
    ON missing_products (organization_id);

-- 4. Unicidad por organización. Se retiran las restricciones globales con los
--    nombres que pudo crear SQLAlchemy (índice único) o un UNIQUE de tabla.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key;
DROP INDEX IF EXISTS ix_products_barcode;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_organization_barcode
    ON products (organization_id, barcode);

DROP INDEX IF EXISTS uq_missing_products_pending_product;
CREATE UNIQUE INDEX IF NOT EXISTS uq_missing_products_org_pending_product
    ON missing_products (organization_id, product_id)
    WHERE status = 'pending' AND product_id IS NOT NULL;

-- Ninguna otra unicidad global sobre barcode debe sobrevivir con otro nombre.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
        WHERE t.relname = 'products'
          AND i.indisunique
          AND i.indnatts = 1
          AND a.attname = 'barcode'
    ) THEN
        RAISE EXCEPTION 'Queda un índice único global sobre products.barcode';
    END IF;
END $$;
