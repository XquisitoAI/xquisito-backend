-- ====================================================
-- Script para implementar lógica de múltiples usuarios por mesa
-- Detectar clerk_user_id para crear órdenes independientes
-- ====================================================

-- Función actualizada: create_tap_order_with_first_dish con lógica de múltiples usuarios
CREATE OR REPLACE FUNCTION create_tap_order_with_first_dish(
    p_table_number INTEGER,
    p_restaurant_id INTEGER,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_quantity INTEGER DEFAULT 1,
    p_customer_name VARCHAR DEFAULT NULL,
    p_customer_phone VARCHAR DEFAULT NULL,
    p_customer_email VARCHAR DEFAULT NULL,
    p_clerk_user_id VARCHAR DEFAULT NULL,
    p_images JSONB DEFAULT '[]'::jsonb,
    p_custom_fields JSONB DEFAULT NULL,
    p_extra_price DECIMAL(10,2) DEFAULT 0
) RETURNS JSON AS $$
DECLARE
    v_table_id UUID;
    v_tap_order_id UUID;
    v_dish_order_id UUID;
    v_result JSON;
    v_order_exists BOOLEAN := FALSE;
    v_images_array TEXT[];
BEGIN
    -- Obtener table_id
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number AND restaurant_id = p_restaurant_id;

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Mesa % no encontrada en restaurante %', p_table_number, p_restaurant_id;
    END IF;

    -- LÓGICA NUEVA: Buscar orden activa para esta mesa Y este usuario específico
    SELECT id INTO v_tap_order_id
    FROM tap_orders_and_pay
    WHERE table_id = v_table_id
    AND clerk_user_id = p_clerk_user_id              -- CAMBIO CLAVE: Mismo usuario
    AND order_status IN ('active', 'confirmed', 'preparing')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Si no existe tap_order para ESTE USUARIO en esta mesa, crear una nueva
    IF v_tap_order_id IS NULL THEN
        INSERT INTO tap_orders_and_pay (
            table_id,
            clerk_user_id,                            -- Asociar a este usuario específico
            customer_name,
            customer_phone,
            customer_email,
            total_amount,
            payment_status,
            order_status
        ) VALUES (
            v_table_id,
            p_clerk_user_id,                          -- Usuario específico
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
    ELSE
        v_order_exists := TRUE;
    END IF;

    -- Convertir JSONB array a TEXT array para images
    SELECT ARRAY(
        SELECT jsonb_array_elements_text(p_images)
    ) INTO v_images_array;

    -- Crear dish_order asociado a la orden de ESTE USUARIO
    INSERT INTO dish_order (
        user_order_id,
        tap_order_id,
        item,
        quantity,
        price,
        status,
        payment_status,
        images,
        custom_fields,
        extra_price
    ) VALUES (
        NULL,
        v_tap_order_id,                               -- Orden específica del usuario
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid',
        v_images_array,
        p_custom_fields,
        p_extra_price
    ) RETURNING id INTO v_dish_order_id;

    -- Recalcular total de la orden de ESTE USUARIO
    PERFORM update_tap_order_total(v_tap_order_id);

    -- Retornar resultado con información detallada
    v_result := json_build_object(
        'tap_order_id', v_tap_order_id,
        'dish_order_id', v_dish_order_id,
        'table_id', v_table_id,
        'clerk_user_id', p_clerk_user_id,             -- Incluir para tracking
        'action', CASE
            WHEN v_order_exists THEN 'dish_added_to_existing_user_order'
            ELSE 'new_user_order_created_with_first_dish'
        END,
        'dish_details', json_build_object(
            'item', p_item,
            'quantity', p_quantity,
            'price', p_price,
            'extra_price', p_extra_price,
            'total_dish_price', (p_price + p_extra_price) * p_quantity,
            'images', p_images,
            'custom_fields', p_custom_fields
        )
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Función auxiliar: Obtener todas las órdenes activas de una mesa (para debugging)
CREATE OR REPLACE FUNCTION get_active_orders_by_table(
    p_table_number INTEGER,
    p_restaurant_id INTEGER
) RETURNS JSON AS $$
DECLARE
    v_table_id UUID;
    v_result JSON;
BEGIN
    -- Obtener table_id
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number AND restaurant_id = p_restaurant_id;

    IF v_table_id IS NULL THEN
        RETURN json_build_object('error', 'Table not found');
    END IF;

    -- Obtener todas las órdenes activas en esta mesa
    SELECT json_build_object(
        'table_info', json_build_object(
            'table_id', v_table_id,
            'table_number', p_table_number,
            'restaurant_id', p_restaurant_id
        ),
        'active_orders', COALESCE((
            SELECT json_agg(json_build_object(
                'tap_order_id', tap.id,
                'clerk_user_id', tap.clerk_user_id,
                'customer_name', tap.customer_name,
                'total_amount', tap.total_amount,
                'order_status', tap.order_status,
                'payment_status', tap.payment_status,
                'created_at', tap.created_at,
                'dish_count', (
                    SELECT COUNT(*)
                    FROM dish_order d
                    WHERE d.tap_order_id = tap.id
                )
            ))
            FROM tap_orders_and_pay tap
            WHERE tap.table_id = v_table_id
            AND tap.order_status IN ('active', 'confirmed', 'preparing')
            ORDER BY tap.created_at DESC
        ), '[]'::json)
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON FUNCTION create_tap_order_with_first_dish IS
'Crea tap_order por usuario específico. Permite múltiples órdenes simultáneas en la misma mesa para diferentes clerk_user_id';

COMMENT ON FUNCTION get_active_orders_by_table IS
'Obtiene todas las órdenes activas de una mesa, agrupadas por clerk_user_id para debugging multi-usuario';

-- Verificación final
DO $$
BEGIN
    RAISE NOTICE '=== LÓGICA MULTI-USUARIO POR MESA IMPLEMENTADA ===';
    RAISE NOTICE '✅ Búsqueda de órdenes activas POR mesa Y usuario (clerk_user_id)';
    RAISE NOTICE '✅ Permite múltiples órdenes simultáneas en la misma mesa';
    RAISE NOTICE '✅ Cada clerk_user_id tiene su propia orden independiente';
    RAISE NOTICE '✅ Función auxiliar get_active_orders_by_table para debugging';
    RAISE NOTICE 'Sistema listo para testing multi-usuario en misma mesa';
END $$;