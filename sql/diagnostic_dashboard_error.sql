-- SCRIPT DE DIAGNÓSTICO: Encontrar exactamente dónde está la referencia a 'users'
-- Problema: Error "permission denied for table users" persiste
-- Objetivo: Identificar la función específica que causa el problema
-- Fecha: 9 Diciembre 2025

-- PASO 1: Buscar TODAS las funciones que contienen 'users'
SELECT
    routine_name,
    routine_type,
    specific_name,
    -- Mostrar fragmento de la definición que contiene 'users'
    CASE
        WHEN routine_definition ILIKE '%LEFT JOIN users%' THEN 'Contiene: LEFT JOIN users'
        WHEN routine_definition ILIKE '%FROM users%' THEN 'Contiene: FROM users'
        WHEN routine_definition ILIKE '%JOIN users%' THEN 'Contiene: JOIN users'
        WHEN routine_definition ILIKE '%table users%' THEN 'Contiene: table users'
        ELSE 'Otra referencia a users'
    END as problema_detectado,
    -- Mostrar si es función dashboard relevante
    CASE
        WHEN routine_name IN ('get_dashboard_metrics', 'get_average_table_time', 'get_top_selling_item') THEN 'CRÍTICA'
        ELSE 'OTRA'
    END as criticidad
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_type = 'FUNCTION'
    AND routine_definition ILIKE '%users%'
    AND routine_name NOT LIKE '%test%'  -- Excluir funciones de test
ORDER BY criticidad DESC, routine_name;

-- PASO 2: Verificar funciones específicas que llama get_dashboard_metrics
DO $$
DECLARE
    func_name TEXT;
    func_def TEXT;
BEGIN
    -- Lista de funciones que probablemente llama get_dashboard_metrics
    FOR func_name IN
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
        AND routine_name IN (
            'get_dashboard_metrics',
            'get_average_table_time',
            'get_top_selling_item',
            'get_active_orders',
            'get_orders_with_pagination'
        )
    LOOP
        -- Obtener definición de la función
        SELECT routine_definition INTO func_def
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_name = func_name;

        -- Reportar si contiene referencias problemáticas
        IF func_def ILIKE '%users%' THEN
            RAISE NOTICE 'PROBLEMA ENCONTRADO en función: %', func_name;
            RAISE NOTICE 'Contiene referencia a "users"';
        ELSE
            RAISE NOTICE 'Función % está LIMPIA', func_name;
        END IF;
    END LOOP;
END $$;

-- PASO 3: Test individual de cada función crítica
CREATE OR REPLACE FUNCTION test_individual_functions()
RETURNS TABLE(
    function_name TEXT,
    test_status TEXT,
    error_message TEXT
) AS $$
BEGIN
    -- Test get_dashboard_metrics
    BEGIN
        PERFORM get_dashboard_metrics(1, '2024-12-01'::timestamp, '2024-12-31'::timestamp);
        RETURN QUERY SELECT 'get_dashboard_metrics'::TEXT, 'SUCCESS'::TEXT, ''::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'get_dashboard_metrics'::TEXT, 'FAILED'::TEXT, SQLERRM::TEXT;
    END;

    -- Test get_average_table_time
    BEGIN
        PERFORM get_average_table_time(1, '2024-12-01'::timestamp, '2024-12-31'::timestamp);
        RETURN QUERY SELECT 'get_average_table_time'::TEXT, 'SUCCESS'::TEXT, ''::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'get_average_table_time'::TEXT, 'FAILED'::TEXT, SQLERRM::TEXT;
    END;

    -- Test get_top_selling_item
    BEGIN
        PERFORM get_top_selling_item(1, '2024-12-01'::timestamp, '2024-12-31'::timestamp);
        RETURN QUERY SELECT 'get_top_selling_item'::TEXT, 'SUCCESS'::TEXT, ''::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'get_top_selling_item'::TEXT, 'FAILED'::TEXT, SQLERRM::TEXT;
    END;

    -- Test get_orders_with_pagination
    BEGIN
        PERFORM get_orders_with_pagination(1, 5, 0, 'todos');
        RETURN QUERY SELECT 'get_orders_with_pagination'::TEXT, 'SUCCESS'::TEXT, ''::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'get_orders_with_pagination'::TEXT, 'FAILED'::TEXT, SQLERRM::TEXT;
    END;

END;
$$ LANGUAGE plpgsql;

-- PASO 4: Ejecutar test individual
SELECT * FROM test_individual_functions();

-- PASO 5: Verificar si hay versiones múltiples de la misma función
SELECT
    routine_name,
    specific_name,
    COUNT(*) as versiones
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_type = 'FUNCTION'
    AND routine_name IN ('get_dashboard_metrics', 'get_average_table_time', 'get_top_selling_item')
GROUP BY routine_name, specific_name
HAVING COUNT(*) > 1;

-- PASO 6: Mostrar la definición EXACTA de get_dashboard_metrics actual
SELECT
    'DEFINICIÓN ACTUAL DE get_dashboard_metrics:' as info,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'get_dashboard_metrics'
    AND routine_type = 'FUNCTION'
LIMIT 1;

-- INSTRUCCIONES:
-- 1. Ejecuta este script completo en Supabase
-- 2. Revisa los resultados para identificar:
--    - Qué función específica contiene 'users'
--    - Cuál función falla en el test individual
--    - Si hay múltiples versiones de funciones
-- 3. Una vez identificado el problema, crearemos un fix quirúrgico