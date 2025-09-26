-- Actualizar función para limpiar también active_table_users al cerrar mesa
CREATE OR REPLACE FUNCTION close_table_order_if_paid(p_table_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_remaining_amount DECIMAL(10,2);
    v_table_id UUID;
    v_table_number INTEGER;
BEGIN
    -- Verificar si queda algo por pagar
    SELECT remaining_amount, table_id
    INTO v_remaining_amount, v_table_id
    FROM table_order
    WHERE id = p_table_order_id;

    IF v_remaining_amount <= 0 THEN
        -- Obtener número de mesa para limpiezas
        SELECT table_number INTO v_table_number
        FROM tables WHERE id = v_table_id;

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

        -- Limpiar split_payments de esta mesa
        DELETE FROM split_payments
        WHERE table_number = v_table_number;

        -- Limpiar active_table_users de esta mesa
        DELETE FROM active_table_users
        WHERE table_number = v_table_number;

    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;