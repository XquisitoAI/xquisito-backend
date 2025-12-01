-- ==========================================
-- CORRECCIÓN: user_payment_methods MIGRATION ERROR
-- ==========================================
-- Soluciona el error: column "user_id" of relation "user_payment_methods" contains null values

-- ==========================================
-- 1. VERIFICAR ESTADO ACTUAL
-- ==========================================

-- Ver estructura actual de la tabla
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_payment_methods'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar si hay registros con user_id NULL
SELECT
    COUNT(*) as total_records,
    COUNT(user_id) as records_with_user_id,
    COUNT(*) - COUNT(user_id) as null_user_id_records
FROM user_payment_methods;

-- Ver los registros con user_id NULL (si existen)
SELECT id, clerk_user_id, user_id, ecartpay_token, created_at
FROM user_payment_methods
WHERE user_id IS NULL
LIMIT 5;

-- ==========================================
-- 2. OPCIÓN A: ELIMINAR REGISTROS CON NULL (SI SON DE TESTING)
-- ==========================================

-- Si los registros existentes son solo de testing y no importa perderlos:
-- DELETE FROM user_payment_methods WHERE user_id IS NULL;

-- ==========================================
-- 3. OPCIÓN B: MIGRAR REGISTROS EXISTENTES (SI HAY DATOS IMPORTANTES)
-- ==========================================

-- Si hay registros importantes, necesitarás mapear clerk_user_id → user_id manualmente
-- Ejemplo de migración manual (AJUSTAR SEGÚN TUS DATOS REALES):

/*
-- Ejemplo: Si tienes un usuario Clerk que ahora está en Supabase Auth
UPDATE user_payment_methods
SET user_id = 'NUEVO-UUID-SUPABASE-AUTH'  -- UUID del usuario en auth.users
WHERE clerk_user_id = 'VIEJO-CLERK-USER-ID'  -- El clerk_user_id original
AND user_id IS NULL;
*/

-- ==========================================
-- 4. SOLUCIÓN RECOMENDADA: ELIMINAR Y RECREAR LIMPIA
-- ==========================================

-- Como estás en desarrollo y el usuario se acaba de registrar con SMS,
-- lo más simple es limpiar y recrear la tabla:

-- Eliminar todos los registros existentes (CUIDADO: Esto elimina TODOS los datos)
TRUNCATE TABLE user_payment_methods CASCADE;

-- Ahora podemos hacer user_id NOT NULL sin problemas
ALTER TABLE user_payment_methods
ALTER COLUMN user_id SET NOT NULL;

-- Eliminar la columna clerk_user_id si aún existe
ALTER TABLE user_payment_methods
DROP COLUMN IF EXISTS clerk_user_id CASCADE;

-- ==========================================
-- 5. COMPLETAR LA MIGRACIÓN RESTANTE
-- ==========================================

-- Crear nuevo foreign key constraint a auth.users
ALTER TABLE user_payment_methods
DROP CONSTRAINT IF EXISTS fk_user_payment_methods_user;

ALTER TABLE user_payment_methods
ADD CONSTRAINT fk_user_payment_methods_auth_user
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

-- Crear índices necesarios
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_user_id
ON user_payment_methods(user_id);

CREATE INDEX IF NOT EXISTS idx_user_payment_methods_active
ON user_payment_methods(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_payment_methods_default
ON user_payment_methods(user_id, is_default);

-- ==========================================
-- 6. CONFIGURAR ROW LEVEL SECURITY
-- ==========================================

-- Habilitar RLS
ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Allow backend payment method management" ON user_payment_methods;
DROP POLICY IF EXISTS "Users can manage own payment methods" ON user_payment_methods;

-- Crear nuevas políticas para Supabase Auth
CREATE POLICY "Users can manage own payment methods" ON user_payment_methods
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Política para backend (service role)
CREATE POLICY "Service role can manage all payment methods" ON user_payment_methods
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==========================================
-- 7. PERMISOS
-- ==========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO service_role;

-- ==========================================
-- 8. FUNCIONES Y TRIGGERS
-- ==========================================

-- Function para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function para single default
CREATE OR REPLACE FUNCTION ensure_single_default_user_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE user_payment_methods
        SET is_default = false
        WHERE user_id = NEW.user_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
DROP TRIGGER IF EXISTS update_user_payment_methods_updated_at ON user_payment_methods;
CREATE TRIGGER update_user_payment_methods_updated_at
    BEFORE UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS ensure_single_default_user_payment_method_trigger ON user_payment_methods;
CREATE TRIGGER ensure_single_default_user_payment_method_trigger
    BEFORE INSERT OR UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_user_payment_method();

-- ==========================================
-- 9. UNIQUE CONSTRAINT PARA DEFAULT
-- ==========================================

DROP INDEX IF EXISTS idx_unique_default_per_user_supabase;
CREATE UNIQUE INDEX idx_unique_default_per_user_supabase
    ON user_payment_methods(user_id)
    WHERE is_default = true;

-- ==========================================
-- 10. VERIFICACIÓN FINAL
-- ==========================================

-- Verificar nueva estructura
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_payment_methods'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar foreign key constraints
SELECT
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as referenced_table,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE contype = 'f'
AND conrelid::regclass = 'user_payment_methods'::regclass;

-- Verificar que no hay registros NULL
SELECT COUNT(*) as total_records, COUNT(user_id) as records_with_user_id
FROM user_payment_methods;

-- ==========================================
-- RESULTADO
-- ==========================================

COMMENT ON TABLE user_payment_methods IS 'Payment methods for authenticated users - MIGRATED to Supabase Auth (FIXED)';
COMMENT ON COLUMN user_payment_methods.user_id IS 'References auth.users.id (Supabase Auth) - MIGRATED from clerk_user_id';

SELECT
    'SUCCESS: user_payment_methods migration FIXED' as status,
    'NULL user_id values resolved' as fix,
    'Ready for Supabase Auth' as result;