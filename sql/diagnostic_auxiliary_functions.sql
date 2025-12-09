-- DIAGNÓSTICO ESPECÍFICO: Encontrar cuál función auxiliar tiene la referencia problemática
-- get_dashboard_metrics llama a: get_average_table_time() y get_top_selling_item()
-- Una de estas debe tener aún referencias a 'users'

-- PASO 1: Verificar get_average_table_time
SELECT
    'get_average_table_time DEFINITION:' as info,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'get_average_table_time'
    AND routine_type = 'FUNCTION'
LIMIT 1;

-- PASO 2: Verificar get_top_selling_item
SELECT
    'get_top_selling_item DEFINITION:' as info,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'get_top_selling_item'
    AND routine_type = 'FUNCTION'
LIMIT 1;

-- PASO 3: Test individual de cada función auxiliar
CREATE OR REPLACE FUNCTION test_auxiliary_functions()
RETURNS TABLE(
    function_name TEXT,
    test_status TEXT,
    error_message TEXT
) AS $$
BEGIN
    -- Test get_average_table_time solo
    BEGIN
        PERFORM get_average_table_time(1, '2024-12-01'::timestamp, '2024-12-31'::timestamp, 'todos', 'todos');
        RETURN QUERY SELECT 'get_average_table_time'::TEXT, 'SUCCESS'::TEXT, ''::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'get_average_table_time'::TEXT, 'FAILED'::TEXT, SQLERRM::TEXT;
    END;

    -- Test get_top_selling_item solo
    BEGIN
        PERFORM get_top_selling_item(1, '2024-12-01'::timestamp, '2024-12-31'::timestamp);
        RETURN QUERY SELECT 'get_top_selling_item'::TEXT, 'SUCCESS'::TEXT, ''::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'get_top_selling_item'::TEXT, 'FAILED'::TEXT, SQLERRM::TEXT;
    END;

END;
$$ LANGUAGE plpgsql;

-- EJECUTAR TEST
SELECT * FROM test_auxiliary_functions();

-- PASO 4: Buscar específicamente referencias a 'users' en estas funciones
SELECT
    routine_name,
    CASE
        WHEN routine_definition ILIKE '%LEFT JOIN users%' THEN 'Tiene: LEFT JOIN users'
        WHEN routine_definition ILIKE '%FROM users%' THEN 'Tiene: FROM users'
        WHEN routine_definition ILIKE '%JOIN users%' THEN 'Tiene: JOIN users'
        WHEN routine_definition ILIKE '%users%' THEN 'Tiene: alguna referencia a users'
        ELSE 'LIMPIA - No tiene users'
    END as estado_users
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_type = 'FUNCTION'
    AND routine_name IN ('get_average_table_time', 'get_top_selling_item')
ORDER BY routine_name;