-- Migración completa: Fix payment tracking and cleanup
-- Fecha: 2025-10-10
-- Descripción:
--   1. Actualiza close_table_order_if_paid para limpiar active_table_users
--   2. Asegura que get_table_order_summary funcione correctamente

-- ============================================
-- 1. Eliminar versiones antiguas de funciones
-- ============================================

DROP FUNCTION IF EXISTS get_table_order_summary(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_table_order_summary(INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS close_table_order_if_paid(UUID) CASCADE;

-- ============================================
-- 2. Crear get_table_order_summary actualizada
-- ============================================

CREATE OR REPLACE FUNCTION get_table_order_summary(
    p_table_number INTEGER,
    p_restaurant_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    table_order_id UUID,
    table_number INTEGER,
    restaurant_id INTEGER,
    status VARCHAR(20),
    total_amount DECIMAL(10,2),
    paid_amount DECIMAL(10,2),
    remaining_amount DECIMAL(10,2),
    no_items INTEGER,
    created_at TIMESTAMP
) AS $$
BEGIN
    IF p_restaurant_id IS NOT NULL THEN
        RETURN QUERY
        SELECT
            "to".id,
            t.table_number,
            t.restaurant_id,
            "to".status,
            "to".total_amount,
            "to".paid_amount,
            "to".remaining_amount,
            "to".no_items,
            "to".created_at
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        WHERE t.table_number = p_table_number
        AND t.restaurant_id = p_restaurant_id
        AND "to".status IN ('not_paid', 'partial')
        ORDER BY "to".created_at DESC
        LIMIT 1;
    ELSE
        -- Retrocompatibilidad
        RETURN QUERY
        SELECT
            "to".id,
            t.table_number,
            t.restaurant_id,
            "to".status,
            "to".total_amount,
            "to".paid_amount,
            "to".remaining_amount,
            "to".no_items,
            "to".created_at
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        WHERE t.table_number = p_table_number
        AND "to".status IN ('not_paid', 'partial')
        ORDER BY "to".created_at DESC
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Crear close_table_order_if_paid actualizada
-- ============================================

CREATE OR REPLACE FUNCTION close_table_order_if_paid(p_table_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_remaining_amount DECIMAL(10,2);
    v_table_id UUID;
BEGIN
    -- Verificar si queda algo por pagar
    SELECT remaining_amount, table_id
    INTO v_remaining_amount, v_table_id
    FROM table_order
    WHERE id = p_table_order_id;

    IF v_remaining_amount <= 0 THEN
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

        -- Limpiar split_payments de esta mesa (si existe la tabla)
        DELETE FROM split_payments
        WHERE table_number = (
            SELECT table_number
            FROM tables
            WHERE id = v_table_id
        );

        -- Limpiar active_table_users de esta mesa
        DELETE FROM active_table_users
        WHERE table_number = (
            SELECT table_number
            FROM tables
            WHERE id = v_table_id
        );

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. Verificación
-- ============================================

-- Verificar que las funciones fueron creadas correctamente
SELECT
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('get_table_order_summary', 'close_table_order_if_paid')
ORDER BY routine_name;
