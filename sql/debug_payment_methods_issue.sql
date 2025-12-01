-- ==========================================
-- DEBUG: ENCONTRAR REFERENCIAS A clerk_user_id EN user_payment_methods
-- ==========================================

-- 1. Verificar la estructura actual de la tabla
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_payment_methods'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Verificar que la columna clerk_user_id NO existe
SELECT
    COUNT(*) as has_clerk_user_id_column
FROM information_schema.columns
WHERE table_name = 'user_payment_methods'
AND table_schema = 'public'
AND column_name = 'clerk_user_id';

-- 3. Verificar triggers que puedan estar causando el problema
SELECT
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'user_payment_methods';

-- 4. Ver código de las funciones de trigger
SELECT
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_name LIKE '%payment%'
OR routine_name LIKE '%user%'
ORDER BY routine_name;

-- 5. Verificar constraints que puedan tener referencias incorrectas
SELECT
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as referenced_table,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid::regclass = 'user_payment_methods'::regclass;

-- 6. Verificar políticas RLS
SELECT
    schemaname,
    tablename,
    policyname,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'user_payment_methods';

-- 7. Buscar en comentarios si hay referencias
SELECT
    obj_description(oid) as table_comment
FROM pg_class
WHERE relname = 'user_payment_methods';

-- 8. Verificar si hay views o funciones que referencien clerk_user_id
SELECT
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE definition ILIKE '%clerk_user_id%'
OR definition ILIKE '%user_payment_methods%';

-- ==========================================
-- TEST QUERY: SIMULAR INSERT PARA DETECTAR PROBLEMA
-- ==========================================

-- Intentar un insert simple para ver dónde falla exactamente
-- NOTA: Este insert fallará, pero nos dará información sobre el error

/*
INSERT INTO user_payment_methods (
    user_id,
    ecartpay_token,
    last_four_digits,
    card_type,
    expiry_month,
    expiry_year,
    cardholder_name,
    is_default,
    is_active
) VALUES (
    '1df090fd-fea5-4f8b-9322-ec4e74fae4df'::uuid,  -- Tu user_id de Supabase
    'test_token_12345',
    '4242',
    'visa',
    12,
    2025,
    'Test User',
    true,
    true
);
*/

SELECT 'Debug queries completed - check results above' as status;