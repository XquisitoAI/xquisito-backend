-- ====================================================
-- Script para corregir la función get_active_orders_by_table
-- Eliminar error de GROUP BY
-- ====================================================

-- Función corregida sin problemas de GROUP BY
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

    -- Obtener todas las órdenes activas en esta mesa (SIN ORDER BY para evitar GROUP BY)
    SELECT json_build_object(
        'table_info', json_build_object(
            'table_id', v_table_id,
            'table_number', p_table_number,
            'restaurant_id', p_restaurant_id
        ),
        'active_orders', COALESCE((
            SELECT json_agg(
                json_build_object(
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
                )
            )
            FROM tap_orders_and_pay tap
            WHERE tap.table_id = v_table_id
            AND tap.order_status IN ('active', 'confirmed', 'preparing')
        ), '[]'::json),
        'total_active_orders', (
            SELECT COUNT(*)
            FROM tap_orders_and_pay tap
            WHERE tap.table_id = v_table_id
            AND tap.order_status IN ('active', 'confirmed', 'preparing')
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Query directa alternativa (por si la función sigue fallando)
-- Puedes usar esta query directamente en lugar de la función:
/*
SELECT
    json_build_object(
        'table_number', 14,
        'restaurant_id', 3,
        'active_orders', json_agg(
            json_build_object(
                'tap_order_id', tap.id,
                'clerk_user_id', tap.clerk_user_id,
                'customer_name', tap.customer_name,
                'total_amount', tap.total_amount,
                'order_status', tap.order_status,
                'dish_count', (
                    SELECT COUNT(*)
                    FROM dish_order d
                    WHERE d.tap_order_id = tap.id
                )
            )
        ),
        'total_orders', COUNT(*)
    ) as result
FROM tap_orders_and_pay tap
JOIN tables t ON tap.table_id = t.id
WHERE t.table_number = 14
AND t.restaurant_id = 3
AND tap.order_status IN ('active', 'confirmed', 'preparing');
*/

-- Verificación
DO $$
BEGIN
    RAISE NOTICE '=== FUNCIÓN get_active_orders_by_table CORREGIDA ===';
    RAISE NOTICE '✅ Eliminado ORDER BY que causaba conflicto con GROUP BY';
    RAISE NOTICE '✅ Agregado contador total_active_orders';
    RAISE NOTICE '✅ Query alternativa disponible como comentario';
    RAISE NOTICE 'Listo para testing multi-usuario';
END $$;