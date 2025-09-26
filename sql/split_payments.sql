-- Tabla para manejar división de cuentas con re-división automática
-- No modifica las tablas existentes, solo agrega funcionalidad nueva

CREATE TABLE IF NOT EXISTS split_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number INTEGER NOT NULL,
    user_id VARCHAR(255) NULL,
    guest_name VARCHAR(255) NULL,
    expected_amount DECIMAL(10,2) NOT NULL,
    amount_paid DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) CHECK (status IN ('pending', 'paid')) DEFAULT 'pending',
    original_total DECIMAL(10,2) NOT NULL, -- Para tracking de cambios
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_split_payments_table_number ON split_payments(table_number);
CREATE INDEX IF NOT EXISTS idx_split_payments_status ON split_payments(status);

-- Función para actualizar timestamps
CREATE OR REPLACE FUNCTION update_split_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_split_payments_updated_at ON split_payments;
CREATE TRIGGER trigger_update_split_payments_updated_at
    BEFORE UPDATE ON split_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_split_payments_updated_at();