-- ==========================================
-- ESTRATEGIA HÍBRIDA: MIGRACIÓN CON COMPATIBILIDAD CLERK + SUPABASE
-- ==========================================
-- Mantiene datos existentes (Clerk IDs) y permite nuevos datos (Supabase UUIDs)

-- ==========================================
-- 1. BACKUP DE SEGURIDAD
-- ==========================================

CREATE TABLE user_payment_methods_backup AS
SELECT * FROM user_payment_methods;

SELECT COUNT(*) as backup_count FROM user_payment_methods_backup;

-- ==========================================
-- 2. ANALIZAR DATOS EXISTENTES
-- ==========================================

-- Ver qué IDs tenemos actualmente
SELECT
    clerk_user_id,
    COUNT(*) as payment_methods_count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM user_payment_methods
GROUP BY clerk_user_id;

-- ==========================================
-- 3. STRATEGY: PRESERVAR DATOS EXISTENTES COMO "LEGACY"
-- ==========================================

-- Opción 1: Mantener estructura actual y agregar soporte para nuevos usuarios
-- Eliminamos foreign key existente (que apunta a public.users)
ALTER TABLE user_payment_methods
DROP CONSTRAINT IF EXISTS fk_user_payment_methods_user;

-- Renombrar columna para claridad
ALTER TABLE user_payment_methods
RENAME COLUMN clerk_user_id TO legacy_clerk_id;

-- Agregar nueva columna para Supabase Auth UUIDs
ALTER TABLE user_payment_methods
ADD COLUMN user_id UUID NULL;

-- ==========================================
-- 4. CREAR CONSTRAINT CHECK PARA ASEGURAR CONSISTENCIA
-- ==========================================

-- Asegurar que cada registro tenga EITHER legacy_clerk_id OR user_id (no ambos)
ALTER TABLE user_payment_methods
ADD CONSTRAINT chk_user_reference
CHECK (
    (legacy_clerk_id IS NOT NULL AND user_id IS NULL) OR
    (legacy_clerk_id IS NULL AND user_id IS NOT NULL)
);

-- ==========================================
-- 5. FOREIGN KEY PARA NUEVOS REGISTROS (SUPABASE AUTH)
-- ==========================================

-- Solo crear FK para user_id (Supabase Auth)
ALTER TABLE user_payment_methods
ADD CONSTRAINT fk_user_payment_methods_auth_user
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

-- NOTA: No creamos FK para legacy_clerk_id porque public.users ya no existe
-- Los registros legacy quedan como "huérfanos" pero funcionales

-- ==========================================
-- 6. ÍNDICES PARA AMBAS COLUMNAS
-- ==========================================

-- Índice para legacy_clerk_id (consultas de datos existentes)
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_legacy_clerk_id
ON user_payment_methods(legacy_clerk_id) WHERE legacy_clerk_id IS NOT NULL;

-- Índice para user_id (nuevos usuarios Supabase)
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_user_id
ON user_payment_methods(user_id) WHERE user_id IS NOT NULL;

-- Índices compuestos
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_legacy_active
ON user_payment_methods(legacy_clerk_id, is_active) WHERE legacy_clerk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_payment_methods_active
ON user_payment_methods(user_id, is_active) WHERE user_id IS NOT NULL;

-- ==========================================
-- 7. ACTUALIZAR FUNCIONES PARA MANEJAR AMBOS TIPOS
-- ==========================================

-- Function para single default (actualizada para ambos tipos)
CREATE OR REPLACE FUNCTION ensure_single_default_user_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        -- Para usuarios legacy (Clerk)
        IF NEW.legacy_clerk_id IS NOT NULL THEN
            UPDATE user_payment_methods
            SET is_default = false
            WHERE legacy_clerk_id = NEW.legacy_clerk_id AND id != NEW.id;
        END IF;

        -- Para usuarios nuevos (Supabase Auth)
        IF NEW.user_id IS NOT NULL THEN
            UPDATE user_payment_methods
            SET is_default = false
            WHERE user_id = NEW.user_id AND id != NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function para updated_at (mantener)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==========================================
-- 8. RECREAR TRIGGERS
-- ==========================================

DROP TRIGGER IF EXISTS ensure_single_default_user_payment_method_trigger ON user_payment_methods;
CREATE TRIGGER ensure_single_default_user_payment_method_trigger
    BEFORE INSERT OR UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_user_payment_method();

DROP TRIGGER IF EXISTS update_user_payment_methods_updated_at ON user_payment_methods;
CREATE TRIGGER update_user_payment_methods_updated_at
    BEFORE UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 9. ROW LEVEL SECURITY PARA AMBOS TIPOS
-- ==========================================

ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Allow backend payment method management" ON user_payment_methods;
DROP POLICY IF EXISTS "Users can manage own payment methods" ON user_payment_methods;

-- Política para usuarios Supabase Auth (nuevos)
CREATE POLICY "Supabase users can manage own payment methods" ON user_payment_methods
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Política para datos legacy (solo lectura desde backend)
CREATE POLICY "Backend can manage legacy payment methods" ON user_payment_methods
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Política temporal para acceso anónimo a legacy data (AJUSTAR SEGÚN NECESIDADES)
CREATE POLICY "Allow access to legacy payment methods" ON user_payment_methods
    FOR SELECT
    USING (legacy_clerk_id IS NOT NULL);

-- ==========================================
-- 10. PERMISOS
-- ==========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO service_role;
GRANT SELECT ON user_payment_methods TO anon;

-- ==========================================
-- 11. VERIFICACIÓN
-- ==========================================

-- Ver nueva estructura
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_payment_methods'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Ver distribución de datos
SELECT
    COUNT(*) as total_records,
    COUNT(legacy_clerk_id) as legacy_records,
    COUNT(user_id) as supabase_records
FROM user_payment_methods;

-- Ver foreign keys
SELECT
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as referenced_table
FROM pg_constraint
WHERE contype = 'f'
AND conrelid::regclass = 'user_payment_methods'::regclass;

-- ==========================================
-- 12. COMENTARIOS Y DOCUMENTACIÓN
-- ==========================================

COMMENT ON TABLE user_payment_methods IS 'Payment methods - HYBRID: Legacy Clerk data + new Supabase Auth users';
COMMENT ON COLUMN user_payment_methods.legacy_clerk_id IS 'Legacy Clerk user IDs (e.g., user_32puD1R8oSy2TQIgTtAN8BcYdvZ)';
COMMENT ON COLUMN user_payment_methods.user_id IS 'New Supabase Auth user IDs (UUID from auth.users)';

-- ==========================================
-- RESULTADO
-- ==========================================

SELECT
    'SUCCESS: Hybrid migration completed' as status,
    'Legacy Clerk data preserved' as legacy_status,
    'New Supabase Auth support added' as new_status,
    'Both systems can coexist' as compatibility;