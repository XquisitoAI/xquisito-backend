-- Script de diagnóstico: Verificar la función close_table_order_if_paid actual
-- Ejecuta esto en Supabase para ver si la función tiene la limpieza de active_table_users

SELECT
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_name = 'close_table_order_if_paid'
AND routine_schema = 'public';

-- Si el resultado contiene "DELETE FROM active_table_users", la función está actualizada correctamente.
-- Si NO contiene esa línea, necesitas ejecutar fix_close_table_cleanup.sql
