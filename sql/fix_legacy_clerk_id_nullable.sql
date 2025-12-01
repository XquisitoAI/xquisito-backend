-- ==========================================
-- CORRECCIÓN: HACER legacy_clerk_id NULLABLE
-- ==========================================
-- Los nuevos usuarios de Supabase Auth solo tendrán user_id, no legacy_clerk_id

-- ==========================================
-- 1. VERIFICAR ESTRUCTURA ACTUAL
-- ==========================================

-- Ver la estructura actual de user_payment_methods
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_payment_methods'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- ==========================================
-- 2. HACER legacy_clerk_id NULLABLE
-- ==========================================

-- Quitar constraint NOT NULL de legacy_clerk_id
ALTER TABLE user_payment_methods
ALTER COLUMN legacy_clerk_id DROP NOT NULL;

-- ==========================================
-- 3. VERIFICAR QUE user_id PUEDE SER NULL TAMBIÉN (PARA LEGACY DATA)
-- ==========================================

-- Verificar si user_id ya es nullable (debería serlo para estructura híbrida)
ALTER TABLE user_payment_methods
ALTER COLUMN user_id DROP NOT NULL;

-- ==========================================
-- 4. VERIFICAR QUE EL CONSTRAINT CHECK EXISTE
-- ==========================================

-- Ver constraints actuales
SELECT
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'user_payment_methods'::regclass
AND contype = 'c';  -- Check constraints

-- ==========================================
-- 5. AGREGAR CONSTRAINT CHECK SI NO EXISTE
-- ==========================================

-- Asegurar que existe el constraint que requiere EITHER legacy_clerk_id OR user_id
ALTER TABLE user_payment_methods
DROP CONSTRAINT IF EXISTS chk_user_reference;

ALTER TABLE user_payment_methods
ADD CONSTRAINT chk_user_reference
CHECK (
    (legacy_clerk_id IS NOT NULL AND user_id IS NULL) OR
    (legacy_clerk_id IS NULL AND user_id IS NOT NULL)
);

-- ==========================================
-- 6. VERIFICACIÓN FINAL
-- ==========================================

-- Ver estructura actualizada
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_payment_methods'
AND table_schema = 'public'
AND column_name IN ('legacy_clerk_id', 'user_id')
ORDER BY column_name;

-- Ver constraints check
SELECT
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'user_payment_methods'::regclass
AND contype = 'c';

-- ==========================================
-- 7. TEST DE INSERCIÓN (OPCIONAL - COMENTADO)
-- ==========================================

/*
-- Test: Insertar un registro con solo user_id (nuevo usuario Supabase)
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
    '1df090fd-fea5-4f8b-9322-ec4e74fae4df'::uuid,
    'test_token_12345',
    '4242',
    'visa',
    12,
    2025,
    'Test User',
    true,
    true
);

-- Si el test anterior funciona, eliminarlo:
DELETE FROM user_payment_methods WHERE ecartpay_token = 'test_token_12345';
*/

SELECT 'SUCCESS: legacy_clerk_id is now nullable, structure ready for hybrid use' as status;