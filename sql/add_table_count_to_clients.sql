-- ===============================================
-- AGREGAR COLUMNA TABLE_COUNT A CLIENTS
-- ===============================================
-- Fecha: 4 de Diciembre 2025
-- Propósito: Agregar campo table_count a la tabla clients para almacenar
--            el número de mesas por cliente (será sincronizado con restaurants)

-- Estructura actual de clients:
-- - id (uuid, PK)
-- - name (varchar, NOT NULL, CHECK >= 2 chars)
-- - owner_name (varchar, NOT NULL, CHECK >= 2 chars)
-- - phone (varchar, NOT NULL)
-- - email (varchar, NOT NULL, UNIQUE, email format CHECK)
-- - services (jsonb, DEFAULT '[]')
-- - active (boolean, DEFAULT true)
-- - created_at, updated_at (timestamp with time zone)

-- 1. Agregar columna table_count a la tabla clients
DO $$
BEGIN
    -- Verificar si la columna ya existe antes de agregarla
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'clients'
        AND column_name = 'table_count'
    ) THEN
        ALTER TABLE public.clients
        ADD COLUMN table_count INTEGER DEFAULT 0
        CONSTRAINT chk_clients_table_count_range CHECK (table_count >= 0 AND table_count <= 100);

        RAISE NOTICE '✅ Columna table_count agregada exitosamente a la tabla clients';
    ELSE
        RAISE NOTICE 'ℹ️ La columna table_count ya existe en la tabla clients';
    END IF;
END $$;

-- 2. Crear índice para optimizar consultas por table_count
CREATE INDEX IF NOT EXISTS idx_clients_table_count ON public.clients(table_count);

-- 3. Comentario descriptivo para la nueva columna
COMMENT ON COLUMN public.clients.table_count IS 'Número total de mesas del cliente/restaurante. Se sincroniza automáticamente con la tabla restaurants cuando el cliente se registra. Requerido para servicios flex-bill y tap-order-pay.';

-- 4. Función para sincronizar table_count de clients hacia restaurants
-- (Cuando se actualiza un cliente, sincronizar con su restaurante asociado)
CREATE OR REPLACE FUNCTION sync_client_table_count_to_restaurant()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo sincronizar si table_count cambió
    IF OLD.table_count IS DISTINCT FROM NEW.table_count THEN
        -- Actualizar restaurants asociados a este client
        UPDATE public.restaurants
        SET table_count = NEW.table_count,
            updated_at = NOW()
        WHERE user_id IN (
            SELECT uap.id
            FROM public.user_admin_portal uap
            JOIN public.pending_invitations pi ON uap.email = pi.email
            WHERE pi.client_id = NEW.id
            AND pi.status = 'registered'
        );

        RAISE NOTICE '🔄 Table count sincronizado desde client % a restaurants: % mesas', NEW.id, NEW.table_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Crear trigger para sincronización de clients → restaurants
DROP TRIGGER IF EXISTS trigger_sync_client_to_restaurant ON public.clients;
CREATE TRIGGER trigger_sync_client_to_restaurant
    AFTER UPDATE OF table_count ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION sync_client_table_count_to_restaurant();

-- 6. Función para sincronizar table_count inicial al crear restaurante
-- (Cuando se registra un nuevo admin y se crea su restaurante)
CREATE OR REPLACE FUNCTION sync_initial_table_count_from_client()
RETURNS TRIGGER AS $$
DECLARE
    client_table_count INTEGER;
    client_id_found UUID;
BEGIN
    -- Buscar el cliente asociado y su table_count
    SELECT c.table_count, c.id INTO client_table_count, client_id_found
    FROM public.clients c
    JOIN public.pending_invitations pi ON c.id = pi.client_id
    JOIN public.user_admin_portal uap ON pi.email = uap.email
    WHERE uap.id = NEW.user_id
    AND pi.status = 'registered'
    LIMIT 1;

    -- Si se encuentra el cliente y tiene table_count > 0, aplicarlo al restaurant
    IF client_id_found IS NOT NULL AND client_table_count > 0 THEN
        UPDATE public.restaurants
        SET table_count = client_table_count
        WHERE id = NEW.id;

        RAISE NOTICE '🏢 Aplicando table_count inicial del client % al restaurant %: % mesas',
                     client_id_found, NEW.id, client_table_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Crear trigger para aplicar table_count inicial en restaurants nuevos
