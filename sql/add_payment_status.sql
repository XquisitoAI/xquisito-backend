-- Migración para agregar columna payment_status a user_orders
-- Ejecutar en el editor SQL de Supabase

-- 1. Agregar la columna payment_status
ALTER TABLE user_orders ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending';

-- 2. Agregar constraint para valores válidos
ALTER TABLE user_orders ADD CONSTRAINT chk_payment_status
CHECK (payment_status IN ('pending', 'paid', 'refunded', 'cancelled'));

-- 3. Crear índice para mejorar performance en consultas
CREATE INDEX IF NOT EXISTS idx_user_orders_payment_status ON user_orders(payment_status);

-- 4. Actualizar órdenes existentes que ya tienen paid_at como 'paid'
UPDATE user_orders SET payment_status = 'paid' WHERE paid_at IS NOT NULL;

-- 5. Verificar que la migración funcionó
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_orders'
AND column_name IN ('payment_status', 'paid_at')
ORDER BY column_name;

-- 6. Verificar datos
SELECT payment_status, COUNT(*) as count
FROM user_orders
GROUP BY payment_status;