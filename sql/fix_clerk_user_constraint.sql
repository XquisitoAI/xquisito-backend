-- ====================================================
-- Script para corregir constraint de clerk_user_id
-- Permitir NULL o corregir referencia
-- ====================================================

-- Opción 1: Eliminar constraint de foreign key temporalmente para testing
ALTER TABLE tap_orders_and_pay
DROP CONSTRAINT IF EXISTS tap_orders_and_pay_clerk_user_id_fkey;

-- Opción 2: Hacer que la columna no tenga constraint (solo para testing)
-- La columna sigue existiendo pero no valida foreign key

-- Comentario para documentación
COMMENT ON COLUMN tap_orders_and_pay.clerk_user_id IS 'ID de usuario de Clerk - sin constraint para permitir testing con invitados';