DROP TRIGGER IF EXISTS trigger_apply_initial_table_count ON public.restaurants;
CREATE TRIGGER trigger_apply_initial_table_count
    AFTER INSERT ON public.restaurants
    FOR EACH ROW
    EXECUTE FUNCTION sync_initial_table_count_from_client();

-- 8. Función para actualizar updated_at en clients
CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Crear trigger para actualizar updated_at en clients
DROP TRIGGER IF EXISTS trigger_update_clients_updated_at ON public.clients;
CREATE TRIGGER trigger_update_clients_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION update_clients_updated_at();

-- 10. Verificar la estructura después del cambio
DO $$
DECLARE
    column_exists BOOLEAN;
    index_exists BOOLEAN;
    constraint_exists BOOLEAN;
    trigger_client_exists BOOLEAN;
    trigger_restaurant_exists BOOLEAN;
BEGIN
    -- Verificar columna
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'clients'
        AND column_name = 'table_count'
    ) INTO column_exists;

    -- Verificar índice
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = 'clients'
        AND indexname = 'idx_clients_table_count'
    ) INTO index_exists;

    -- Verificar constraint
    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_clients_table_count_range'
        AND constraint_schema = 'public'
    ) INTO constraint_exists;

    -- Verificar triggers
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_sync_client_to_restaurant'
        AND event_object_table = 'clients'
    ) INTO trigger_client_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_apply_initial_table_count'
        AND event_object_table = 'restaurants'
    ) INTO trigger_restaurant_exists;

    RAISE NOTICE '📊 Estado de la migración table_count en clients:';
    RAISE NOTICE '  ✓ Columna table_count existe: %', CASE WHEN column_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '  ✓ Índice idx_clients_table_count existe: %', CASE WHEN index_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '  ✓ Constraint chk_clients_table_count_range existe: %', CASE WHEN constraint_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '  ✓ Trigger clients→restaurants existe: %', CASE WHEN trigger_client_exists THEN '✅ SÍ' ELSE '❌ NO' END;
    RAISE NOTICE '  ✓ Trigger initial sync existe: %', CASE WHEN trigger_restaurant_exists THEN '✅ SÍ' ELSE '❌ NO' END;

    IF column_exists AND index_exists AND trigger_client_exists THEN
        RAISE NOTICE '🎉 MIGRACIÓN DE CLIENTS COMPLETADA EXITOSAMENTE';
        RAISE NOTICE '📋 Próximos pasos:';
        RAISE NOTICE '   1. Actualizar main-portal backend para manejar table_count en clients';
        RAISE NOTICE '   2. Testing de sincronización clients ↔ restaurants';
        RAISE NOTICE '   3. Verificar que el frontend envía table_count correctamente';
    ELSE
        RAISE WARNING '⚠️ LA MIGRACIÓN NO SE COMPLETÓ CORRECTAMENTE';
    END IF;
END $$;

-- 11. Query para verificar datos después de la migración
-- SELECT id, name, owner_name, services, table_count, updated_at FROM public.clients ORDER BY updated_at DESC;

-- 12. Query para verificar sincronización clients ↔ restaurants
/*
SELECT
    c.id as client_id,
    c.name as client_name,
    c.table_count as client_table_count,
    r.id as restaurant_id,
    r.name as restaurant_name,
    r.table_count as restaurant_table_count,
    CASE
        WHEN c.table_count = r.table_count THEN '✅ Sincronizado'
        ELSE '❌ Desincronizado'
    END as sync_status
FROM public.clients c
LEFT JOIN public.pending_invitations pi ON c.id = pi.client_id
LEFT JOIN public.user_admin_portal uap ON pi.user_id = uap.clerk_user_id
LEFT JOIN public.restaurants r ON uap.id = r.user_id
WHERE pi.status = 'registered';
*/

-- 13. Nota importante:
-- Esta migración crea sincronización de clients → restaurants
-- Cuando se actualiza table_count en clients, se sincroniza automáticamente con restaurants
-- Cuando se crea un nuevo restaurant, se aplica el table_count del client automáticamente