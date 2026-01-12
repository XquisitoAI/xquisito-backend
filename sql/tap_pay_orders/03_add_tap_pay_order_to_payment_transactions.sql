-- =====================================================
-- MIGRACIÓN: Agregar relación a tap_pay_orders en payment_transactions
-- Descripción: Permite registrar transacciones de pago para Tap & Pay
-- Fecha: 2026-01-09
-- =====================================================

-- Agregar columna id_tap_pay_order a payment_transactions
ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS id_tap_pay_order UUID NULL
  REFERENCES tap_pay_orders(id) ON DELETE SET NULL;

-- Crear índice para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tap_pay_order
  ON payment_transactions(id_tap_pay_order)
  WHERE id_tap_pay_order IS NOT NULL;

-- Comentario descriptivo
COMMENT ON COLUMN payment_transactions.id_tap_pay_order IS 'Referencia a orden de Tap & Pay (NULL si es de otro servicio)';

-- Nota: NO agregamos constraint check_at_least_one_order por compatibilidad
-- con transacciones existentes que pueden no tener orden asignada
