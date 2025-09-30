-- Agregar columna guest_id a las tablas para identificar invitados únicamente
-- Esto soluciona el problema de múltiples invitados con el mismo nombre

-- 1. Agregar guest_id a user_order
ALTER TABLE user_order
ADD COLUMN IF NOT EXISTS guest_id VARCHAR(255) NULL;

-- Índice para guest_id en user_order
CREATE INDEX IF NOT EXISTS idx_user_order_guest_id
ON user_order (guest_id) WHERE guest_id IS NOT NULL;

-- 2. Agregar guest_id a active_table_users
ALTER TABLE active_table_users
ADD COLUMN IF NOT EXISTS guest_id VARCHAR(255) NULL;

-- Índice para guest_id en active_table_users
CREATE INDEX IF NOT EXISTS idx_active_table_users_guest_id
ON active_table_users (guest_id) WHERE guest_id IS NOT NULL;

-- Actualizar constraint único para incluir guest_id
ALTER TABLE active_table_users
DROP CONSTRAINT IF EXISTS unique_user_per_table;

ALTER TABLE active_table_users
ADD CONSTRAINT unique_user_per_table UNIQUE (table_number, user_id, guest_id, guest_name);

-- 3. Agregar guest_id a split_payments
ALTER TABLE split_payments
ADD COLUMN IF NOT EXISTS guest_id VARCHAR(255) NULL;

-- Índice para guest_id en split_payments
CREATE INDEX IF NOT EXISTS idx_split_payments_guest_id
ON split_payments (guest_id) WHERE guest_id IS NOT NULL;

-- Verificar cambios
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('user_order', 'active_table_users', 'split_payments')
AND column_name = 'guest_id'
ORDER BY table_name;