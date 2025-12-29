-- ====================================================
-- Modificar tabla dish_order para soportar Room Orders
-- Agregar columna room_order_id
-- ====================================================

-- Agregar columna room_order_id
ALTER TABLE public.dish_order
ADD COLUMN IF NOT EXISTS room_order_id UUID;

-- Agregar FK a room_orders
ALTER TABLE public.dish_order
ADD CONSTRAINT fk_dish_order_room_order
  FOREIGN KEY (room_order_id)
  REFERENCES public.room_orders(id)
  ON DELETE CASCADE;

-- Índice para búsquedas por room_order_id
CREATE INDEX IF NOT EXISTS idx_dish_order_room_order_id
ON public.dish_order(room_order_id)
WHERE room_order_id IS NOT NULL;

-- Comentario para documentación
COMMENT ON COLUMN public.dish_order.room_order_id IS
'ID de room order (NULL si pertenece a table_order o tap_order)';

-- =============================================
-- NOTA IMPORTANTE
-- =============================================
-- Un dish_order puede pertenecer a:
-- - table_order_id (xquisito-fronted)
-- - tap_order_id (tap-order-and-pay)
-- - room_order_id (room-service)
--
-- Solo UNO de estos tres campos debe estar presente
-- =============================================
