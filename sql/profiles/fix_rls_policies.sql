-- ============================================
-- FIX: Arreglar políticas RLS que causan recursión infinita
-- ============================================

-- Eliminar todas las políticas existentes
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Main users can update all profiles" ON public.profiles;

-- ============================================
-- POLÍTICAS BÁSICAS (Sin recursión)
-- ============================================

-- Policy: Los usuarios pueden ver su propio perfil
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Los usuarios pueden actualizar su propio perfil
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- Policy: Los usuarios pueden insertar su propio perfil
CREATE POLICY "Users can insert own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================
-- CREAR FUNCIÓN HELPER PARA OBTENER ROL DEL USUARIO
-- (Evita recursión usando una función STABLE)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
    SELECT account_type::text
    FROM public.profiles
    WHERE id = user_id
    LIMIT 1;
$$;

-- ============================================
-- POLÍTICAS PARA ADMIN Y MAIN
-- (Usan la función helper para evitar recursión)
-- ============================================

-- Policy: Los admin y main pueden ver todos los perfiles
CREATE POLICY "Admins can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (
        public.get_user_role(auth.uid()) IN ('admin', 'main')
    );

-- Policy: Los main pueden actualizar cualquier perfil
CREATE POLICY "Main users can update all profiles"
    ON public.profiles
    FOR UPDATE
    USING (
        public.get_user_role(auth.uid()) = 'main'
    );

-- Policy: Los main pueden eliminar cualquier perfil
CREATE POLICY "Main users can delete all profiles"
    ON public.profiles
    FOR DELETE
    USING (
        public.get_user_role(auth.uid()) = 'main'
    );

-- Otorgar permisos a la función
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO anon;
