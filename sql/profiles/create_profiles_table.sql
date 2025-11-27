-- ============================================
-- Tabla de perfiles de usuarios (public.profiles)
-- Relacionada con auth.users de Supabase
-- ============================================

-- Crear ENUM para tipos de cuenta
CREATE TYPE account_type AS ENUM ('customer', 'admin', 'main');

-- Crear ENUM para género
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');

-- Crear tabla de perfiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    phone TEXT,
    first_name TEXT,
    last_name TEXT,
    birth_date DATE,
    gender gender_type,
    photo_url TEXT,
    account_type account_type NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Políticas de seguridad (RLS Policies)
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

-- Policy: Los admin y main pueden ver todos los perfiles
CREATE POLICY "Admins can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND account_type IN ('admin', 'main')
        )
    );

-- Policy: Los main pueden actualizar cualquier perfil
CREATE POLICY "Main users can update all profiles"
    ON public.profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND account_type = 'main'
        )
    );

-- ============================================
-- Índices para mejorar rendimiento
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON public.profiles(account_type);

-- ============================================
-- Función para crear perfil automáticamente
-- ============================================

-- Trigger function: Crear perfil automáticamente cuando se registra un usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, phone, account_type)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.phone,
        CASE
            -- Si se registra con teléfono sin email, es customer
            WHEN NEW.phone IS NOT NULL AND NEW.email IS NULL THEN 'customer'::account_type
            -- Si se registra con email, por defecto es customer (se puede cambiar manualmente)
            ELSE 'customer'::account_type
        END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Ejecutar función al crear nuevo usuario en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Función para actualizar updated_at automáticamente
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Actualizar updated_at al modificar perfil
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- Datos de ejemplo (OPCIONAL - Comentar en producción)
-- ============================================

-- Estos son ejemplos, debes crear los usuarios primero en auth.users
-- desde el dashboard de Supabase o mediante la API de autenticación

-- NOTA: Solo ejecutar estos inserts si ya existen los usuarios en auth.users
-- con los UUIDs correspondientes

/*
-- Ejemplo de customer (autenticado con teléfono)
INSERT INTO public.profiles (id, phone, first_name, last_name, account_type)
VALUES (
    'uuid-del-usuario-customer',
    '+521234567890',
    'Juan',
    'Pérez',
    'customer'
);

-- Ejemplo de admin (autenticado con email)
INSERT INTO public.profiles (id, email, first_name, last_name, account_type)
VALUES (
    'uuid-del-usuario-admin',
    'admin@xquisito.com',
    'María',
    'García',
    'admin'
);

-- Ejemplo de main (autenticado con email)
INSERT INTO public.profiles (id, email, first_name, last_name, account_type)
VALUES (
    'uuid-del-usuario-main',
    'main@xquisito.com',
    'Carlos',
    'López',
    'main'
);
*/
