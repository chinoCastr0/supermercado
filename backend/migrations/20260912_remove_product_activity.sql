-- Retira el campo obsoleto sin eliminar productos.
ALTER TABLE products DROP COLUMN IF EXISTS active;
