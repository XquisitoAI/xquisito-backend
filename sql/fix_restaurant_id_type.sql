-- ====================================================
-- Script para corregir el tipo de restaurant_id en las funciones
-- Cambiar de UUID a INTEGER
-- ====================================================

-- Función corregida para crear tap order completo cuando se agrega primer platillo
CREATE OR REPLACE FUNCTION create_tap_order_with_first_dish(
    p_table_number INTEGER,
    p_restaurant_id INTEGER,  -- CORREGIDO: era UUID, ahora INTEGER
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_quantity INTEGER DEFAULT 1,
    p_customer_name VARCHAR DEFAULT NULL,
    p_customer_phone VARCHAR DEFAULT NULL,
    p_customer_email VARCHAR DEFAULT NULL,
    p_clerk_user_id VARCHAR DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_table_id UUID;
    v_tap_order_id UUID;
    v_dish_order_id UUID;
    v_result JSON;
BEGIN
    -- Obtener table_id
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number AND restaurant_id = p_restaurant_id;

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Mesa % no encontrada en restaurante %', p_table_number, p_restaurant_id;
    END IF;

    -- Verificar si ya existe una tap_order activa para esta mesa
    SELECT id INTO v_tap_order_id
    FROM tap_orders_and_pay
    WHERE table_id = v_table_id
    AND order_status IN ('active', 'confirmed', 'preparing')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Si no existe tap_order, crear una nueva
    IF v_tap_order_id IS NULL THEN
        INSERT INTO tap_orders_and_pay (
            table_id,
            clerk_user_id,
            customer_name,
            customer_phone,
            customer_email,
            total_amount,
            payment_status,
            order_status
        ) VALUES (
            v_table_id,
            p_clerk_user_id,
            p_customer_name,
            p_customer_phone,
            p_customer_email,
            0,
            'pending',
            'active'
        ) RETURNING id INTO v_tap_order_id;

        -- NO marcar mesa como ocupada en tap-order-and-pay
        -- Las mesas permanecen 'available' para múltiples usuarios
        -- UPDATE tables SET status = 'occupied' WHERE id = v_table_id; -- REMOVIDO
    END IF;

    -- Crear dish_order (sin table_id, se obtiene por JOIN)
    INSERT INTO dish_order (
        tap_order_id,
        item,
        quantity,
        price,
        status,
        payment_status
    ) VALUES (
        v_tap_order_id,
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid'
    ) RETURNING id INTO v_dish_order_id;

    -- Recalcular total de tap_order
    PERFORM update_tap_order_total(v_tap_order_id);

    -- Retornar resultado
    v_result := json_build_object(
        'tap_order_id', v_tap_order_id,
        'dish_order_id', v_dish_order_id,
        'table_id', v_table_id,
        'action', CASE
            WHEN v_tap_order_id IS NOT NULL THEN 'dish_added_to_existing_order'
            ELSE 'new_order_created_with_first_dish'
        END
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Función corregida para verificar si existe tap_order activa en una mesa
CREATE OR REPLACE FUNCTION check_active_tap_order_by_table(
    p_table_number INTEGER,
    p_restaurant_id INTEGER  -- CORREGIDO: era UUID, ahora INTEGER
) RETURNS JSON AS $$
DECLARE
    v_table_id UUID;
    v_tap_order_id UUID;
    v_result JSON;
BEGIN
    -- Obtener table_id
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number AND restaurant_id = p_restaurant_id;

    IF v_table_id IS NULL THEN
        RETURN json_build_object(
            'hasOrder', false,
            'error', 'Table not found'
        );
    END IF;

    -- Buscar tap_order activa
    SELECT id INTO v_tap_order_id
    FROM tap_orders_and_pay
    WHERE table_id = v_table_id
    AND order_status IN ('active', 'confirmed', 'preparing')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_tap_order_id IS NOT NULL THEN
        -- Obtener resumen completo
        SELECT get_tap_order_complete_summary(v_tap_order_id) INTO v_result;
        RETURN json_build_object(
            'hasOrder', true,
            'data', v_result
        );
    ELSE
        RETURN json_build_object(
            'hasOrder', false,
            'table_info', json_build_object(
                'table_id', v_table_id,
                'table_number', p_table_number,
                'restaurant_id', p_restaurant_id
            )
        );
    END IF;
END;
$$ LANGUAGE plpgsql;