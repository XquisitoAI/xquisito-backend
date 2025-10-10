-- Migración: Actualizar close_table_order_if_paid para limpiar active_table_users
-- Fecha: 2025-10-10
-- Descripción: Agrega limpieza de active_table_users cuando se cierra una mesa completamente pagada

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
