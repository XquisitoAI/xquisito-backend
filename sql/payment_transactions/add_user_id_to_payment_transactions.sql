-- ====================================================
-- Agregar user_id a payment_transactions
-- Para poder consultar transacciones por usuario directamente
-- ====================================================

-- Agregar columna user_id (VARCHAR para que coincida con clerk_user_id)
ALTER TABLE public.payment_transactions
ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);

-- Crear índice para mejorar las consultas por usuario
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id
ON public.payment_transactions(user_id);

-- Comentario para documentación
COMMENT ON COLUMN public.payment_transactions.user_id IS 'Clerk user ID del usuario que realizó la transacción (puede ser NULL para invitados)';

-- Nota: No agregamos FK porque puede ser NULL para invitados
-- y porque el user_id viene de Clerk, no de nuestra tabla users necesariamente
