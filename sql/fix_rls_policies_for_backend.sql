-- ==========================================
-- CORRECCIÓN: POLÍTICAS RLS PARA OPERACIONES BACKEND
-- ==========================================
-- Permitir que el backend inserte payment methods en nombre del usuario

-- ==========================================
-- 1. VER POLÍTICAS ACTUALES
-- ==========================================

-- Ver todas las políticas en user_payment_methods
SELECT
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_payment_methods';

-- ==========================================
-- 2. ELIMINAR POLÍTICAS EXISTENTES
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own payment methods" ON user_payment_methods;
DROP POLICY IF EXISTS "Supabase users can manage own payment methods" ON user_payment_methods;
DROP POLICY IF EXISTS "Service role can manage all payment methods" ON user_payment_methods;
DROP POLICY IF EXISTS "Backend can manage legacy payment methods" ON user_payment_methods;
DROP POLICY IF EXISTS "Allow access to legacy payment methods" ON user_payment_methods;
DROP POLICY IF EXISTS "Allow backend payment method management" ON user_payment_methods;

-- ==========================================
-- 3. CREAR POLÍTICAS FLEXIBLES PARA BACKEND + FRONTEND
-- ==========================================

-- Política 1: Service role puede hacer TODO (backend operations)
CREATE POLICY "service_role_full_access" ON user_payment_methods
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Política 2: Usuarios autenticados pueden ver y gestionar sus propios payment methods
CREATE POLICY "authenticated_users_own_records" ON user_payment_methods
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Política 3: Permitir acceso anónimo para operaciones específicas (si es necesario)
CREATE POLICY "anon_backend_operations" ON user_payment_methods
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- ==========================================
-- 4. VERIFICAR PERMISOS DE ROLES
-- ==========================================

-- Asegurar que todos los roles tengan los permisos correctos
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO anon;

-- ==========================================
-- 5. VERIFICACIÓN FINAL
-- ==========================================

-- Ver las nuevas políticas
SELECT
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_payment_methods'
ORDER BY policyname;

-- Ver permisos de tabla
SELECT
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges
WHERE table_name = 'user_payment_methods'
ORDER BY grantee, privilege_type;

SELECT 'SUCCESS: RLS policies updated for backend operations' as status;