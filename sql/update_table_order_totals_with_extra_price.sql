-- Actualizar función update_table_order_totals para incluir extra_price en los cálculos

CREATE OR REPLACE FUNCTION update_table_order_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_table_order_id UUID;
    v_total_amount DECIMAL(10,2);
    v_paid_from_items DECIMAL(10,2);
    v_paid_from_items_before DECIMAL(10,2);
    v_current_paid_amount DECIMAL(10,2);
    v_paid_by_amount DECIMAL(10,2) DEFAULT 0;
    v_final_paid_amount DECIMAL(10,2);
    v_no_items INTEGER;
BEGIN
    -- Obtener table_order_id
    IF TG_OP = 'DELETE' THEN
        SELECT uo.table_order_id INTO v_table_order_id
        FROM user_order uo WHERE uo.id = OLD.user_order_id;
    ELSE
        SELECT uo.table_order_id INTO v_table_order_id
        FROM user_order uo WHERE uo.id = NEW.user_order_id;
    END IF;

    -- Obtener el paid_amount actual (incluye pagos por monto + por items)
    SELECT paid_amount INTO v_current_paid_amount
    FROM table_order
    WHERE id = v_table_order_id;

    -- Calcular totales actuales de items (después del trigger) - INCLUYENDO extra_price
    SELECT
        COALESCE(SUM("do".quantity * ("do".price + COALESCE("do".extra_price, 0))), 0),
        COALESCE(SUM(CASE WHEN "do".payment_status = 'paid' THEN "do".quantity * ("do".price + COALESCE("do".extra_price, 0)) ELSE 0 END), 0),
        COALESCE(SUM("do".quantity), 0)
    INTO v_total_amount, v_paid_from_items, v_no_items
    FROM dish_order "do"
    JOIN user_order uo ON "do".user_order_id = uo.id
    WHERE uo.table_order_id = v_table_order_id;

    -- Calcular cuánto había pagado por items ANTES de este trigger
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'not_paid' AND NEW.payment_status = 'paid' THEN
        -- Si estamos pagando un item, calcular sin incluir este item - INCLUYENDO extra_price
        v_paid_from_items_before := v_paid_from_items - (NEW.quantity * (NEW.price + COALESCE(NEW.extra_price, 0)));
    ELSE
        v_paid_from_items_before := v_paid_from_items;
    END IF;

    -- Calcular cuánto se ha pagado por "monto" (no por items específicos)
    -- Es la diferencia entre el paid_amount actual y lo que estaba pagado por items antes
    v_paid_by_amount := GREATEST(0, v_current_paid_amount - v_paid_from_items_before);

    -- El paid_amount final es: pagos por items + pagos por monto
    v_final_paid_amount := v_paid_from_items + v_paid_by_amount;

    -- Actualizar table_order
    UPDATE table_order
    SET
        total_amount = v_total_amount,
        paid_amount = v_final_paid_amount,
        remaining_amount = v_total_amount - v_final_paid_amount,
        no_items = v_no_items,
        status = CASE
            WHEN v_final_paid_amount >= v_total_amount AND v_total_amount > 0 THEN 'paid'
            WHEN v_final_paid_amount > 0 THEN 'partial'
            ELSE 'not_paid'
        END
    WHERE id = v_table_order_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
