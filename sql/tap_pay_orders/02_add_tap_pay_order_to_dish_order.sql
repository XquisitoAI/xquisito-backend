-- =====================================================
-- MIGRACIÓN: Agregar relación tap_pay_order_id a dish_order
-- Descripción: Conecta los platillos con órdenes de Tap & Pay
-- Fecha: 2026-01-09
-- =====================================================

-- Agregar columna tap_pay_order_id a dish_order
ALTER TABLE dish_order
ADD COLUMN IF NOT EXISTS tap_pay_order_id UUID NULL
  REFERENCES tap_pay_orders(id) ON DELETE CASCADE;

-- Crear índice para mejorar rendimiento de consultas
CREATE INDEX IF NOT EXISTS idx_dish_order_tap_pay_order_id
  ON dish_order(tap_pay_order_id)
  WHERE tap_pay_order_id IS NOT NULL;

-- Comentario descriptivo
COMMENT ON COLUMN dish_order.tap_pay_order_id IS 'Referencia a orden de Tap & Pay (NULL si pertenece a otro servicio)';

-- ===== CONSTRAINT: Solo una FK de orden debe estar poblada =====
-- Actualizar o crear constraint para validar que solo UNA orden esté vinculada
ALTER TABLE dish_order
DROP CONSTRAINT IF EXISTS check_single_order_reference;

ALTER TABLE dish_order
ADD CONSTRAINT check_single_order_reference
CHECK (
  (
    (user_order_id IS NOT NULL)::integer +
    (tap_order_id IS NOT NULL)::integer +
    (pick_and_go_order_id IS NOT NULL)::integer +
    (room_order_id IS NOT NULL)::integer +
    (tap_pay_order_id IS NOT NULL)::integer
  ) = 1
);

COMMENT ON CONSTRAINT check_single_order_reference ON dish_order IS
  'Garantiza que cada platillo pertenezca a exactamente UNA orden de UN servicio';
