-- Xquisito Database Schema
-- Execute this in Supabase SQL Editor

-- Tabla para las mesas
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number INTEGER NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para las órdenes de usuario
CREATE TABLE IF NOT EXISTS user_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number INTEGER NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    items JSONB NOT NULL, -- Array de items con estructura: [{id, name, price, quantity, description, image}]
    total_items INTEGER NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- Timestamp cuando se pagó la orden (NULL = no pagada)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_table_number FOREIGN KEY (table_number) REFERENCES tables(table_number) ON DELETE CASCADE,
    CONSTRAINT chk_paid_at_not_future CHECK (paid_at IS NULL OR paid_at <= NOW())
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_user_orders_table_number ON user_orders(table_number);
CREATE INDEX IF NOT EXISTS idx_user_orders_status ON user_orders(status);
CREATE INDEX IF NOT EXISTS idx_user_orders_paid_at ON user_orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_user_orders_created_at ON user_orders(created_at DESC);

-- Función para actualizar el campo updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at
CREATE TRIGGER trigger_update_tables_updated_at
    BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_user_orders_updated_at
    BEFORE UPDATE ON user_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insertar algunas mesas de ejemplo
INSERT INTO tables (table_number) VALUES 
(1), (2), (3), (4), (5), (6), (7), (8), (9), (10),
(11), (12), (13), (14), (15), (16), (17), (18), (19), (20)
ON CONFLICT (table_number) DO NOTHING;

-- Habilitar Row Level Security (opcional pero recomendado)
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_orders ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad básicas (permitir todo por ahora, ajustar según necesidades)
CREATE POLICY "Allow all operations on tables" ON tables FOR ALL USING (true);
CREATE POLICY "Allow all operations on user_orders" ON user_orders FOR ALL USING (true);