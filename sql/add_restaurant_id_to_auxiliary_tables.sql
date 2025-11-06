-- ===============================================
-- AGREGAR RESTAURANT_ID A TABLAS AUXILIARES
-- ===============================================
-- Este script agrega restaurant_id a las tablas auxiliares
-- (active_table_users y split_payments) para soportar
-- múltiples restaurantes con el mismo número de mesa.

-- ===============================================
-- 1. ACTUALIZAR TABLA active_table_users
-- ===============================================

-- Agregar columna restaurant_id
ALTER TABLE active_table_users
ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;

-- Agregar foreign key a restaurants
ALTER TABLE active_table_users
ADD CONSTRAINT fk_active_users_restaurant
FOREIGN KEY (restaurant_id)
REFERENCES restaurants(id)
ON DELETE CASCADE;

-- Crear índice para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_active_users_restaurant_table
ON active_table_users(restaurant_id, table_number);

-- Eliminar constraint único anterior (si existe)
ALTER TABLE active_table_users
DROP CONSTRAINT IF EXISTS active_table_users_table_number_guest_id_key CASCADE;

ALTER TABLE active_table_users
DROP CONSTRAINT IF EXISTS active_table_users_table_number_user_id_key CASCADE;

-- Agregar nuevo constraint único compuesto: (restaurant_id, table_number, user_id/guest_id)
-- Para usuarios autenticados
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_user_restaurant_table_userid
ON active_table_users(restaurant_id, table_number, user_id)
WHERE user_id IS NOT NULL;

-- Para invitados (guest_id)
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_user_restaurant_table_guestid
ON active_table_users(restaurant_id, table_number, guest_id)
WHERE guest_id IS NOT NULL AND user_id IS NULL;

-- ===============================================
-- 2. ACTUALIZAR TABLA split_payments
-- ===============================================

-- Agregar columna restaurant_id
ALTER TABLE split_payments
ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;

-- Agregar foreign key a restaurants
ALTER TABLE split_payments
ADD CONSTRAINT fk_split_payments_restaurant
FOREIGN KEY (restaurant_id)
REFERENCES restaurants(id)
ON DELETE CASCADE;

-- Crear índice para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_split_payments_restaurant_table
ON split_payments(restaurant_id, table_number);

-- Eliminar constraint único anterior (si existe)
ALTER TABLE split_payments
DROP CONSTRAINT IF EXISTS split_payments_table_number_user_id_key CASCADE;

ALTER TABLE split_payments
DROP CONSTRAINT IF EXISTS split_payments_table_number_guest_id_key CASCADE;

-- Agregar nuevo constraint único compuesto: (restaurant_id, table_number, user_id/guest_name)
-- Para usuarios autenticados
CREATE UNIQUE INDEX IF NOT EXISTS unique_split_payment_restaurant_table_userid
ON split_payments(restaurant_id, table_number, user_id)
WHERE user_id IS NOT NULL AND status = 'pending';

-- Para invitados (guest_name)
CREATE UNIQUE INDEX IF NOT EXISTS unique_split_payment_restaurant_table_guestname
ON split_payments(restaurant_id, table_number, guest_name)
WHERE guest_name IS NOT NULL AND user_id IS NULL AND status = 'pending';

-- ===============================================
-- 3. ACTUALIZAR STORED PROCEDURE increment_user_payment
-- ===============================================

-- Eliminar versión anterior
DROP FUNCTION IF EXISTS increment_user_payment(INTEGER, VARCHAR, VARCHAR, INTEGER, DECIMAL);
DROP FUNCTION IF EXISTS increment_user_payment(INTEGER, INTEGER, VARCHAR, VARCHAR, INTEGER, DECIMAL);

