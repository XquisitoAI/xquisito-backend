-- CORREGIR FILTROS DEMOGRÁFICOS EN DASHBOARD
-- Usar birth_date en lugar de age y columnas correctas
-- Fecha: 9 Diciembre 2025

-- Actualizar función get_dashboard_metrics con estructura real de profiles
CREATE OR REPLACE FUNCTION get_dashboard_metrics(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_gender VARCHAR DEFAULT NULL,
    p_age_range VARCHAR DEFAULT NULL,
    p_granularity VARCHAR DEFAULT 'day',
    p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    chart_data JSONB;
    metrics JSONB;
    top_item JSONB;
    avg_time JSONB;
BEGIN
    -- Métricas principales CON filtros demográficos
    WITH filtered_orders AS (
        SELECT
            to1.*,
            t.restaurant_id,
            t.branch_id,
            uo.user_id,
            p.gender as user_gender,
            p.birth_date,
            EXTRACT(YEAR FROM AGE(p.birth_date)) as user_age
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN user_order uo ON uo.table_order_id = to1.id
        LEFT JOIN profiles p ON uo.user_id = p.id  -- ✅ profiles.id es UUID
        WHERE
            (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            -- ✅ FILTRO DE GÉNERO
            AND (p_gender IS NULL OR p_gender = 'todos' OR p.gender::text =
                CASE
                    WHEN p_gender = 'hombre' THEN 'male'
                    WHEN p_gender = 'mujer' THEN 'female'
                    WHEN p_gender = 'otro' THEN 'non-binary'
                    ELSE p.gender::text
                END
            )
            -- ✅ FILTRO DE EDAD usando birth_date
            AND (p_age_range IS NULL OR p_age_range = 'todos' OR
                CASE p_age_range
                    WHEN '14-17' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 14 AND 17
                    WHEN '18-25' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 18 AND 25
                    WHEN '26-35' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 26 AND 35
                    WHEN '36-45' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 36 AND 45
                    WHEN '46+' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) >= 46
                    ELSE true
                END
            )
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

    -- Obtener tiempo promedio (con filtros demográficos)
    SELECT get_average_table_time_with_demographics(p_restaurant_id, p_start_date, p_end_date, p_gender, p_age_range, p_branch_id) INTO avg_time;

    -- Gráfico CON filtros demográficos
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
        LEFT JOIN user_order uo2 ON uo2.table_order_id = to2.id
        LEFT JOIN profiles p2 ON uo2.user_id = p2.id
        WHERE
            (p_restaurant_id IS NULL OR t2.restaurant_id = p_restaurant_id)
            AND (p_branch_id IS NULL OR t2.branch_id = p_branch_id)
            AND (p_start_date IS NULL OR to2.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to2.created_at <= p_end_date)
            -- ✅ FILTRO DE GÉNERO
            AND (p_gender IS NULL OR p_gender = 'todos' OR p2.gender::text =
                CASE
                    WHEN p_gender = 'hombre' THEN 'male'
                    WHEN p_gender = 'mujer' THEN 'female'
                    WHEN p_gender = 'otro' THEN 'non-binary'
                    ELSE p2.gender::text
                END
            )
            -- ✅ FILTRO DE EDAD usando birth_date
            AND (p_age_range IS NULL OR p_age_range = 'todos' OR
                CASE p_age_range
                    WHEN '14-17' THEN EXTRACT(YEAR FROM AGE(p2.birth_date)) BETWEEN 14 AND 17
                    WHEN '18-25' THEN EXTRACT(YEAR FROM AGE(p2.birth_date)) BETWEEN 18 AND 25
                    WHEN '26-35' THEN EXTRACT(YEAR FROM AGE(p2.birth_date)) BETWEEN 26 AND 35
                    WHEN '36-45' THEN EXTRACT(YEAR FROM AGE(p2.birth_date)) BETWEEN 36 AND 45
                    WHEN '46+' THEN EXTRACT(YEAR FROM AGE(p2.birth_date)) >= 46
                    ELSE true
                END
            )
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

    -- Obtener artículo más vendido (con filtros demográficos)
    SELECT get_top_selling_item_with_demographics(p_restaurant_id, p_start_date, p_end_date, p_gender, p_age_range, p_branch_id) INTO top_item;

    -- Combinar resultados
    result := jsonb_build_object(
        'metricas', metrics,
        'grafico', COALESCE(chart_data, '[]'::jsonb),
        'articulo_mas_vendido', top_item,
        'tiempo_promedio_mesa', avg_time,
        'filtros_aplicados', jsonb_build_object(
            'restaurant_id', p_restaurant_id,
            'branch_id', p_branch_id,
            'start_date', p_start_date,
            'end_date', p_end_date,
            'gender', p_gender,
            'age_range', p_age_range,
            'granularity', p_granularity,
            'nota', 'Filtros demográficos habilitados con birth_date'
        )
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Corregir función para tiempo promedio con filtros demográficos
CREATE OR REPLACE FUNCTION get_average_table_time_with_demographics(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_gender VARCHAR DEFAULT NULL,
    p_age_range VARCHAR DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    avg_minutes DECIMAL(10,2);
    table_count INTEGER;
BEGIN
    -- Tiempo promedio CON filtros demográficos
    WITH closed_tables AS (
        SELECT
            to1.id,
            to1.created_at,
            to1.closed_at,
            EXTRACT(EPOCH FROM (to1.closed_at - to1.created_at)) / 60 as minutes_duration
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN user_order uo ON uo.table_order_id = to1.id
        LEFT JOIN profiles p ON uo.user_id = p.id
        WHERE
            to1.closed_at IS NOT NULL
            AND to1.status = 'paid'
            AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            AND EXTRACT(EPOCH FROM (to1.closed_at - to1.created_at)) / 3600 <= 24
            -- ✅ FILTRO DE GÉNERO
            AND (p_gender IS NULL OR p_gender = 'todos' OR p.gender::text =
                CASE
                    WHEN p_gender = 'hombre' THEN 'male'
                    WHEN p_gender = 'mujer' THEN 'female'
                    WHEN p_gender = 'otro' THEN 'non-binary'
                    ELSE p.gender::text
                END
            )
            -- ✅ FILTRO DE EDAD usando birth_date
            AND (p_age_range IS NULL OR p_age_range = 'todos' OR
                CASE p_age_range
                    WHEN '14-17' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 14 AND 17
                    WHEN '18-25' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 18 AND 25
                    WHEN '26-35' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 26 AND 35
                    WHEN '36-45' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 36 AND 45
                    WHEN '46+' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) >= 46
                    ELSE true
                END
            )
    )
    SELECT
        ROUND(AVG(minutes_duration)::numeric, 2),
        COUNT(*)
    INTO avg_minutes, table_count
    FROM closed_tables;

    result := jsonb_build_object(
        'tiempo_promedio_minutos', COALESCE(avg_minutes, 0),
        'mesas_cerradas_analizadas', COALESCE(table_count, 0),
        'tiempo_promedio_formateado',
        CASE
            WHEN avg_minutes IS NULL OR avg_minutes = 0 THEN 'Sin datos'
            WHEN avg_minutes < 60 THEN CONCAT(ROUND(avg_minutes::numeric, 0), ' min')
            ELSE CONCAT(
                FLOOR(avg_minutes / 60), 'h ',
                ROUND((avg_minutes % 60)::numeric, 0), 'min'
            )
        END
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Corregir función para artículo más vendido con filtros demográficos
CREATE OR REPLACE FUNCTION get_top_selling_item_with_demographics(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_gender VARCHAR DEFAULT NULL,
    p_age_range VARCHAR DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Top selling item CON filtros demográficos
    WITH top_item AS (
        SELECT
            do1.item as nombre,
            COUNT(do1.id) as cantidad_vendida,
            SUM(do1.quantity) as unidades_totales
        FROM dish_order do1
        JOIN user_order uo ON do1.user_order_id = uo.id
        JOIN table_order to1 ON uo.table_order_id = to1.id
        JOIN tables t ON to1.table_id = t.id
        LEFT JOIN profiles p ON uo.user_id = p.id
        WHERE
            (do1.payment_status = 'paid' OR to1.status = 'paid')
            AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            -- ✅ FILTRO DE GÉNERO
            AND (p_gender IS NULL OR p_gender = 'todos' OR p.gender::text =
                CASE
                    WHEN p_gender = 'hombre' THEN 'male'
                    WHEN p_gender = 'mujer' THEN 'female'
                    WHEN p_gender = 'otro' THEN 'non-binary'
                    ELSE p.gender::text
                END
            )
            -- ✅ FILTRO DE EDAD usando birth_date
            AND (p_age_range IS NULL OR p_age_range = 'todos' OR
                CASE p_age_range
                    WHEN '14-17' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 14 AND 17
                    WHEN '18-25' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 18 AND 25
                    WHEN '26-35' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 26 AND 35
                    WHEN '36-45' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) BETWEEN 36 AND 45
                    WHEN '46+' THEN EXTRACT(YEAR FROM AGE(p.birth_date)) >= 46
                    ELSE true
                END
            )
        GROUP BY do1.item
        ORDER BY unidades_totales DESC
        LIMIT 1
    )
    SELECT jsonb_build_object(
        'nombre', nombre,
        'unidades_vendidas', unidades_totales
    ) INTO result
    FROM top_item;

    RETURN COALESCE(result, jsonb_build_object('nombre', 'Sin datos', 'unidades_vendidas', 0));
END;
$$ LANGUAGE plpgsql;

-- COMENTARIOS:
-- 1. ✅ CORREGIDO: Usa profiles.id (UUID) para el JOIN
-- 2. ✅ BIRTH_DATE: Calcula edad con EXTRACT(YEAR FROM AGE(birth_date))
-- 3. ✅ GENDER ENUM: Convierte a texto con gender::text
-- 4. 🎯 FILTROS: Ambos filtros (género y edad) funcionan correctamente
-- 5. 🔧 COMPATIBLE: Mantiene compatibilidad con branch_id