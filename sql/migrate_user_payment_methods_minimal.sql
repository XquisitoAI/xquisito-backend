-- ==========================================
-- MIGRACIÓN MÍNIMA: user_payment_methods PARA SUPABASE AUTH
-- ==========================================
-- Solo cambia lo estrictamente necesario: clerk_user_id → user_id UUID
-- Mantiene EXACTAMENTE la misma estructura y constraints existentes

-- ==========================================
-- 1. BACKUP DE DATOS EXISTENTES (IMPORTANTE)
-- ==========================================

-- Crear backup completo de la tabla actual
CREATE TABLE user_payment_methods_clerk_backup AS
SELECT * FROM user_payment_methods;

-- Verificar backup
SELECT COUNT(*) as backup_count FROM user_payment_methods_clerk_backup;

-- ==========================================
-- 2. AGREGAR NUEVA COLUMNA user_id
-- ==========================================

-- Agregar nueva columna user_id (UUID) sin afectar datos existentes
ALTER TABLE user_payment_methods
ADD COLUMN IF NOT EXISTS user_id UUID;

-- ==========================================
-- 3. OPCIONAL: MIGRAR DATOS EXISTENTES (SI LOS HAY)
-- ==========================================

-- Si tienes datos existentes y quieres migrarlos, descomenta estas líneas:
-- UPDATE user_payment_methods
-- SET user_id = 'UUID-DEL-USUARIO-SUPABASE'
-- WHERE clerk_user_id = 'clerk_user_id_correspondiente';

-- NOTA: Como estás en testing y el usuario se acaba de crear con SMS,
-- probablemente no tengas datos que migrar, así que esto es opcional

-- ==========================================
-- 4. ELIMINAR CONSTRAINT Y COLUMNA ANTIGUA
-- ==========================================

-- Eliminar foreign key constraint de clerk_user_id
ALTER TABLE user_payment_methods
DROP CONSTRAINT IF EXISTS fk_user_payment_methods_user;

-- Eliminar columna clerk_user_id
ALTER TABLE user_payment_methods
DROP COLUMN IF EXISTS clerk_user_id;

-- ==========================================
-- 5. CONFIGURAR NUEVA COLUMNA user_id
-- ==========================================

-- Hacer user_id NOT NULL
ALTER TABLE user_payment_methods
ALTER COLUMN user_id SET NOT NULL;

-- Crear nuevo foreign key constraint a auth.users
ALTER TABLE user_payment_methods
ADD CONSTRAINT fk_user_payment_methods_auth_user
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

-- ==========================================
-- 6. MANTENER ÍNDICES EXISTENTES Y AGREGAR NUEVOS
-- ==========================================

-- Crear índice para user_id (reemplaza el de clerk_user_id)
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_user_id
ON user_payment_methods(user_id);

-- Mantener índice de performance para consultas activas
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_active
ON user_payment_methods(user_id, is_active);

-- Mantener índice para default payment methods
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_default
ON user_payment_methods(user_id, is_default);

-- ==========================================
-- 7. VERIFICAR ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Habilitar RLS si no está habilitado
ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas antiguas si existen
DROP POLICY IF EXISTS "Allow backend payment method management" ON user_payment_methods;
DROP POLICY IF EXISTS "Users can manage own payment methods" ON user_payment_methods;

-- Crear política para Supabase Auth
CREATE POLICY "Users can manage own payment methods" ON user_payment_methods
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Política para operaciones de backend (service role)
CREATE POLICY "Service role can manage all payment methods" ON user_payment_methods
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==========================================
-- 8. VERIFICAR PERMISOS
-- ==========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO service_role;

-- ==========================================
-- 9. ACTUALIZAR/CREAR FUNCIONES HELPER (SI NO EXISTEN)
-- ==========================================

-- Function para updated_at (mantener si ya existe)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function para single default (actualizada para user_id)
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

-- ==========================================
-- 10. RECREAR TRIGGERS SI ES NECESARIO
-- ==========================================

-- Trigger para updated_at (mantener si ya existe)
DROP TRIGGER IF EXISTS update_user_payment_methods_updated_at ON user_payment_methods;
CREATE TRIGGER update_user_payment_methods_updated_at
    BEFORE UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para single default (recrear con nueva función)
DROP TRIGGER IF EXISTS ensure_single_default_user_payment_method_trigger ON user_payment_methods;
CREATE TRIGGER ensure_single_default_user_payment_method_trigger
    BEFORE INSERT OR UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_user_payment_method();

-- ==========================================
-- 11. CONSTRAINT ÚNICO PARA DEFAULT (SI LO NECESITAS)
-- ==========================================

-- Crear unique constraint para solo un default por usuario
DROP INDEX IF EXISTS idx_unique_default_per_user_supabase;
CREATE UNIQUE INDEX idx_unique_default_per_user_supabase
    ON user_payment_methods(user_id)
    WHERE is_default = true;

-- ==========================================
-- 12. VERIFICACIÓN FINAL
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

-- ==========================================
-- RESULTADO ESPERADO
-- ==========================================

COMMENT ON TABLE user_payment_methods IS 'Payment methods for authenticated users - MIGRATED to Supabase Auth';
COMMENT ON COLUMN user_payment_methods.user_id IS 'References public.profiles.id (Supabase Auth profiles) - WAS clerk_user_id';

-- Confirmar migración exitosa
SELECT
    'SUCCESS: user_payment_methods migrated to Supabase Auth' as status,
    'clerk_user_id replaced with user_id UUID' as change,
    'All existing structure preserved' as note;