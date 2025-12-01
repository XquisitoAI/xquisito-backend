-- ==========================================
-- BÚSQUEDA EXHAUSTIVA: TODAS LAS REFERENCIAS A clerk_user_id EN LA BASE DE DATOS
-- ==========================================

-- ==========================================
-- 1. BUSCAR EN TODAS LAS FUNCIONES
-- ==========================================

-- Buscar funciones que contengan clerk_user_id en su definición
SELECT
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_definition ILIKE '%clerk_user_id%'
AND routine_schema = 'public'
ORDER BY routine_name;

-- ==========================================
-- 2. BUSCAR EN TRIGGERS
-- ==========================================

-- Ver todos los triggers en user_payment_methods
SELECT
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'user_payment_methods'
AND event_object_schema = 'public';

-- ==========================================
-- 3. BUSCAR EN CONSTRAINTS
-- ==========================================

-- Ver todos los constraints que puedan referenciar clerk_user_id
SELECT
    conname as constraint_name,
    conrelid::regclass as table_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE pg_get_constraintdef(oid) ILIKE '%clerk_user_id%';

-- ==========================================
-- 4. BUSCAR EN VIEWS
-- ==========================================

-- Ver todas las views que contengan clerk_user_id
SELECT
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE definition ILIKE '%clerk_user_id%';

-- ==========================================
-- 5. BUSCAR EN REGLAS (RULES)
-- ==========================================

-- Ver rules que puedan contener clerk_user_id
SELECT
    schemaname,
    tablename,
    rulename,
    definition
FROM pg_rules
WHERE definition ILIKE '%clerk_user_id%';

-- ==========================================
-- 6. BUSCAR EN POLÍTICAS RLS
-- ==========================================

-- Ver políticas RLS que contengan clerk_user_id
SELECT
    schemaname,
    tablename,
    policyname,
    qual,
    with_check
FROM pg_policies
WHERE qual ILIKE '%clerk_user_id%'
OR with_check ILIKE '%clerk_user_id%';

-- ==========================================
-- 7. BUSCAR EN TODAS LAS COLUMNAS DE TODAS LAS TABLAS
-- ==========================================

-- Ver si hay alguna tabla que aún tenga columna clerk_user_id
SELECT
    table_schema,
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE column_name = 'clerk_user_id'
AND table_schema = 'public';

-- ==========================================
-- 8. BUSCAR EN EL CÓDIGO FUENTE DE FUNCIONES ESPECÍFICAS
-- ==========================================

-- Ver específicamente las funciones relacionadas con payment_methods
SELECT
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE (routine_name ILIKE '%payment%' OR routine_name ILIKE '%default%')
AND routine_schema = 'public'
ORDER BY routine_name;

-- ==========================================
-- 9. BUSCAR EN COMENTARIOS Y METADATOS
-- ==========================================

-- Ver comentarios en tablas y columnas
SELECT
    'table' as object_type,
    schemaname,
    tablename as object_name,
    obj_description(oid) as comment
FROM pg_tables pt
JOIN pg_class pc ON pc.relname = pt.tablename
WHERE obj_description(oid) ILIKE '%clerk_user_id%'
AND schemaname = 'public'

UNION ALL

SELECT
    'column' as object_type,
    table_schema as schemaname,
    table_name || '.' || column_name as object_name,
    col_description(pgc.oid, pgattr.attnum) as comment
FROM information_schema.columns
JOIN pg_class pgc ON pgc.relname = table_name
JOIN pg_attribute pgattr ON pgattr.attrelid = pgc.oid AND pgattr.attname = column_name
WHERE col_description(pgc.oid, pgattr.attnum) ILIKE '%clerk_user_id%'
AND table_schema = 'public';

-- ==========================================
-- 10. VERIFICAR ESPECÍFICAMENTE LOS TRIGGERS ACTUALES
-- ==========================================

-- Ver el código exacto de los triggers en user_payment_methods
SELECT
    tgname as trigger_name,
    pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgrelid = 'user_payment_methods'::regclass;

-- ==========================================
-- RESULTADO
-- ==========================================

SELECT 'Búsqueda exhaustiva completada - revisa los resultados arriba' as status;

-- ==========================================
-- BONUS: SCRIPT DE LIMPIEZA TOTAL
-- ==========================================

-- Si necesitas eliminar TODAS las funciones relacionadas con payment methods y recrearlas:

/*
-- DESCOMENTAR SOLO SI ES NECESARIO HACER LIMPIEZA TOTAL

-- Eliminar todos los triggers relacionados
DROP TRIGGER IF EXISTS ensure_single_default_user_payment_method_trigger ON user_payment_methods;
DROP TRIGGER IF EXISTS update_user_payment_methods_updated_at ON user_payment_methods;

-- Eliminar todas las funciones relacionadas
DROP FUNCTION IF EXISTS ensure_single_default_user_payment_method();
DROP FUNCTION IF EXISTS ensure_single_default_payment_method();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Luego tendrías que recrear las funciones correctas...
*/