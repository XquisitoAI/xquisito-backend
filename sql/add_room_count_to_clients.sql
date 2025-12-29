-- ===============================================
-- AGREGAR COLUMNA ROOM_COUNT A CLIENTS
-- ===============================================
-- Fecha: 26 de Diciembre 2025
-- Propósito: Agregar campo room_count a la tabla clients para almacenar
--            el número de habitaciones por cliente de tipo hotel (Room Service)

-- Estructura actual de clients:
-- - id (uuid, PK)
-- - name (varchar, NOT NULL, CHECK >= 2 chars)
-- - owner_name (varchar, NOT NULL, CHECK >= 2 chars)
-- - phone (varchar, NOT NULL)
-- - email (varchar, NOT NULL, UNIQUE, email format CHECK)
-- - services (jsonb, DEFAULT '[]')
-- - table_count (integer, DEFAULT 0, requerido para flex-bill y tap-order-pay)
-- - active (boolean, DEFAULT true)
-- - created_at, updated_at (timestamp with time zone)

-- 1. Agregar columna room_count a la tabla clients
DO $$
BEGIN
    -- Verificar si la columna ya existe antes de agregarla
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'clients'
        AND column_name = 'room_count'
    ) THEN
        ALTER TABLE public.clients
        ADD COLUMN room_count INTEGER DEFAULT 0
        CONSTRAINT chk_clients_room_count_range CHECK (room_count >= 0 AND room_count <= 500);

        RAISE NOTICE '✅ Columna room_count agregada exitosamente a la tabla clients';
    ELSE
        RAISE NOTICE 'ℹ️ La columna room_count ya existe en la tabla clients';
    END IF;
END $$;

-- 2. Crear índice para optimizar consultas por room_count
CREATE INDEX IF NOT EXISTS idx_clients_room_count ON public.clients(room_count);

-- 3. Comentario descriptivo para la nueva columna
COMMENT ON COLUMN public.clients.room_count IS 'Número total de habitaciones del cliente/hotel. Requerido para el servicio room-service. Permite valores de 0 a 500 habitaciones.';

-- 4. Función para sincronizar room_count de clients hacia restaurants
-- (Cuando se actualiza un cliente con room-service, sincronizar con su restaurante/hotel asociado)
CREATE OR REPLACE FUNCTION sync_client_room_count_to_restaurant()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo sincronizar si room_count cambió
    IF OLD.room_count IS DISTINCT FROM NEW.room_count THEN
        -- Actualizar restaurants asociados a este client (que ahora serán hoteles)
        UPDATE public.restaurants
        SET room_count = NEW.room_count,
            updated_at = NOW()
        WHERE user_id IN (
            SELECT uap.id
            FROM public.user_admin_portal uap
            JOIN public.pending_invitations pi ON uap.email = pi.email
            WHERE pi.client_id = NEW.id
            AND pi.status = 'registered'
        );

        RAISE NOTICE '🏨 Room count sincronizado desde client % a restaurants: % habitaciones', NEW.id, NEW.room_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Crear trigger para sincronización de clients → restaurants (room_count)
DROP TRIGGER IF EXISTS trigger_sync_client_room_to_restaurant ON public.clients;
CREATE TRIGGER trigger_sync_client_room_to_restaurant
    AFTER UPDATE OF room_count ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION sync_client_room_count_to_restaurant();

-- 6. Función para sincronizar room_count inicial al crear restaurante/hotel
-- (Cuando se registra un nuevo admin y se crea su restaurant/hotel)
CREATE OR REPLACE FUNCTION sync_initial_room_count_from_client()
RETURNS TRIGGER AS $$
DECLARE
    client_room_count INTEGER;
    client_id_found UUID;
BEGIN
    -- Buscar el cliente asociado y su room_count
    SELECT c.room_count, c.id INTO client_room_count, client_id_found
    FROM public.clients c
    JOIN public.pending_invitations pi ON c.id = pi.client_id
    JOIN public.user_admin_portal uap ON pi.email = uap.email
    WHERE uap.id = NEW.user_id
    AND pi.status = 'registered'
    LIMIT 1;

    -- Si se encuentra el cliente y tiene room_count > 0, aplicarlo al restaurant (hotel)
    IF client_id_found IS NOT NULL AND client_room_count > 0 THEN
        -- Verificar si el campo room_count existe en restaurants, si no, agregarlo
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'restaurants'
            AND column_name = 'room_count'
        ) THEN
            ALTER TABLE public.restaurants
            ADD COLUMN room_count INTEGER DEFAULT 0
            CONSTRAINT chk_restaurants_room_count_range CHECK (room_count >= 0 AND room_count <= 500);

            RAISE NOTICE '✅ Columna room_count agregada a tabla restaurants';
        END IF;

        UPDATE public.restaurants
        SET room_count = client_room_count
        WHERE id = NEW.id;

        RAISE NOTICE '🏨 Aplicando room_count inicial del client % al restaurant %: % habitaciones',
                     client_id_found, NEW.id, client_room_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Crear trigger para aplicar room_count inicial en restaurants nuevos
DROP TRIGGER IF EXISTS trigger_apply_initial_room_count ON public.restaurants;
CREATE TRIGGER trigger_apply_initial_room_count
    AFTER INSERT ON public.restaurants
    FOR EACH ROW
    EXECUTE FUNCTION sync_initial_room_count_from_client();

