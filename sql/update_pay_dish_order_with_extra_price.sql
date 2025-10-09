-- Actualizar función pay_dish_order para incluir extra_price en el cálculo

CREATE OR REPLACE FUNCTION pay_dish_order(p_dish_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_dish_price DECIMAL(10,2);
    v_table_order_id UUID;
BEGIN
    -- Verificar que el platillo existe y no está pagado - INCLUYENDO extra_price
    SELECT ("do".quantity * ("do".price + COALESCE("do".extra_price, 0))), uo.table_order_id
    INTO v_dish_price, v_table_order_id
    FROM dish_order "do"
    JOIN user_order uo ON "do".user_order_id = uo.id
    WHERE "do".id = p_dish_order_id AND "do".payment_status = 'not_paid';

    IF v_dish_price IS NULL THEN
        RAISE EXCEPTION 'Platillo no encontrado o ya está pagado';
    END IF;

    -- Marcar platillo como pagado
    UPDATE dish_order
    SET payment_status = 'paid'
    WHERE id = p_dish_order_id;

    -- Los totales se actualizan automáticamente por el trigger

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
