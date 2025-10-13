-- ===============================================
-- AGREGAR CONFIGURACIONES DE NOTIFICACIONES
-- ===============================================

-- Agregar columnas de notificaciones a la tabla restaurants
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS order_notifications BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sms_notifications BOOLEAN DEFAULT false;

-- Crear índices para optimizar consultas de notificaciones
CREATE INDEX IF NOT EXISTS idx_restaurants_order_notifications ON restaurants(order_notifications);
CREATE INDEX IF NOT EXISTS idx_restaurants_email_notifications ON restaurants(email_notifications);
CREATE INDEX IF NOT EXISTS idx_restaurants_sms_notifications ON restaurants(sms_notifications);

-- Actualizar trigger para incluir las nuevas columnas en updated_at
-- (El trigger ya existe, solo asegurar que funcione con las nuevas columnas)

-- ===============================================
-- FUNCIÓN PARA VALIDAR DEPENDENCIAS DE NOTIFICACIONES
-- ===============================================

CREATE OR REPLACE FUNCTION validate_notification_settings()
RETURNS TRIGGER AS $$
BEGIN
    -- Si order_notifications está deshabilitado, deshabilitar email y sms
    IF NEW.order_notifications = false THEN
        NEW.email_notifications = false;
        NEW.sms_notifications = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para validar dependencias antes de actualizar
DROP TRIGGER IF EXISTS trigger_validate_notification_settings ON restaurants;
CREATE TRIGGER trigger_validate_notification_settings
    BEFORE UPDATE ON restaurants
    FOR EACH ROW
    WHEN (OLD.order_notifications IS DISTINCT FROM NEW.order_notifications
          OR OLD.email_notifications IS DISTINCT FROM NEW.email_notifications
          OR OLD.sms_notifications IS DISTINCT FROM NEW.sms_notifications)
    EXECUTE FUNCTION validate_notification_settings();

-- ===============================================
-- FUNCIÓN PARA ACTUALIZAR CONFIGURACIONES DE NOTIFICACIONES
-- ===============================================

CREATE OR REPLACE FUNCTION update_restaurant_notifications(
    p_restaurant_id INTEGER,
    p_order_notifications BOOLEAN,
    p_email_notifications BOOLEAN,
    p_sms_notifications BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
    updated_restaurant restaurants;
    result JSONB;
BEGIN
    -- Aplicar lógica de dependencias
    IF p_order_notifications = false THEN
        p_email_notifications = false;
        p_sms_notifications = false;
    END IF;

    -- Actualizar configuraciones
    UPDATE restaurants
    SET
        order_notifications = p_order_notifications,
        email_notifications = p_email_notifications,
        sms_notifications = p_sms_notifications,
        updated_at = NOW()
    WHERE id = p_restaurant_id
    RETURNING * INTO updated_restaurant;

    -- Verificar si se actualizó algún registro
    IF updated_restaurant.id IS NULL THEN
        RAISE EXCEPTION 'Restaurant with id % not found', p_restaurant_id;
    END IF;

    -- Construir resultado
    result := jsonb_build_object(
        'id', updated_restaurant.id,
        'order_notifications', updated_restaurant.order_notifications,
        'email_notifications', updated_restaurant.email_notifications,
        'sms_notifications', updated_restaurant.sms_notifications,
        'updated_at', updated_restaurant.updated_at
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- DATOS DE PRUEBA Y VERIFICACIÓN
-- ===============================================

-- Verificar que las columnas se agregaron correctamente
DO $$
BEGIN
    -- Verificar columnas
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'restaurants'
        AND column_name IN ('order_notifications', 'email_notifications', 'sms_notifications')
    ) THEN
        RAISE NOTICE '✅ Columnas de notificaciones agregadas correctamente';
    ELSE
        RAISE EXCEPTION '❌ Error: No se pudieron agregar las columnas de notificaciones';
    END IF;

    -- Verificar función
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'update_restaurant_notifications'
    ) THEN
        RAISE NOTICE '✅ Función update_restaurant_notifications creada correctamente';
    ELSE
        RAISE EXCEPTION '❌ Error: No se pudo crear la función update_restaurant_notifications';
    END IF;

    -- Verificar trigger
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_validate_notification_settings'
    ) THEN
        RAISE NOTICE '✅ Trigger de validación creado correctamente';
    ELSE
        RAISE EXCEPTION '❌ Error: No se pudo crear el trigger de validación';
    END IF;
END $$;

-- ===============================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ===============================================

COMMENT ON COLUMN restaurants.order_notifications IS 'Notificaciones de pedidos habilitadas (switch maestro)';
COMMENT ON COLUMN restaurants.email_notifications IS 'Notificaciones por email habilitadas (requiere order_notifications = true)';
COMMENT ON COLUMN restaurants.sms_notifications IS 'Notificaciones por SMS habilitadas (requiere order_notifications = true)';

COMMENT ON FUNCTION update_restaurant_notifications(INTEGER, BOOLEAN, BOOLEAN, BOOLEAN) IS 'Actualiza configuraciones de notificaciones validando dependencias';
COMMENT ON FUNCTION validate_notification_settings() IS 'Trigger function para validar dependencias entre configuraciones de notificaciones';