-- Crear nueva versión con restaurant_id
CREATE OR REPLACE FUNCTION increment_user_payment(
    p_restaurant_id INTEGER,
    p_table_number INTEGER,
    p_user_id VARCHAR DEFAULT NULL,
    p_guest_name VARCHAR DEFAULT NULL,
    p_field VARCHAR DEFAULT 'total_paid_individual',
    p_amount DECIMAL(10,2) DEFAULT 0
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_value DECIMAL(10,2);
BEGIN
    -- Validar que el campo es válido
    IF p_field NOT IN ('total_paid_individual', 'total_paid_amount', 'total_paid_split') THEN
        RAISE EXCEPTION 'Campo inválido: %. Debe ser total_paid_individual, total_paid_amount, o total_paid_split', p_field;
    END IF;

    -- Buscar el usuario en active_table_users
    IF p_user_id IS NOT NULL THEN
        -- Por user_id
        EXECUTE format('
            UPDATE active_table_users
            SET %I = COALESCE(%I, 0) + $1, updated_at = NOW()
            WHERE restaurant_id = $2
            AND table_number = $3
            AND user_id = $4
        ', p_field, p_field)
        USING p_amount, p_restaurant_id, p_table_number, p_user_id;
    ELSIF p_guest_name IS NOT NULL THEN
        -- Por guest_name
        EXECUTE format('
            UPDATE active_table_users
            SET %I = COALESCE(%I, 0) + $1, updated_at = NOW()
            WHERE restaurant_id = $2
            AND table_number = $3
            AND guest_name = $4
        ', p_field, p_field)
        USING p_amount, p_restaurant_id, p_table_number, p_guest_name;
    ELSE
        RAISE EXCEPTION 'Debe proporcionar user_id o guest_name';
    END IF;

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error en increment_user_payment: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- 4. ACTUALIZAR close_table_order_if_paid
-- ===============================================

-- Actualizar la función para usar restaurant_id al limpiar tablas auxiliares
DROP FUNCTION IF EXISTS close_table_order_if_paid(UUID) CASCADE;

CREATE OR REPLACE FUNCTION close_table_order_if_paid(p_table_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_remaining_amount DECIMAL(10,2);
    v_table_id UUID;
    v_restaurant_id INTEGER;
    v_table_number INTEGER;
BEGIN
    -- Verificar si queda algo por pagar y obtener restaurant_id y table_number
    SELECT tord.remaining_amount, tord.table_id, tbl.restaurant_id, tbl.table_number
    INTO v_remaining_amount, v_table_id, v_restaurant_id, v_table_number
    FROM table_order tord
    JOIN tables tbl ON tord.table_id = tbl.id
    WHERE tord.id = p_table_order_id;

    IF v_remaining_amount <= 0 THEN
        -- Marcar todos los platillos como pagados
        UPDATE dish_order
        SET payment_status = 'paid'
        WHERE user_order_id IN (
            SELECT id FROM user_order WHERE table_order_id = p_table_order_id
        )
        AND payment_status != 'paid';

        -- Cerrar la orden
        UPDATE table_order
        SET
            status = 'paid',
            closed_at = NOW()
        WHERE id = p_table_order_id;

        -- Liberar la mesa
        UPDATE tables
        SET status = 'available'
        WHERE id = v_table_id;

        -- Limpiar split_payments de esta mesa (usando restaurant_id)
        DELETE FROM split_payments
        WHERE restaurant_id = v_restaurant_id
        AND table_number = v_table_number;

        -- Limpiar active_table_users de esta mesa (usando restaurant_id)
        DELETE FROM active_table_users
        WHERE restaurant_id = v_restaurant_id
        AND table_number = v_table_number;

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- COMENTARIOS Y NOTAS IMPORTANTES
-- ===============================================

-- PASO CRÍTICO: Después de ejecutar este script, DEBES asignar restaurant_id
-- a todos los registros existentes en active_table_users y split_payments.

-- Opción 1: Si solo tienes un restaurante, asignar ese ID a todos:
-- UPDATE active_table_users SET restaurant_id = 1 WHERE restaurant_id IS NULL;
-- UPDATE split_payments SET restaurant_id = 1 WHERE restaurant_id IS NULL;

-- Opción 2: Asignar restaurant_id basándose en la tabla tables:
-- UPDATE active_table_users atu
-- SET restaurant_id = t.restaurant_id
-- FROM tables t
-- WHERE atu.table_number = t.table_number
-- AND atu.restaurant_id IS NULL;

-- UPDATE split_payments sp
-- SET restaurant_id = t.restaurant_id
-- FROM tables t
-- WHERE sp.table_number = t.table_number
-- AND sp.restaurant_id IS NULL;

-- Verificar que todos los registros tienen restaurant_id:
-- SELECT COUNT(*) FROM active_table_users WHERE restaurant_id IS NULL;
-- SELECT COUNT(*) FROM split_payments WHERE restaurant_id IS NULL;

-- ===============================================
-- FIN DE LA MIGRACIÓN
-- ===============================================
