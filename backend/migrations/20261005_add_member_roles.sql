-- Migración PostgreSQL aditiva: roles locales por organización ("encargado").
-- Equivalente al create_all() que ejecuta initialize_database() al arrancar;
-- no modifica ninguna tabla existente. Aplicar después de 20261003.
CREATE TABLE IF NOT EXISTS member_roles (
    organization_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    role VARCHAR(20) NOT NULL,
    updated_by VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, user_id)
);
