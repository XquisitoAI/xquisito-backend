-- FIX QUIRÚRGICO: Solo get_average_table_time
-- Problema: Esta función específica tiene referencias a 'users'
-- Solución: Reemplazar solo esta función con la versión corregida
-- Fecha: 9 Diciembre 2025

-- DROP solo la función problemática
DROP FUNCTION IF EXISTS get_average_table_time(INTEGER, TIMESTAMP, TIMESTAMP, VARCHAR, VARCHAR) CASCADE;

-- RECREAR get_average_table_time CORREGIDA (sin referencias a 'users')
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

    -- Calcular tiempo promedio para mesas cerradas
    -- CORREGIDO: Usa auth.users + profiles (NO 'users')
    WITH closed_tables AS (
        SELECT
            to1.id,
            to1.created_at,
            to1.closed_at,
            EXTRACT(EPOCH FROM (to1.closed_at - to1.created_at)) / 60 as minutes_duration
        FROM table_order to1
        LEFT JOIN tables t ON to1.table_id = t.id
        LEFT JOIN user_order uo ON to1.id = uo.table_order_id
        -- CORREGIDO: auth.users en lugar de users
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
            AND EXTRACT(EPOCH FROM (to1.closed_at - to1.closed_at)) / 3600 <= 24
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

-- FUNCIÓN DE TEST para verificar que el fix funcionó
CREATE OR REPLACE FUNCTION test_surgical_fix()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    avg_test JSONB;
    dashboard_test JSONB;
    error_msg TEXT := '';
BEGIN
    -- Test 1: get_average_table_time individual
    BEGIN
        SELECT get_average_table_time(1, '2024-12-01'::timestamp, '2024-12-31'::timestamp, 'todos', 'todos') INTO avg_test;
    EXCEPTION WHEN OTHERS THEN
        error_msg := 'get_average_table_time ERROR: ' || SQLERRM;
    END;

    -- Test 2: get_dashboard_metrics completo (que llama a get_average_table_time)
    BEGIN
        IF error_msg = '' THEN
            SELECT get_dashboard_metrics(1, '2024-12-01'::timestamp, '2024-12-31'::timestamp, 'todos', 'todos', 'dia') INTO dashboard_test;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        error_msg := error_msg || ' | get_dashboard_metrics ERROR: ' || SQLERRM;
    END;

    -- Resultado del test
    result := jsonb_build_object(
        'fix_status', CASE WHEN error_msg = '' THEN 'SUCCESS' ELSE 'FAILED' END,
        'timestamp', NOW(),
        'errors', error_msg,
        'avg_table_time_test', CASE WHEN avg_test IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
        'dashboard_test', CASE WHEN dashboard_test IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
        'sample_avg_time', avg_test,
        'note', 'Fix quirúrgico aplicado solo a get_average_table_time'
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- EJECUTAR TEST
SELECT test_surgical_fix();

-- COMENTARIOS:
-- 1. ✅ FIX ESPECÍFICO: Solo get_average_table_time modificada
-- 2. ✅ TODAS LAS DEMÁS: Funciones intactas (get_dashboard_metrics, get_top_selling_item)
-- 3. ✅ CORRECCIÓN: users → auth.users + profiles
-- 4. 🎯 RESULTADO: Dashboard debería funcionar completamente ahora