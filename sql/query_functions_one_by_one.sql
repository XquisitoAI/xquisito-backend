-- ==========================================
-- CONSULTAS INDIVIDUALES PARA ENCONTRAR clerk_user_id
-- ==========================================

-- CONSULTA 1: Buscar funciones que contengan clerk_user_id
-- Ejecuta SOLO esta consulta primero
SELECT
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_definition ILIKE '%clerk_user_id%'
AND routine_schema = 'public'
ORDER BY routine_name;