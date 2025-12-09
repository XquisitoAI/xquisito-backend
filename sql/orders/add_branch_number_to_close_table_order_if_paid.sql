-- ====================================================
-- Actualizar close_table_order_if_paid para incluir branch_number
-- ====================================================

-- Eliminar versiones antiguas para evitar conflictos
DROP FUNCTION IF EXISTS close_table_order_if_paid(UUID);

-- ====================================================
-- Actualizar función close_table_order_if_paid
-- ====================================================
CREATE OR REPLACE FUNCTION close_table_order_if_paid(p_table_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_remaining_amount DECIMAL(10,2);
    v_table_id UUID;
    v_table_number INTEGER;
    v_restaurant_id INTEGER;
    v_branch_number INTEGER;
BEGIN
    -- Verificar si queda algo por pagar y obtener información de la mesa
    SELECT
        "to".remaining_amount,
        "to".table_id,
        t.table_number,
        t.restaurant_id,
        t.branch_number
    INTO
        v_remaining_amount,
        v_table_id,
        v_table_number,
        v_restaurant_id,
        v_branch_number
    FROM table_order "to"
    JOIN tables t ON "to".table_id = t.id
    WHERE "to".id = p_table_order_id;

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

        -- Limpiar split_payments de esta mesa filtrando por restaurant_id y branch_number
        IF v_restaurant_id IS NOT NULL AND v_branch_number IS NOT NULL THEN
            DELETE FROM split_payments
            WHERE table_number = v_table_number
            AND restaurant_id = v_restaurant_id
            AND branch_number = v_branch_number;
        ELSIF v_restaurant_id IS NOT NULL THEN
            -- Retrocompatibilidad: solo restaurant_id
            DELETE FROM split_payments
            WHERE table_number = v_table_number
            AND restaurant_id = v_restaurant_id;
        ELSE
            -- Retrocompatibilidad: sin filtros
            DELETE FROM split_payments
            WHERE table_number = v_table_number;
        END IF;

        -- Limpiar active_table_users de esta mesa filtrando por restaurant_id y branch_number
        IF v_restaurant_id IS NOT NULL AND v_branch_number IS NOT NULL THEN
            DELETE FROM active_table_users
            WHERE table_number = v_table_number
            AND restaurant_id = v_restaurant_id
            AND branch_number = v_branch_number;
        ELSIF v_restaurant_id IS NOT NULL THEN
            -- Retrocompatibilidad: solo restaurant_id
            DELETE FROM active_table_users
            WHERE table_number = v_table_number
            AND restaurant_id = v_restaurant_id;
        ELSE
            -- Retrocompatibilidad: sin filtros
            DELETE FROM active_table_users
            WHERE table_number = v_table_number;
        END IF;

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- Comentarios
-- ====================================================
COMMENT ON FUNCTION close_table_order_if_paid IS 'Cierra una orden de mesa si está completamente pagada, con soporte para restaurant_id y branch_number. Libera la mesa y limpia datos de split_payments y active_table_users asociados.';
