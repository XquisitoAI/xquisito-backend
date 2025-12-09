-- HABILITAR FILTROS DEMOGRÁFICOS EN DASHBOARD
-- Restaurar funcionalidad de filtros por género y edad
-- Fecha: 9 Diciembre 2025

-- Actualizar función get_dashboard_metrics para incluir filtros demográficos
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
            p.age as user_age
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN user_order uo ON uo.table_order_id = to1.id
        LEFT JOIN profiles p ON uo.user_id = p.user_id
        WHERE
            (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            -- ✅ FILTROS DEMOGRÁFICOS
            AND (p_gender IS NULL OR p_gender = 'todos' OR p.gender =
                CASE
                    WHEN p_gender = 'hombre' THEN 'male'
                    WHEN p_gender = 'mujer' THEN 'female'
                    WHEN p_gender = 'otro' THEN 'non-binary'
                    ELSE p.gender
                END
            )
            AND (p_age_range IS NULL OR p_age_range = 'todos' OR
                CASE p_age_range
                    WHEN '14-17' THEN p.age BETWEEN 14 AND 17
                    WHEN '18-25' THEN p.age BETWEEN 18 AND 25
                    WHEN '26-35' THEN p.age BETWEEN 26 AND 35
                    WHEN '36-45' THEN p.age BETWEEN 36 AND 45
                    WHEN '46+' THEN p.age >= 46
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
        LEFT JOIN profiles p2 ON uo2.user_id = p2.user_id
        WHERE
            (p_restaurant_id IS NULL OR t2.restaurant_id = p_restaurant_id)
            AND (p_branch_id IS NULL OR t2.branch_id = p_branch_id)
            AND (p_start_date IS NULL OR to2.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to2.created_at <= p_end_date)
            -- ✅ FILTROS DEMOGRÁFICOS
            AND (p_gender IS NULL OR p_gender = 'todos' OR p2.gender =
                CASE
                    WHEN p_gender = 'hombre' THEN 'male'
                    WHEN p_gender = 'mujer' THEN 'female'
                    WHEN p_gender = 'otro' THEN 'non-binary'
                    ELSE p2.gender
                END
            )
            AND (p_age_range IS NULL OR p_age_range = 'todos' OR
                CASE p_age_range
                    WHEN '14-17' THEN p2.age BETWEEN 14 AND 17
                    WHEN '18-25' THEN p2.age BETWEEN 18 AND 25
                    WHEN '26-35' THEN p2.age BETWEEN 26 AND 35
                    WHEN '36-45' THEN p2.age BETWEEN 36 AND 45
                    WHEN '46+' THEN p2.age >= 46
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
            'nota', 'Filtros demográficos habilitados'
        )
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Nueva función para tiempo promedio con filtros demográficos
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
        LEFT JOIN profiles p ON uo.user_id = p.user_id
        WHERE
            to1.closed_at IS NOT NULL
            AND to1.status = 'paid'
            AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            AND EXTRACT(EPOCH FROM (to1.closed_at - to1.created_at)) / 3600 <= 24
            -- ✅ FILTROS DEMOGRÁFICOS
            AND (p_gender IS NULL OR p_gender = 'todos' OR p.gender =
                CASE
                    WHEN p_gender = 'hombre' THEN 'male'
                    WHEN p_gender = 'mujer' THEN 'female'
                    WHEN p_gender = 'otro' THEN 'non-binary'
                    ELSE p.gender
                END
            )
            AND (p_age_range IS NULL OR p_age_range = 'todos' OR
                CASE p_age_range
                    WHEN '14-17' THEN p.age BETWEEN 14 AND 17
                    WHEN '18-25' THEN p.age BETWEEN 18 AND 25
                    WHEN '26-35' THEN p.age BETWEEN 26 AND 35
                    WHEN '36-45' THEN p.age BETWEEN 36 AND 45
                    WHEN '46+' THEN p.age >= 46
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

-- Nueva función para artículo más vendido con filtros demográficos
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
        LEFT JOIN profiles p ON uo.user_id = p.user_id
        WHERE
            (do1.payment_status = 'paid' OR to1.status = 'paid')
            AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            -- ✅ FILTROS DEMOGRÁFICOS
            AND (p_gender IS NULL OR p_gender = 'todos' OR p.gender =
                CASE
                    WHEN p_gender = 'hombre' THEN 'male'
                    WHEN p_gender = 'mujer' THEN 'female'
                    WHEN p_gender = 'otro' THEN 'non-binary'
                    ELSE p.gender
                END
            )
            AND (p_age_range IS NULL OR p_age_range = 'todos' OR
                CASE p_age_range
                    WHEN '14-17' THEN p.age BETWEEN 14 AND 17
                    WHEN '18-25' THEN p.age BETWEEN 18 AND 25
                    WHEN '26-35' THEN p.age BETWEEN 26 AND 35
                    WHEN '36-45' THEN p.age BETWEEN 36 AND 45
                    WHEN '46+' THEN p.age >= 46
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

-- Test para verificar que funcionan los filtros demográficos
CREATE OR REPLACE FUNCTION test_demographic_filters()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    male_data JSONB;
    female_data JSONB;
    error_msg TEXT := '';
BEGIN
    BEGIN
        -- Test filtro masculino
        SELECT get_dashboard_metrics(
            p_restaurant_id := 3,
            p_start_date := '2024-12-01'::timestamp,
            p_end_date := '2024-12-31'::timestamp,
            p_gender := 'hombre',
            p_age_range := 'todos',
            p_granularity := 'dia',
            p_branch_id := '14670b66-70d8-45ed-9d97-21efec9483c6'::uuid
        ) INTO male_data;

        -- Test filtro femenino
        SELECT get_dashboard_metrics(
            p_restaurant_id := 3,
            p_start_date := '2024-12-01'::timestamp,
            p_end_date := '2024-12-31'::timestamp,
            p_gender := 'mujer',
            p_age_range := 'todos',
            p_granularity := 'dia',
            p_branch_id := '14670b66-70d8-45ed-9d97-21efec9483c6'::uuid
        ) INTO female_data;
    EXCEPTION WHEN OTHERS THEN
        error_msg := SQLERRM;
    END;

    result := jsonb_build_object(
        'test_status', CASE WHEN error_msg = '' THEN 'SUCCESS' ELSE 'FAILED' END,
        'timestamp', NOW(),
        'error', error_msg,
        'male_metrics', male_data->'metricas',
        'female_metrics', female_data->'metricas'
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- COMENTARIOS:
-- 1. ✅ FILTROS DEMOGRÁFICOS: Ahora se aplican correctamente en todas las consultas
-- 2. 🎯 MAPEO: hombre→male, mujer→female, otro→non-binary
-- 3. 📊 EDAD: Rangos de edad funcionan con BETWEEN
-- 4. 🔧 COMPATIBLE: Mantiene compatibilidad con branch_id y otros filtros