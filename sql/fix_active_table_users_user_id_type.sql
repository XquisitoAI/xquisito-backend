-- Cambiar user_id de UUID a VARCHAR(255) en active_table_users
-- Esto permite que active_table_users maneje tanto UUIDs como otros tipos de identificadores

-- Primero, eliminar el constraint único que depende de user_id
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS unique_user_per_table;

-- Eliminar la columna user_id existente
ALTER TABLE active_table_users DROP COLUMN IF EXISTS user_id CASCADE;

-- Agregar la nueva columna user_id como VARCHAR(255)
ALTER TABLE active_table_users ADD COLUMN user_id VARCHAR(255) NULL;

-- Recrear el constraint único
ALTER TABLE active_table_users
ADD CONSTRAINT unique_user_per_table UNIQUE (table_number, user_id, guest_name);

-- Recrear el índice
DROP INDEX IF EXISTS idx_active_table_users_user;
CREATE INDEX idx_active_table_users_user
ON active_table_users (user_id) WHERE user_id IS NOT NULL;

-- Verificar el cambio
SELECT
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'active_table_users'
AND column_name = 'user_id';
