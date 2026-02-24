-- =====================================================
-- MIGRACION: Campos para Renovacion Automatica de Suscripciones
-- Fecha: 2026-02-05
-- Descripcion: Agrega campos necesarios para el sistema de renovacion
--              automatica de suscripciones con cobro recurrente
-- =====================================================

-- 1. Agregar campo para contar intentos de renovacion fallidos
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS renewal_attempts INTEGER DEFAULT 0;

COMMENT ON COLUMN subscriptions.renewal_attempts IS
'Contador de intentos fallidos de cobro automatico. Se resetea a 0 despues de un pago exitoso. Si el cobro falla, se degrada inmediatamente a plan basico.';

-- 2. Agregar campo para registrar ultimo intento de renovacion
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS last_renewal_attempt TIMESTAMPTZ;

COMMENT ON COLUMN subscriptions.last_renewal_attempt IS
'Fecha y hora del ultimo intento de cobro automatico.';

-- 3. Agregar campo para programar cambio de plan (downgrade)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS scheduled_plan_change VARCHAR(50);

COMMENT ON COLUMN subscriptions.scheduled_plan_change IS
'Plan al que se cambiara al finalizar el ciclo actual. NULL si no hay cambio programado. Valores: basico, premium, ultra';

-- 4. Agregar campo para tracking de recordatorios enviados
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS renewal_reminder_sent BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN subscriptions.renewal_reminder_sent IS
'Indica si ya se envio el recordatorio de renovacion (3 dias antes). Se resetea a FALSE despues de cada renovacion exitosa.';

-- 5. Agregar campo para fecha del proximo cobro (util para UI)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ;

COMMENT ON COLUMN subscriptions.next_billing_date IS
'Fecha del proximo cobro automatico. Igual a end_date si auto_renew=true. NULL si auto_renew=false.';

-- 6. Crear indice para busquedas eficientes de suscripciones por vencer
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal_due
ON subscriptions (end_date, auto_renew, status)
WHERE status = 'active' AND auto_renew = true;

COMMENT ON INDEX idx_subscriptions_renewal_due IS
'Indice para optimizar la busqueda de suscripciones que necesitan renovacion automatica.';

-- 7. Crear indice para suscripciones con downgrade programado
CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_change
ON subscriptions (end_date, scheduled_plan_change)
WHERE scheduled_plan_change IS NOT NULL;

COMMENT ON INDEX idx_subscriptions_scheduled_change IS
'Indice para optimizar la busqueda de suscripciones con cambio de plan programado.';

-- 8. Actualizar next_billing_date para suscripciones existentes
UPDATE subscriptions
SET next_billing_date = end_date
WHERE auto_renew = true
  AND status = 'active'
  AND next_billing_date IS NULL;

-- =====================================================
-- VERIFICACION
-- =====================================================

-- Mostrar estructura actualizada de la tabla
DO $$
BEGIN
    RAISE NOTICE '✅ Migracion completada exitosamente';
    RAISE NOTICE '📋 Campos agregados a subscriptions:';
    RAISE NOTICE '   - renewal_attempts (INTEGER)';
    RAISE NOTICE '   - last_renewal_attempt (TIMESTAMPTZ)';
    RAISE NOTICE '   - scheduled_plan_change (VARCHAR)';
    RAISE NOTICE '   - renewal_reminder_sent (BOOLEAN)';
    RAISE NOTICE '   - next_billing_date (TIMESTAMPTZ)';
    RAISE NOTICE '📊 Indices creados:';
    RAISE NOTICE '   - idx_subscriptions_renewal_due';
    RAISE NOTICE '   - idx_subscriptions_scheduled_change';
END $$;
