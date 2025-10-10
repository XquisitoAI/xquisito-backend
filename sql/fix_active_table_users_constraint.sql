-- Arreglar constraint único de active_table_users
-- Problema: El constraint actual UNIQUE (table_number, user_id, guest_id, guest_name)
-- no funciona correctamente con NULLs y mezcla usuarios autenticados con invitados

-- Eliminar constraint viejo
ALTER TABLE active_table_users
DROP CONSTRAINT IF EXISTS unique_user_per_table;

-- Crear índices únicos parciales separados
-- 1. Para usuarios autenticados (con user_id): solo uno por mesa
DROP INDEX IF EXISTS idx_unique_authenticated_user_per_table;
CREATE UNIQUE INDEX idx_unique_authenticated_user_per_table
ON active_table_users (table_number, user_id)
WHERE user_id IS NOT NULL;

-- 2. Para invitados (con guest_id): solo uno por mesa
DROP INDEX IF EXISTS idx_unique_guest_per_table;
CREATE UNIQUE INDEX idx_unique_guest_per_table
ON active_table_users (table_number, guest_id)
WHERE guest_id IS NOT NULL;

-- 3. Para invitados sin guest_id (fallback por guest_name): solo uno por mesa
DROP INDEX IF EXISTS idx_unique_guest_name_per_table;
CREATE UNIQUE INDEX idx_unique_guest_name_per_table
ON active_table_users (table_number, guest_name)
WHERE guest_id IS NULL AND user_id IS NULL;

-- Verificar constraints creados
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'active_table_users'
AND (indexname LIKE 'idx_unique%' OR indexname LIKE '%user%' OR indexname LIKE '%guest%')
ORDER BY indexname;
