-- Nueva función corregida para obtener órdenes con paginación, filtros y detalles de items
-- Corrige nombres de columnas según esquema real y agrega filtrado por fecha
CREATE OR REPLACE FUNCTION get_orders_with_pagination(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 5,
    p_offset INTEGER DEFAULT 0,
    p_status VARCHAR DEFAULT 'todos',
    p_date_filter VARCHAR DEFAULT 'todos', -- 'hoy', 'ayer', 'semana', 'mes', 'todos'
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    total_count INTEGER;
    orders_data JSONB;
BEGIN
    -- Primero obtener el conteo total para paginación
    SELECT COUNT(DISTINCT to1.id) INTO total_count
    FROM table_order to1
    LEFT JOIN tables t ON to1.table_id = t.id
    WHERE
        (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
        AND (
            p_status = 'todos' OR
            (p_status = 'not_paid' AND to1.status = 'not_paid') OR
            (p_status = 'partial' AND to1.status = 'partial') OR
            (p_status = 'paid' AND to1.status = 'paid')
        )
        AND (
            p_date_filter = 'todos' OR
            (p_date_filter = 'hoy' AND DATE(to1.created_at) = CURRENT_DATE) OR
            (p_date_filter = 'ayer' AND DATE(to1.created_at) = CURRENT_DATE - INTERVAL '1 day') OR
            (p_date_filter = 'semana' AND to1.created_at >= CURRENT_DATE - INTERVAL '7 days') OR
            (p_date_filter = 'mes' AND to1.created_at >= CURRENT_DATE - INTERVAL '30 days') OR
            (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND DATE(to1.created_at) BETWEEN p_start_date AND p_end_date)
        );

    -- Obtener órdenes con items detallados
    WITH orders_with_items AS (
        SELECT
            to1.id,
            t.table_number,
            to1.total_amount,
            to1.paid_amount,
            to1.status,
            to1.created_at,
            to1.closed_at,
            r.name as restaurant_name,
            COUNT(DISTINCT do1.id) as items_count,
            -- Agregamos JSON de items detallados con nombres de columnas correctos
            COALESCE(
                JSON_AGG(
                    DISTINCT jsonb_build_object(
                        'id', do1.id,
                        'nombre', do1.item,
                        'cantidad', do1.quantity,
                        'precio', do1.price,
                        'precio_total', (do1.quantity * do1.price), -- Calculado en lugar de columna
                        'estado_pago', do1.payment_status,
                        'estado_cocina', do1.status
                        -- Removido 'extras' y 'imagen' porque no existen en esquema base
                    )
                ) FILTER (WHERE do1.id IS NOT NULL),
                '[]'::json
            ) as items
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN restaurants r ON t.restaurant_id = r.id
        LEFT JOIN user_order uo ON to1.id = uo.table_order_id
        LEFT JOIN dish_order do1 ON uo.id = do1.user_order_id
        WHERE
            (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (
                p_status = 'todos' OR
                (p_status = 'not_paid' AND to1.status = 'not_paid') OR
                (p_status = 'partial' AND to1.status = 'partial') OR
                (p_status = 'paid' AND to1.status = 'paid')
            )
            AND (
                p_date_filter = 'todos' OR
                (p_date_filter = 'hoy' AND DATE(to1.created_at) = CURRENT_DATE) OR
                (p_date_filter = 'ayer' AND DATE(to1.created_at) = CURRENT_DATE - INTERVAL '1 day') OR
                (p_date_filter = 'semana' AND to1.created_at >= CURRENT_DATE - INTERVAL '7 days') OR
                (p_date_filter = 'mes' AND to1.created_at >= CURRENT_DATE - INTERVAL '30 days') OR
                (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND DATE(to1.created_at) BETWEEN p_start_date AND p_end_date)
            )
        GROUP BY to1.id, t.table_number, to1.total_amount, to1.paid_amount, to1.status, to1.created_at, to1.closed_at, r.name
        ORDER BY to1.created_at DESC
        LIMIT p_limit OFFSET p_offset
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'table_number', table_number,
            'total_amount', total_amount,
            'paid_amount', COALESCE(paid_amount, 0),
            'status', status,
            'created_at', created_at,
            'closed_at', closed_at,
            'restaurant_name', restaurant_name,
            'items_count', items_count,
            'items', items
        )
    ) INTO orders_data
    FROM orders_with_items;

    -- Construir resultado con metadatos de paginación
    result := jsonb_build_object(
        'orders', COALESCE(orders_data, '[]'::jsonb),
        'total_count', total_count,
        'returned_count', COALESCE(jsonb_array_length(orders_data), 0),
        'has_more', (p_offset + p_limit) < total_count,
        'pagination', jsonb_build_object(
            'limit', p_limit,
            'offset', p_offset,
            'next_offset', CASE WHEN (p_offset + p_limit) < total_count THEN p_offset + p_limit ELSE NULL END
        )
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;