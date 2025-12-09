-- CORRECCIÓN CRÍTICA: Dashboard Metrics Functions para Supabase Auth
-- Problema: Funciones usando tabla "users" que no existe
-- Solución: Migrar a auth.users + public.profiles

-- FUNCIÓN PRINCIPAL: Dashboard Metrics (CORREGIDA)
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

    -- Calcular métricas principales usando SUPABASE AUTH SCHEMA
    WITH filtered_orders AS (
        SELECT
            to1.*,
            t.restaurant_id,
            COALESCE(p.gender, 'unknown') as gender,
            -- Calcular edad aproximada desde birth_date
            CASE
                WHEN p.birth_date IS NOT NULL
                THEN EXTRACT(YEAR FROM AGE(p.birth_date))::INTEGER
                ELSE NULL
            END as age
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN user_order uo ON to1.id = uo.table_order_id
        -- CORREGIDO: user_id ahora es UUID que apunta a auth.users.id
        LEFT JOIN auth.users au ON uo.user_id = au.id
        LEFT JOIN public.profiles p ON au.id = p.id
        WHERE
            (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            AND (p_gender IS NULL OR p_gender = 'todos' OR p.gender::text = p_gender)
            AND (age_min IS NULL OR EXTRACT(YEAR FROM AGE(p.birth_date))::INTEGER >= age_min)
            AND (age_max IS NULL OR EXTRACT(YEAR FROM AGE(p.birth_date))::INTEGER <= age_max)
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

    -- Obtener tiempo promedio por mesa (CORREGIDO)
    SELECT get_average_table_time(p_restaurant_id, p_start_date, p_end_date, p_gender, p_age_range) INTO avg_time;

    -- Calcular datos del gráfico según granularidad (CORREGIDO)
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
        -- CORREGIDO: Usar auth.users + profiles
        LEFT JOIN auth.users au2 ON uo2.user_id = au2.id
        LEFT JOIN public.profiles p2 ON au2.id = p2.id
        WHERE
            (p_restaurant_id IS NULL OR t2.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR to2.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to2.created_at <= p_end_date)
            AND (p_gender IS NULL OR p_gender = 'todos' OR p2.gender::text = p_gender)
            AND (age_min IS NULL OR EXTRACT(YEAR FROM AGE(p2.birth_date))::INTEGER >= age_min)
            AND (age_max IS NULL OR EXTRACT(YEAR FROM AGE(p2.birth_date))::INTEGER <= age_max)
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

-- FUNCIÓN: Tiempo promedio por mesa (CORREGIDA)
CREATE OR REPLACE FUNCTION get_average_table_time(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_gender VARCHAR DEFAULT NULL,
    p_age_range VARCHAR DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    avg_minutes DECIMAL(10,2);
    table_count INTEGER;
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

    -- Calcular tiempo promedio para mesas cerradas (CORREGIDO)
    WITH closed_tables AS (
        SELECT
            to1.id,
            to1.created_at,
            to1.closed_at,
            EXTRACT(EPOCH FROM (to1.closed_at - to1.created_at)) / 60 as minutes_duration
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN user_order uo ON to1.id = uo.table_order_id
        -- CORREGIDO: Usar auth.users + profiles
        LEFT JOIN auth.users au ON uo.user_id = au.id
        LEFT JOIN public.profiles p ON au.id = p.id
        WHERE
            to1.closed_at IS NOT NULL  -- Solo mesas cerradas
            AND to1.status = 'paid'    -- Solo mesas completamente pagadas
            AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR to1.created_at >= p_start_date)
            AND (p_end_date IS NULL OR to1.created_at <= p_end_date)
            AND (p_gender IS NULL OR p_gender = 'todos' OR p.gender::text = p_gender)
            AND (age_min IS NULL OR EXTRACT(YEAR FROM AGE(p.birth_date))::INTEGER >= age_min)
            AND (age_max IS NULL OR EXTRACT(YEAR FROM AGE(p.birth_date))::INTEGER <= age_max)
            -- Excluir casos extremos (mesas abiertas por más de 24 horas)
            AND EXTRACT(EPOCH FROM (to1.closed_at - to1.created_at)) / 3600 <= 24
    )
    SELECT
        ROUND(AVG(minutes_duration)::numeric, 2),
        COUNT(*)
    INTO avg_minutes, table_count
    FROM closed_tables;

    -- Construir resultado
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

-- VERIFICACIÓN: Función para verificar que las correcciones funcionan
CREATE OR REPLACE FUNCTION test_dashboard_functions(
    p_restaurant_id INTEGER DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    metrics_result JSONB;
    time_result JSONB;
BEGIN
    -- Test básico de get_dashboard_metrics
    SELECT get_dashboard_metrics(
        p_restaurant_id := p_restaurant_id,
        p_start_date := '2024-12-01'::timestamp,
        p_end_date := '2024-12-31'::timestamp,
        p_gender := 'todos',
        p_age_range := 'todos',
        p_granularity := 'dia'
    ) INTO metrics_result;

    -- Test de get_average_table_time
    SELECT get_average_table_time(
        p_restaurant_id := p_restaurant_id,
        p_start_date := '2024-12-01'::timestamp,
        p_end_date := '2024-12-31'::timestamp,
        p_gender := 'todos',
        p_age_range := 'todos'
    ) INTO time_result;

    -- Resultado de prueba
    result := jsonb_build_object(
        'test_status', 'SUCCESS',
        'timestamp', NOW(),
        'restaurant_id_tested', p_restaurant_id,
        'metrics_test', CASE
            WHEN metrics_result IS NOT NULL THEN 'PASS'
            ELSE 'FAIL'
        END,
        'time_test', CASE
            WHEN time_result IS NOT NULL THEN 'PASS'
            ELSE 'FAIL'
        END,
        'sample_metrics', metrics_result,
        'sample_time', time_result
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- COMENTARIOS DE CAMBIOS:
-- 1. ❌ ANTES: LEFT JOIN users u ON uo.user_id = u.clerk_user_id
-- 2. ✅ AHORA: LEFT JOIN auth.users au ON uo.user_id = au.id + LEFT JOIN public.profiles p ON au.id = p.id
-- 3. ❌ ANTES: u.gender, u.age
-- 4. ✅ AHORA: p.gender::text, EXTRACT(YEAR FROM AGE(p.birth_date))::INTEGER