-- ====================================================
-- Modificar tabla payment_transactions para soportar Room Orders
-- Agregar columna id_room_order
-- ====================================================

-- 1. AGREGAR COLUMNA id_room_order
-- =============================================

ALTER TABLE public.payment_transactions
ADD COLUMN IF NOT EXISTS id_room_order UUID;

-- 2. AGREGAR FK A room_orders
-- =============================================

ALTER TABLE public.payment_transactions
ADD CONSTRAINT fk_payment_transactions_room_order
  FOREIGN KEY (id_room_order)
  REFERENCES public.room_orders(id)
  ON DELETE SET NULL;

-- 3. ÍNDICE PARA BÚSQUEDAS
-- =============================================

-- Índice para búsqueda por room order
CREATE INDEX IF NOT EXISTS idx_payment_transactions_room_order
ON public.payment_transactions(id_room_order)
WHERE id_room_order IS NOT NULL;

-- 4. MODIFICAR CONSTRAINT DE VALIDACIÓN
-- =============================================

-- Eliminar constraint anterior
ALTER TABLE public.payment_transactions
DROP CONSTRAINT IF EXISTS chk_one_order_type;

-- Crear nuevo constraint que valide UNA de las cuatro opciones
ALTER TABLE public.payment_transactions
ADD CONSTRAINT chk_one_order_type CHECK (
  -- Solo UNA de estas cuatro columnas debe tener valor
  (
    (id_table_order IS NOT NULL AND id_tap_orders_and_pay IS NULL AND id_room_order IS NULL AND id_pick_and_go_order IS NULL) OR
    (id_table_order IS NULL AND id_tap_orders_and_pay IS NOT NULL AND id_room_order IS NULL AND id_pick_and_go_order IS NULL) OR
    (id_table_order IS NULL AND id_tap_orders_and_pay IS NULL AND id_room_order IS NOT NULL AND id_pick_and_go_order IS NULL) OR
    (id_table_order IS NULL AND id_tap_orders_and_pay IS NULL AND id_room_order IS NULL AND id_pick_and_go_order IS NOT NULL)
  )
);

-- 5. COMENTARIOS PARA DOCUMENTACIÓN
-- =============================================

COMMENT ON COLUMN public.payment_transactions.id_room_order IS
'ID de orden de room-service (NULL si es otro tipo de orden)';

COMMENT ON CONSTRAINT chk_one_order_type ON public.payment_transactions IS
'Validar que exactamente UNA orden esté presente: table_order, tap_order, room_order o pick_and_go_order';

-- =============================================
-- NOTAS IMPORTANTES
-- =============================================
-- payment_transactions soporta cuatro tipos de órdenes:
-- 1. id_table_order → xquisito-fronted (flex-bill)
-- 2. id_tap_orders_and_pay → tap-order-and-pay
-- 3. id_pick_and_go_order → pick-and-go
-- 4. id_room_order → room-service (NUEVO)
--
-- Solo UNO de estos cuatro campos puede tener valor por transacción
-- =============================================
