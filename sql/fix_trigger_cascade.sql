-- ==========================================
-- CORRECCIÓN CON CASCADE: ELIMINAR TRIGGER Y FUNCIÓN
-- ==========================================

-- ==========================================
-- 1. ELIMINAR TRIGGER ESPECÍFICO PRIMERO
-- ==========================================

DROP TRIGGER IF EXISTS ensure_single_default_payment_method_trigger ON user_payment_methods;

-- ==========================================
-- 2. AHORA ELIMINAR LA FUNCIÓN SIN PROBLEMAS
-- ==========================================

DROP FUNCTION IF EXISTS ensure_single_default_payment_method();

-- ==========================================
-- 3. RECREAR FUNCIÓN CORREGIDA PARA ESTRUCTURA HÍBRIDA
-- ==========================================

CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
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
-- 4. RECREAR TRIGGER
-- ==========================================

CREATE TRIGGER ensure_single_default_payment_method_trigger
    BEFORE INSERT OR UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_payment_method();

-- ==========================================
-- 5. VERIFICACIÓN FINAL
-- ==========================================

-- Ver todos los triggers en user_payment_methods
SELECT
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'user_payment_methods';

-- Ver la función corregida
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name LIKE '%ensure_single_default%';

SELECT 'SUCCESS: Trigger and function recreated without clerk_user_id references' as status;