-- 8. Verificar si room_count existe en restaurants, si no, agregarlo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'restaurants'
        AND column_name = 'room_count'
    ) THEN
        ALTER TABLE public.restaurants
        ADD COLUMN room_count INTEGER DEFAULT 0
        CONSTRAINT chk_restaurants_room_count_range CHECK (room_count >= 0 AND room_count <= 500);

        CREATE INDEX IF NOT EXISTS idx_restaurants_room_count ON public.restaurants(room_count);

        COMMENT ON COLUMN public.restaurants.room_count IS 'Número de habitaciones del hotel/restaurant. Sincronizado desde clients para servicio room-service.';

        RAISE NOTICE '✅ Columna room_count agregada exitosamente a la tabla restaurants';
    ELSE
        RAISE NOTICE 'ℹ️ La columna room_count ya existe en la tabla restaurants';
    END IF;
END $$;

-- 9. Verificar la estructura después del cambio
DO $$
DECLARE
    column_clients_exists BOOLEAN;
    column_restaurants_exists BOOLEAN;
    index_clients_exists BOOLEAN;
    index_restaurants_exists BOOLEAN;
    constraint_clients_exists BOOLEAN;
    constraint_restaurants_exists BOOLEAN;
    trigger_client_exists BOOLEAN;
    trigger_restaurant_exists BOOLEAN;
BEGIN
    -- Verificar columna en clients
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'clients'
        AND column_name = 'room_count'
    ) INTO column_clients_exists;

    -- Verificar columna en restaurants
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'restaurants'
        AND column_name = 'room_count'
    ) INTO column_restaurants_exists;

    -- Verificar índices
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = 'clients'
        AND indexname = 'idx_clients_room_count'
    ) INTO index_clients_exists;

    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = 'restaurants'
        AND indexname = 'idx_restaurants_room_count'
    ) INTO index_restaurants_exists;

    -- Verificar constraints
    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_clients_room_count_range'
        AND constraint_schema = 'public'
    ) INTO constraint_clients_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_restaurants_room_count_range'
        AND constraint_schema = 'public'
    ) INTO constraint_restaurants_exists;

    -- Verificar triggers
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_sync_client_room_to_restaurant'
        AND event_object_table = 'clients'
    ) INTO trigger_client_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_apply_initial_room_count'
        AND event_object_table = 'restaurants'
    ) INTO trigger_restaurant_exists;

    RAISE NOTICE '🏨 Estado de la migración room_count:';
    RAISE NOTICE '  📊 CLIENTS:';
    RAISE NOTICE '    ✓ Columna room_count: %', CASE WHEN column_clients_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '    ✓ Índice idx_clients_room_count: %', CASE WHEN index_clients_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '    ✓ Constraint chk_clients_room_count_range: %', CASE WHEN constraint_clients_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '  🏪 RESTAURANTS:';
    RAISE NOTICE '    ✓ Columna room_count: %', CASE WHEN column_restaurants_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '    ✓ Índice idx_restaurants_room_count: %', CASE WHEN index_restaurants_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '    ✓ Constraint chk_restaurants_room_count_range: %', CASE WHEN constraint_restaurants_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '  🔄 TRIGGERS:';
    RAISE NOTICE '    ✓ Trigger clients→restaurants: %', CASE WHEN trigger_client_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '    ✓ Trigger initial sync: %', CASE WHEN trigger_restaurant_exists THEN '✅ SÍ' ELSE '❌ NO' END;

    IF column_clients_exists AND column_restaurants_exists AND index_clients_exists AND trigger_client_exists THEN
        RAISE NOTICE '🎉 MIGRACIÓN DE ROOM SERVICE COMPLETADA EXITOSAMENTE';
        RAISE NOTICE '📋 Próximos pasos:';
        RAISE NOTICE '   1. ✅ Actualizar main-portal backend para manejar room_count en clients';
        RAISE NOTICE '   2. ✅ Testing de sincronización clients ↔ restaurants (room_count)';
        RAISE NOTICE '   3. ✅ Verificar que el frontend envía room_count correctamente';
        RAISE NOTICE '   4. ✅ Probar flujo completo: Cliente Hotel → Selección Room Service → Input habitaciones';
    ELSE
        RAISE WARNING '⚠️ LA MIGRACIÓN NO SE COMPLETÓ CORRECTAMENTE';
    END IF;
END $$;

-- 10. Query para verificar datos después de la migración
-- SELECT id, name, owner_name, services, table_count, room_count, updated_at FROM public.clients ORDER BY updated_at DESC;

-- 11. Query para verificar sincronización clients ↔ restaurants (room_count)
/*
SELECT
    c.id as client_id,
    c.name as client_name,
    c.table_count as client_table_count,
    c.room_count as client_room_count,
    c.services as client_services,
    r.id as restaurant_id,
    r.name as restaurant_name,
    r.table_count as restaurant_table_count,
    r.room_count as restaurant_room_count,
    CASE
        WHEN 'room-service' = ANY(SELECT jsonb_array_elements_text(c.services))
        AND c.room_count = r.room_count THEN '🏨 Room Service Sincronizado'
        WHEN 'room-service' = ANY(SELECT jsonb_array_elements_text(c.services))
        AND c.room_count != r.room_count THEN '❌ Room Service Desincronizado'
        ELSE '🍽️ Restaurant Normal'
    END as sync_status
FROM public.clients c
LEFT JOIN public.pending_invitations pi ON c.id = pi.client_id
LEFT JOIN public.user_admin_portal uap ON pi.email = uap.email
LEFT JOIN public.restaurants r ON uap.id = r.user_id
WHERE pi.status = 'registered';
*/

-- 12. Nota importante:
-- Esta migración agrega soporte para Room Service (hoteles):
-- - room_count en clients almacena el número de habitaciones
-- - Se sincroniza automáticamente con restaurants
-- - Rango permitido: 0 a 500 habitaciones
-- - Servicio identificado como 'room-service' en el array services