-- ==========================================
-- CORRECCIÓN INMEDIATA: RECREAR FUNCIÓN DE TRIGGER
-- ==========================================
-- El problema es que hay una función de trigger vieja que referencia clerk_user_id

-- ==========================================
-- 1. ELIMINAR TRIGGER Y FUNCIÓN VIEJOS
-- ==========================================

-- Eliminar el trigger
DROP TRIGGER IF EXISTS ensure_single_default_user_payment_method_trigger ON user_payment_methods;

-- Eliminar la función vieja
DROP FUNCTION IF EXISTS ensure_single_default_user_payment_method();

-- ==========================================
-- 2. RECREAR FUNCIÓN CORRECTA PARA ESTRUCTURA HÍBRIDA
-- ==========================================

CREATE OR REPLACE FUNCTION ensure_single_default_user_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        -- Para usuarios legacy (Clerk) - si existe legacy_clerk_id
        IF NEW.legacy_clerk_id IS NOT NULL THEN
            UPDATE user_payment_methods
            SET is_default = false
            WHERE legacy_clerk_id = NEW.legacy_clerk_id AND id != NEW.id;
        END IF;

        -- Para usuarios nuevos (Supabase Auth) - si existe user_id
        IF NEW.user_id IS NOT NULL THEN
            UPDATE user_payment_methods
            SET is_default = false
            WHERE user_id = NEW.user_id AND id != NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==========================================
-- 3. RECREAR TRIGGER
-- ==========================================

CREATE TRIGGER ensure_single_default_user_payment_method_trigger
    BEFORE INSERT OR UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_user_payment_method();

-- ==========================================
-- 4. VERIFICACIÓN
-- ==========================================

-- Ver la función actual
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'ensure_single_default_user_payment_method';

-- Ver el trigger actual
SELECT trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'user_payment_methods';

-- ==========================================
-- RESULTADO
-- ==========================================

SELECT 'SUCCESS: Trigger function recreated without clerk_user_id references' as status;