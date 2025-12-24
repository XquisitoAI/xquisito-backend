-- Renombrar clerk_user_id a user_id en pick_and_go_orders
-- 22 de diciembre 2024
--
-- Esta migración cambia el nombre de la columna clerk_user_id a user_id
-- para reflejar el cambio de Clerk Auth a Supabase Auth en el frontend

-- Paso 1: Renombrar la columna
ALTER TABLE pick_and_go_orders
RENAME COLUMN clerk_user_id TO user_id;

-- Paso 2: Actualizar el comentario de la columna
COMMENT ON COLUMN pick_and_go_orders.user_id IS
'ID del usuario desde Supabase Auth. Puede ser null para órdenes de invitados.';

-- Paso 3: Verificación - Mostrar estructura actualizada
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'pick_and_go_orders'
-- AND column_name = 'user_id';

-- Nota: Esta migración es retrocompatible
-- El campo sigue siendo VARCHAR y nullable, solo cambia el nombre
-- Las aplicaciones deben actualizar sus queries para usar 'user_id' en lugar de 'clerk_user_id'
