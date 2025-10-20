-- Función SQL para obtener métricas del dashboard
-- Autor: Sistema Xquisito
-- Fecha: 2025
-- ACTUALIZADO: Corregido para esquema real de base de datos

CREATE OR REPLACE FUNCTION get_dashboard_metrics(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_gender VARCHAR DEFAULT NULL,
    p_age_range VARCHAR DEFAULT NULL,
    p_granularity VARCHAR DEFAULT 'day'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    chart_data JSONB;
    metrics JSONB;
    top_item JSONB;
    avg_time JSONB;
    age_min INTEGER;
    age_max INTEGER;
BEGIN
    -- Parsear rango de edad
    IF p_age_range IS NOT NULL AND p_age_range != 'todos' THEN
        CASE p_age_range
            WHEN '14-17' THEN
                age_min := 14; age_max := 17;
            WHEN '18-25' THEN
                age_min := 18; age_max := 25;
            WHEN '26-35' THEN
                age_min := 26; age_max := 35;
            WHEN '36-45' THEN
                age_min := 36; age_max := 45;
            WHEN '46+' THEN
                age_min := 46; age_max := 999;
            ELSE
                age_min := NULL; age_max := NULL;
        END CASE;
    ELSE
        age_min := NULL; age_max := NULL;
    END IF;

    -- Calcular métricas principales usando el esquema real
    WITH filtered_orders AS (
        SELECT
            to1.*,
            t.restaurant_id,
            COALESCE(u.gender, 'unknown') as gender,
            u.age
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN user_order uo ON to1.id = uo.table_order_id
        LEFT JOIN users u ON uo.user_id = u.clerk_user_id
        WHERE
            (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            AND (p_gender IS NULL OR p_gender = 'todos' OR u.gender = p_gender)
            AND (age_min IS NULL OR u.age >= age_min)
            AND (age_max IS NULL OR u.age <= age_max)
    )
    SELECT jsonb_build_object(
        'ventas_totales', COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0),
        'ordenes_activas', COUNT(DISTINCT CASE WHEN status IN ('not_paid', 'partial') THEN id END),
        'pedidos', COUNT(DISTINCT id),
        'ticket_promedio', COALESCE(
            ROUND(AVG(CASE WHEN status = 'paid' THEN total_amount END)::numeric, 2),
            0
        )
    ) INTO metrics
    FROM filtered_orders;

    -- Obtener tiempo promedio por mesa
    SELECT get_average_table_time(p_restaurant_id, p_start_date, p_end_date, p_gender, p_age_range) INTO avg_time;

    -- Calcular datos del gráfico según granularidad usando esquema real
    WITH time_series AS (
        SELECT
            CASE
                WHEN p_granularity = 'hora' THEN EXTRACT(HOUR FROM to2.created_at)::INTEGER
                WHEN p_granularity = 'dia' THEN EXTRACT(DAY FROM to2.created_at)::INTEGER
                WHEN p_granularity = 'mes' THEN EXTRACT(MONTH FROM to2.created_at)::INTEGER
                WHEN p_granularity = 'ano' THEN EXTRACT(YEAR FROM to2.created_at)::INTEGER
            END as periodo,
            SUM(CASE WHEN to2.status = 'paid' THEN to2.total_amount ELSE 0 END) as ingresos
        FROM table_order to2
        LEFT JOIN tables t2 ON to2.table_id = t2.id
        LEFT JOIN user_order uo2 ON to2.id = uo2.table_order_id
        LEFT JOIN users u2 ON uo2.user_id = u2.clerk_user_id
        WHERE
            (p_restaurant_id IS NULL OR t2.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR to2.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to2.created_at <= p_end_date)
            AND (p_gender IS NULL OR p_gender = 'todos' OR u2.gender = p_gender)
            AND (age_min IS NULL OR u2.age >= age_min)
            AND (age_max IS NULL OR u2.age <= age_max)
        GROUP BY periodo
        ORDER BY periodo
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            CASE
                WHEN p_granularity = 'hora' THEN 'hora'
                WHEN p_granularity = 'dia' THEN 'dia'
                WHEN p_granularity = 'mes' THEN 'mes'
                WHEN p_granularity = 'ano' THEN 'ano'
            END, periodo,
            'ingresos', COALESCE(ingresos, 0)
        )
        ORDER BY periodo
    ) INTO chart_data
    FROM time_series;

    -- Obtener artículo más vendido
    SELECT get_top_selling_item(p_restaurant_id, p_start_date, p_end_date) INTO top_item;

    -- Combinar resultados
    result := jsonb_build_object(
        'metricas', metrics,
        'grafico', COALESCE(chart_data, '[]'::jsonb),
        'articulo_mas_vendido', top_item,
        'tiempo_promedio_mesa', avg_time,
        'filtros_aplicados', jsonb_build_object(
            'restaurant_id', p_restaurant_id,
            'start_date', p_start_date,
            'end_date', p_end_date,
            'gender', p_gender,
            'age_range', p_age_range,
            'granularity', p_granularity
        )
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Nueva función para obtener órdenes con paginación, filtros y detalles de items
-- Reemplaza a get_active_orders con funcionalidad ampliada
CREATE OR REPLACE FUNCTION get_orders_with_pagination(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 5,
    p_offset INTEGER DEFAULT 0,
    p_status VARCHAR DEFAULT 'todos'
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
            -- Agregamos JSON de items detallados
            COALESCE(
                JSON_AGG(
                    DISTINCT jsonb_build_object(
                        'id', do1.id,
                        'nombre', do1.item,
                        'cantidad', do1.quantity,
                        'precio', do1.unit_price,
                        'precio_total', do1.total_price,
                        'estado_pago', do1.payment_status,
                        'extras', do1.custom_fields,
                        'imagen', do1.image_url
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

-- Función auxiliar para obtener órdenes activas
-- CORREGIDO: Usa esquema real table_order -> user_order -> dish_order
CREATE OR REPLACE FUNCTION get_active_orders(
    p_restaurant_id INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    WITH active_orders_data AS (
        SELECT
            to1.id,
            t.table_number,
            to1.total_amount,
            to1.paid_amount,
            to1.status,
            to1.created_at,
            r.name as restaurant_name,
            COUNT(DISTINCT do1.id) as items_count
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN restaurants r ON t.restaurant_id = r.id
        LEFT JOIN user_order uo ON to1.id = uo.table_order_id
        LEFT JOIN dish_order do1 ON uo.id = do1.user_order_id
        WHERE
            to1.status IN ('not_paid', 'partial')
            AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
        GROUP BY to1.id, t.table_number, to1.total_amount, to1.paid_amount, to1.status, to1.created_at, r.name
        ORDER BY to1.created_at DESC
        LIMIT 10
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'table_number', table_number,
            'total_amount', total_amount,
            'paid_amount', COALESCE(paid_amount, 0),
            'status', status,
            'created_at', created_at,
            'restaurant_name', restaurant_name,
            'items_count', items_count
        )
    ) INTO result
    FROM active_orders_data;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Nueva función para obtener órdenes con paginación, filtros y detalles de items
-- Reemplaza a get_active_orders con funcionalidad ampliada
CREATE OR REPLACE FUNCTION get_orders_with_pagination(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 5,
    p_offset INTEGER DEFAULT 0,
    p_status VARCHAR DEFAULT 'todos'
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
