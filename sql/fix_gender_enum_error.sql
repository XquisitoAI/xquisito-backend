-- CORRECCIÓN RÁPIDA: Error enum gender_type "unknown"
-- Problema: Función usa COALESCE(p.gender, 'unknown') pero enum no acepta 'unknown'
-- Solución: Usar 'other' o hacer COALESCE con NULL
-- Fecha: 9 Diciembre 2025

-- OPCIÓN 1: Agregar 'unknown' al enum (más cambios)
-- ALTER TYPE gender_type ADD VALUE 'unknown';

-- OPCIÓN 2: Cambiar función para usar 'other' como default (más simple)
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

    -- Calcular métricas principales - CORREGIDO: Sin COALESCE problemático
    WITH filtered_orders AS (
        SELECT
            to1.*,
            t.restaurant_id,
            p.gender,  -- SIN COALESCE, permite NULL
            -- Calcular edad aproximada desde birth_date
            CASE
                WHEN p.birth_date IS NOT NULL
                THEN EXTRACT(YEAR FROM AGE(p.birth_date))::INTEGER
                ELSE NULL
            END as age
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN user_order uo ON to1.id = uo.table_order_id
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

    -- Obtener tiempo promedio por mesa
    SELECT get_average_table_time(p_restaurant_id, p_start_date, p_end_date, p_gender, p_age_range) INTO avg_time;

    -- Calcular datos del gráfico según granularidad - CORREGIDO
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

-- FUNCIÓN get_average_table_time también necesita corrección
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

    -- Calcular tiempo promedio para mesas cerradas - CORREGIDO: Sin COALESCE problemático
    WITH closed_tables AS (
        SELECT
            to1.id,
            to1.created_at,
            to1.closed_at,
            EXTRACT(EPOCH FROM (to1.closed_at - to1.created_at)) / 60 as minutes_duration
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN user_order uo ON to1.id = uo.table_order_id
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

-- COMENTARIOS DE LA CORRECCIÓN:
-- 1. ❌ PROBLEMA: COALESCE(p.gender, 'unknown') - enum no acepta 'unknown'
-- 2. ✅ SOLUCIÓN: Usar p.gender sin COALESCE (permite NULL)
-- 3. 📊 RESULTADO: Dashboard funcionará sin errores de enum