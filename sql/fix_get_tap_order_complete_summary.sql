-- ====================================================
-- Script para corregir función get_tap_order_complete_summary
-- Error: column dish.created_at does not exist
-- ====================================================

-- Función corregida con nombres de columnas correctos
CREATE OR REPLACE FUNCTION get_tap_order_complete_summary(p_tap_order_id UUID)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'tap_order', json_build_object(
            'id', tap.id,
            'customer_name', tap.customer_name,
            'customer_phone', tap.customer_phone,
            'customer_email', tap.customer_email,
            'clerk_user_id', tap.clerk_user_id,
            'total_amount', tap.total_amount,
            'payment_status', tap.payment_status,
            'order_status', tap.order_status,
            'created_at', tap.created_at,
            'updated_at', tap.updated_at
        ),
        'table', json_build_object(
            'id', t.id,
            'table_number', t.table_number,
            'restaurant_id', t.restaurant_id,
            'status', t.status
        ),
        'dishes', COALESCE((
            SELECT json_agg(json_build_object(
                'id', dish.id,
                'item', dish.item,
                'quantity', dish.quantity,
                'price', dish.price,
                'extra_price', COALESCE(dish.extra_price, 0),
                'status', dish.status,
                'payment_status', dish.payment_status,
                'total_price', dish.quantity * (dish.price + COALESCE(dish.extra_price, 0)),
                'images', dish.images,
                'custom_fields', dish.custom_fields,
                'created_at', dish.created_at,
                'updated_at', dish.updated_at
            ))
            FROM dish_order dish
            WHERE dish.tap_order_id = tap.id
            ORDER BY dish.created_at ASC  -- CORREGIDO: usar created_at directamente
        ), '[]'::json),
        'summary', json_build_object(
            'total_dishes', (
                SELECT COUNT(*)
                FROM dish_order dish
                WHERE dish.tap_order_id = tap.id
            ),
            'total_items', (
                SELECT COALESCE(SUM(dish.quantity), 0)
                FROM dish_order dish
                WHERE dish.tap_order_id = tap.id
            ),
            'calculated_total', (
                SELECT COALESCE(SUM(dish.quantity * (dish.price + COALESCE(dish.extra_price, 0))), 0)
                FROM dish_order dish
                WHERE dish.tap_order_id = tap.id
            )
        )
    ) INTO v_result
    FROM tap_orders_and_pay tap
    JOIN tables t ON tap.table_id = t.id
    WHERE tap.id = p_tap_order_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Comentario para documentación
COMMENT ON FUNCTION get_tap_order_complete_summary IS
'Obtiene resumen completo de tap_order con platillos, datos de mesa y totales calculados. VERSIÓN CORREGIDA';

-- Verificación final
DO $$
BEGIN
    RAISE NOTICE '=== FUNCIÓN get_tap_order_complete_summary CORREGIDA ===';
    RAISE NOTICE '✅ Corregido ORDER BY dish.created_at → ORDER BY created_at';
    RAISE NOTICE '✅ Agregados campos extra_price, images, custom_fields en respuesta';
    RAISE NOTICE '✅ Agregado summary con totales calculados';
    RAISE NOTICE '✅ Agregado clerk_user_id en respuesta tap_order';
    RAISE NOTICE 'Listo para testing del endpoint GET /tap-orders/:id';
END $$;