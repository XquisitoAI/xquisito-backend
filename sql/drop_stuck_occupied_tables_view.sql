-- ====================================================
-- Eliminar vista stuck_occupied_tables
-- ====================================================

-- Eliminar la vista si existe
DROP VIEW IF EXISTS stuck_occupied_tables CASCADE;

-- Eliminar la función de limpieza también
DROP FUNCTION IF EXISTS cleanup_stuck_occupied_tables() CASCADE;

-- Confirmación
DO $$
BEGIN
    RAISE NOTICE '✅ Vista stuck_occupied_tables eliminada';
    RAISE NOTICE '✅ Función cleanup_stuck_occupied_tables eliminada';
END $$;
