-- ====================================================
-- Actualizar pay_table_amount para incluir branch_number
-- ====================================================

-- Eliminar versiones antiguas para evitar conflictos
DROP FUNCTION IF EXISTS pay_table_amount(INTEGER, DECIMAL);
DROP FUNCTION IF EXISTS pay_table_amount(INTEGER, INTEGER, DECIMAL);
DROP FUNCTION IF EXISTS pay_table_amount(INTEGER, INTEGER, INTEGER, DECIMAL);

-- ====================================================
-- Actualizar función pay_table_amount
-- ====================================================
CREATE OR REPLACE FUNCTION pay_table_amount(
    p_table_number INTEGER,
    p_amount DECIMAL(10,2),
    p_restaurant_id INTEGER DEFAULT NULL,
    p_branch_number INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_table_order_id UUID;
    v_current_paid DECIMAL(10,2);
    v_total_amount DECIMAL(10,2);
    v_new_paid_amount DECIMAL(10,2);
    v_remaining_amount DECIMAL(10,2);
BEGIN
    -- Buscar orden activa de la mesa filtrando por restaurant_id y branch_number
    IF p_restaurant_id IS NOT NULL AND p_branch_number IS NOT NULL THEN
        SELECT "to".id, "to".paid_amount, "to".total_amount
        INTO v_table_order_id, v_current_paid, v_total_amount
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        JOIN branches b ON t.branch_id = b.id
        WHERE t.table_number = p_table_number
        AND b.restaurant_id = p_restaurant_id
        AND b.branch_number = p_branch_number
        AND "to".status IN ('not_paid', 'partial');
    ELSIF p_restaurant_id IS NOT NULL THEN
        -- Solo filtrar por restaurant_id si branch_number no está disponible (retrocompatibilidad)
        SELECT "to".id, "to".paid_amount, "to".total_amount
        INTO v_table_order_id, v_current_paid, v_total_amount
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        JOIN branches b ON t.branch_id = b.id
        WHERE t.table_number = p_table_number
        AND b.restaurant_id = p_restaurant_id
        AND "to".status IN ('not_paid', 'partial');
    ELSE
        -- Retrocompatibilidad: si no se proporciona restaurant_id ni branch_number
        SELECT "to".id, "to".paid_amount, "to".total_amount
        INTO v_table_order_id, v_current_paid, v_total_amount
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        WHERE t.table_number = p_table_number
        AND "to".status IN ('not_paid', 'partial');
    END IF;

    IF v_table_order_id IS NULL THEN
        RAISE EXCEPTION 'No hay cuenta activa para la mesa %', p_table_number;
    END IF;

    -- Calcular nuevo monto pagado
    v_new_paid_amount := v_current_paid + p_amount;
    v_remaining_amount := v_total_amount - v_new_paid_amount;

    -- Validar que no se pague de más
    IF v_new_paid_amount > v_total_amount THEN
        RAISE EXCEPTION 'El monto a pagar ($%) excede lo adeudado ($%)',
                        p_amount, (v_total_amount - v_current_paid);
    END IF;

    -- Actualizar montos en table_order
    UPDATE table_order
    SET
        paid_amount = v_new_paid_amount,
        remaining_amount = v_remaining_amount,
        status = CASE
            WHEN v_new_paid_amount = 0 THEN 'not_paid'
            WHEN v_new_paid_amount < v_total_amount THEN 'partial'
            ELSE 'paid'
        END
    WHERE id = v_table_order_id;

    -- Auto-cerrar mesa si está completamente pagada
    IF v_remaining_amount <= 0 THEN
        PERFORM close_table_order_if_paid(v_table_order_id);
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- Comentarios
-- ====================================================
COMMENT ON FUNCTION pay_table_amount IS 'Registra un pago por monto para una mesa, con soporte para restaurant_id y branch_number. Actualiza automáticamente el estado de la orden y cierra la mesa si se paga completamente.';
