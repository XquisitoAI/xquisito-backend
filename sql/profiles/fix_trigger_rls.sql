-- ============================================
-- FIX: Trigger con permisos correctos para bypassear RLS
-- ============================================

-- Eliminar el trigger y la función existentes
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recrear la función con SECURITY DEFINER y SET search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- Insertar perfil con RLS bypasseado gracias a SECURITY DEFINER
    INSERT INTO public.profiles (id, email, phone, account_type)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.phone,
        CASE
            WHEN NEW.phone IS NOT NULL AND NEW.email IS NULL THEN 'customer'::account_type
            ELSE 'customer'::account_type
        END
    );
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Si el perfil ya existe, no hacer nada
        RETURN NEW;
    WHEN OTHERS THEN
        -- Log del error pero no fallar la creación del usuario
        RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- Recrear el trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Verificar que la función tiene los permisos correctos
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
