-- FIX RADICAL: Eliminar temporalmente filtros demográficos para resolver permisos
-- Problema: Backend Node.js tiene permisos diferentes que ambiente de test Supabase
-- Solución: Funciones dashboard SIN auth.users/profiles hasta resolver permisos
-- Objetivo: Dashboard funciona AHORA para continuar con filtro sucursales

-- FUNCIÓN get_dashboard_metrics SIN filtros demográficos (TEMPORAL)
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
BEGIN
    -- Métricas principales SIN JOINs problemáticos
    WITH filtered_orders AS (
        SELECT
            to1.*,
            t.restaurant_id
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        WHERE
            (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
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

    -- Obtener tiempo promedio (simplificado)
    SELECT get_average_table_time_simple(p_restaurant_id, p_start_date, p_end_date) INTO avg_time;

    -- Gráfico SIN JOINs problemáticos
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
        WHERE
            (p_restaurant_id IS NULL OR t2.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR to2.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to2.created_at <= p_end_date)
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
            'granularity', p_granularity,
            'nota', 'Filtros demográficos temporalmente deshabilitados'
        )
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- FUNCIÓN get_average_table_time_simple (SIN auth.users)
CREATE OR REPLACE FUNCTION get_average_table_time_simple(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    avg_minutes DECIMAL(10,2);
    table_count INTEGER;
BEGIN
    -- Tiempo promedio SIN filtros demográficos
    WITH closed_tables AS (
        SELECT
            to1.id,
            to1.created_at,
            to1.closed_at,
            EXTRACT(EPOCH FROM (to1.closed_at - to1.created_at)) / 60 as minutes_duration
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        WHERE
            to1.closed_at IS NOT NULL
            AND to1.status = 'paid'
            AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            AND EXTRACT(EPOCH FROM (to1.closed_at - to1.created_at)) / 3600 <= 24
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

-- SOBRESCRIBIR get_average_table_time para que use la versión simple
CREATE OR REPLACE FUNCTION get_average_table_time(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_gender VARCHAR DEFAULT NULL,
    p_age_range VARCHAR DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
    -- Ignorar filtros demográficos y usar versión simple
    RETURN get_average_table_time_simple(p_restaurant_id, p_start_date, p_end_date);
END;
$$ LANGUAGE plpgsql;

-- TEST FINAL
CREATE OR REPLACE FUNCTION test_radical_fix()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    test_result JSONB;
    error_msg TEXT := '';
BEGIN
    BEGIN
        SELECT get_dashboard_metrics(1, '2024-12-01'::timestamp, '2024-12-31'::timestamp, 'todos', 'todos', 'dia') INTO test_result;
    EXCEPTION WHEN OTHERS THEN
        error_msg := SQLERRM;
    END;

    result := jsonb_build_object(
        'radical_fix_status', CASE WHEN error_msg = '' THEN 'SUCCESS' ELSE 'FAILED' END,
        'timestamp', NOW(),
        'error', error_msg,
        'dashboard_working', CASE WHEN test_result IS NOT NULL THEN 'YES' ELSE 'NO' END,
        'sample_data', test_result,
        'note', 'Dashboard simplificado - SIN filtros demográficos por permisos'
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- EJECUTAR TEST
SELECT test_radical_fix();

-- COMENTARIOS:
-- 1. 🛡️ SIN PERMISOS: Sin auth.users/profiles que causen problemas
-- 2. 📊 FUNCIONAL: Métricas básicas + gráficos funcionan
-- 3. ⚡ INMEDIATO: Dashboard funciona AHORA
-- 4. 🎯 OBJETIVO: Continuar con filtro de sucursales (tarea prioritaria)
-- 5. 🔄 FUTURO: Restaurar filtros demográficos cuando se resuelvan permisos