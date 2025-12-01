-- ==========================================
-- CORRECCIÓN: FUNCIÓN ensure_single_default_payment_method
-- ==========================================
-- Esta función específica aún referencia clerk_user_id

-- ==========================================
-- 1. ELIMINAR LA FUNCIÓN PROBLEMÁTICA
-- ==========================================

DROP FUNCTION IF EXISTS ensure_single_default_payment_method();

-- ==========================================
-- 2. RECREAR FUNCIÓN PARA ESTRUCTURA HÍBRIDA
-- ==========================================

-- NOTA: Esta función debe manejar tanto legacy_clerk_id como user_id
-- según nuestra estructura híbrida

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
-- 3. VERIFICAR QUE NO HAY TRIGGERS QUE USEN ESTA FUNCIÓN
-- ==========================================

-- Ver si hay triggers que usan esta función
SELECT
    trigger_name,
    event_object_table,
    pg_get_triggerdef(oid) as definition
FROM information_schema.triggers t
JOIN pg_trigger pt ON pt.tgname = t.trigger_name
WHERE action_statement LIKE '%ensure_single_default_payment_method%';

-- ==========================================
-- 4. VERIFICACIÓN FINAL
-- ==========================================

-- Ver la función recreada
SELECT routine_definition
FROM information_schema.routines
WHERE routine_name = 'ensure_single_default_payment_method';

SELECT 'SUCCESS: ensure_single_default_payment_method function corrected' as status;