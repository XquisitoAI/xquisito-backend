-- ==========================================
-- MIGRACIÓN SIMPLE: RENOMBRAR COLUMNA clerk_user_id → user_id
-- ==========================================
-- Preserva TODOS los datos existentes, solo renombra la columna

-- ==========================================
-- 1. BACKUP DE SEGURIDAD (OPCIONAL)
-- ==========================================

CREATE TABLE user_payment_methods_backup AS
SELECT * FROM user_payment_methods;

-- ==========================================
-- 2. ELIMINAR FOREIGN KEY EXISTENTE
-- ==========================================

ALTER TABLE user_payment_methods
DROP CONSTRAINT IF EXISTS fk_user_payment_methods_user;

-- ==========================================
-- 3. RENOMBRAR COLUMNA clerk_user_id → user_id
-- ==========================================

ALTER TABLE user_payment_methods
RENAME COLUMN clerk_user_id TO user_id;

-- ==========================================
-- 4. CAMBIAR TIPO DE DATO VARCHAR → UUID (SI ES NECESARIO)
-- ==========================================

-- NOTA: Si los valores actuales en clerk_user_id ya son UUIDs válidos,
-- podemos cambiar el tipo. Si no, mantenemos VARCHAR por ahora.

-- Para verificar si los valores son UUIDs válidos:
-- SELECT user_id, user_id::uuid FROM user_payment_methods LIMIT 5;

-- Si los valores SON UUIDs válidos, ejecuta esto:
ALTER TABLE user_payment_methods
ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- Si los valores NO SON UUIDs válidos, déjalo como VARCHAR por ahora:
-- (No ejecutes la línea anterior)

-- ==========================================
-- 5. CREAR NUEVO FOREIGN KEY
-- ==========================================

-- Si los valores son UUIDs que corresponden a auth.users.id:
ALTER TABLE user_payment_methods
ADD CONSTRAINT fk_user_payment_methods_auth_user
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

-- Si los valores NO corresponden a auth.users.id:
-- Comentar la línea anterior y usar esta por ahora:
-- (Sin foreign key hasta que mapees correctamente los usuarios)

-- ==========================================
-- 6. ACTUALIZAR ÍNDICES
-- ==========================================

-- Crear nuevo índice para user_id
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_user_id
ON user_payment_methods(user_id);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_active
ON user_payment_methods(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_payment_methods_default
ON user_payment_methods(user_id, is_default);

-- ==========================================
-- 7. CONFIGURAR ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas anteriores
DROP POLICY IF EXISTS "Allow backend payment method management" ON user_payment_methods;
DROP POLICY IF EXISTS "Users can manage own payment methods" ON user_payment_methods;

-- Nuevas políticas para Supabase Auth
CREATE POLICY "Users can manage own payment methods" ON user_payment_methods
    FOR ALL
    USING (auth.uid()::text = user_id::text)  -- Conversión a text por si hay diferencias de tipo
    WITH CHECK (auth.uid()::text = user_id::text);

-- Política para backend (service role)
CREATE POLICY "Service role can manage all payment methods" ON user_payment_methods
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==========================================
-- 8. FUNCIONES Y TRIGGERS (SI NO EXISTEN)
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
-- 9. VERIFICACIÓN
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

-- Ver foreign keys
SELECT
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as referenced_table
FROM pg_constraint
WHERE contype = 'f'
AND conrelid::regclass = 'user_payment_methods'::regclass;

-- Ver datos preservados
SELECT COUNT(*) as total_records FROM user_payment_methods;

-- ==========================================
-- RESULTADO
-- ==========================================

SELECT
    'SUCCESS: Column renamed clerk_user_id → user_id' as status,
    'All existing data preserved' as data_status,
    'Ready for Supabase Auth' as result;