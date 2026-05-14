-- ============================================================
-- RLS Policies — profiles
-- Última verificación: 2026-05-14
-- ============================================================

-- Service role: acceso total
CREATE POLICY "Service role full access on profiles"
  ON public.profiles FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Cualquier usuario autenticado puede ver todos los perfiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO public USING (auth.uid() IS NOT NULL);

-- Cada usuario puede insertar solo su propio perfil
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO public WITH CHECK (auth.uid() = id);

-- Cada usuario puede actualizar solo su propio perfil
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO public USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Solo usuarios con rol "main" pueden eliminar perfiles
CREATE POLICY "Main users can delete all profiles"
  ON public.profiles FOR DELETE
  TO public USING (public.get_user_role(auth.uid()) = 'main');
