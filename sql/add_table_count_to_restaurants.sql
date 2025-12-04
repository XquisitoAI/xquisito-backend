-- ===============================================
-- AGREGAR COLUMNA TABLE_COUNT A RESTAURANTS
-- ===============================================
-- Fecha: 4 de Diciembre 2025
-- Propósito: Agregar campo table_count para almacenar número de mesas por restaurante
--            Este campo es requerido para FlexBill y TapOrderPay services

-- Estructura actual de restaurants:
-- - id (integer, PK)
-- - user_id (integer, FK a user_admin_portal)
-- - name, description, logo_url, banner_url, address, phone, email
-- - is_active (boolean)
-- - created_at, updated_at (timestamps)
-- - opening_hours (jsonb)
-- - order_notifications, email_notifications, sms_notifications (boolean)

-- 1. Agregar columna table_count con constraint y valor por defecto
DO $$
BEGIN
    -- Verificar si la columna ya existe antes de agregarla
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'restaurants'
        AND column_name = 'table_count'
    ) THEN
        ALTER TABLE public.restaurants
        ADD COLUMN table_count INTEGER DEFAULT 0
        CONSTRAINT chk_table_count_range CHECK (table_count >= 0 AND table_count <= 100);

        RAISE NOTICE '✅ Columna table_count agregada exitosamente a la tabla restaurants';
    ELSE
        RAISE NOTICE 'ℹ️ La columna table_count ya existe en la tabla restaurants';
    END IF;
END $$;

-- 2. Crear índice para optimizar consultas por table_count
CREATE INDEX IF NOT EXISTS idx_restaurants_table_count ON public.restaurants(table_count);

-- 3. Comentario descriptivo para la nueva columna
COMMENT ON COLUMN public.restaurants.table_count IS 'Número total de mesas del restaurante (1-100). Requerido para servicios FlexBill y TapOrderPay que manejan gestión de mesas por mesa específica.';

-- 4. Trigger para actualizar updated_at cuando se modifica table_count
-- (El trigger ya existe para la tabla restaurants, pero verificamos que funcione)
CREATE OR REPLACE FUNCTION update_restaurants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_update_restaurants_updated_at'
        AND event_object_table = 'restaurants'
    ) THEN
        CREATE TRIGGER trigger_update_restaurants_updated_at
            BEFORE UPDATE ON public.restaurants
            FOR EACH ROW EXECUTE FUNCTION update_restaurants_updated_at();

        RAISE NOTICE '✅ Trigger para updated_at creado en restaurants';
    ELSE
        RAISE NOTICE 'ℹ️ Trigger para updated_at ya existe en restaurants';
    END IF;
END $$;

-- 5. Verificar la estructura de la tabla después del cambio
DO $$
DECLARE
    column_exists BOOLEAN;
    index_exists BOOLEAN;
    constraint_exists BOOLEAN;
BEGIN
    -- Verificar columna
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'restaurants'
        AND column_name = 'table_count'
    ) INTO column_exists;

    -- Verificar índice
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = 'restaurants'
        AND indexname = 'idx_restaurants_table_count'
    ) INTO index_exists;

    -- Verificar constraint
    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_table_count_range'
        AND constraint_schema = 'public'
    ) INTO constraint_exists;

    RAISE NOTICE '📊 Estado de la migración table_count:';
    RAISE NOTICE '  ✓ Columna table_count existe: %', CASE WHEN column_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '  ✓ Índice idx_restaurants_table_count existe: %', CASE WHEN index_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '  ✓ Constraint chk_table_count_range existe: %', CASE WHEN constraint_exists THEN '✅ SÍ' ELSE '❌ NO' END;

    IF column_exists AND index_exists THEN
        RAISE NOTICE '🎉 MIGRACIÓN COMPLETADA EXITOSAMENTE';
        RAISE NOTICE '📋 Próximos pasos:';
        RAISE NOTICE '   1. Actualizar RestaurantController.updateRestaurant()';
        RAISE NOTICE '   2. Actualizar RestaurantService en backend';
        RAISE NOTICE '   3. Verificar Admin Portal Settings.tsx (ya implementado)';
    ELSE
        RAISE WARNING '⚠️ LA MIGRACIÓN NO SE COMPLETÓ CORRECTAMENTE';
    END IF;
END $$;

-- 6. Query de ejemplo para verificar la nueva columna
-- SELECT id, name, table_count, is_active, created_at FROM public.restaurants ORDER BY id;

-- 7. Query para actualizar restaurantes existentes (ejemplo)
-- UPDATE public.restaurants SET table_count = 10 WHERE table_count = 0 AND id = 1;

-- 8. Nota importante para desarrollo:
-- Este campo se usa en Admin Portal Settings.tsx y debe ser manejado en:
-- - Backend: RestaurantController.updateRestaurant()
-- - Backend: RestaurantService
-- - Frontend: Admin Portal Settings (✅ ya implementado con validaciones)
-- - Validación: Solo visible si FlexBill o TapOrderPay están habilitados