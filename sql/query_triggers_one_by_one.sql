-- CONSULTA 2: Ver triggers en user_payment_methods
-- Ejecuta SOLO esta consulta
SELECT
    tgname as trigger_name,
    pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgrelid = 'user_payment_methods'::regclass;