-- =====================================================
-- MIGRACIÓN: Crear tabla tap_pay_orders y relaciones
-- Descripción: Nueva tabla para el servicio Tap & Pay
-- Incluye soporte para split de cuenta y múltiples formas de pago
-- Fecha: 2026-01-09
-- =====================================================

-- 1. CREAR TABLA PRINCIPAL: tap_pay_orders
-- =====================================================
-- NOTA: La orden es de la mesa completa, no de usuarios individuales
-- Los participantes y sus pagos están en active_table_users
CREATE TABLE IF NOT EXISTS tap_pay_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ===== UBICACIÓN EN RESTAURANTE =====
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_number INTEGER NOT NULL,
  table_id UUID NULL REFERENCES tables(id) ON DELETE SET NULL,

  -- Constraint de FK compuesta para branch
  FOREIGN KEY (restaurant_id, branch_number)
    REFERENCES branches(restaurant_id, branch_number) ON DELETE CASCADE,

  -- ===== MONTOS =====
  -- Simplificado como table_order (FlexBill)
  total_amount DECIMAL(10,2) DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount DECIMAL(10,2) DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_amount DECIMAL(10,2) DEFAULT 0 CHECK (remaining_amount >= 0),

  -- ===== ESTADOS =====
  payment_status VARCHAR NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'partial', 'paid', 'failed', 'refunded')),

  order_status VARCHAR NOT NULL DEFAULT 'active'
    CHECK (order_status IN ('active', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'abandoned')),

  -- ===== SPLIT DE CUENTA =====
  -- Indica si la cuenta está en modo división
  is_split_active BOOLEAN DEFAULT false,
  split_method VARCHAR NULL
    CHECK (split_method IS NULL OR split_method IN ('equal', 'by_items', 'custom_amount')),
  number_of_splits INTEGER NULL CHECK (number_of_splits > 0),

  -- ===== AUDITORÍA =====
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,  -- Cuando se completó la orden
  cancelled_at TIMESTAMPTZ NULL,  -- Cuando se canceló

  -- ===== CONSTRAINTS ADICIONALES =====
  -- El monto pagado no puede exceder el total
  CONSTRAINT check_paid_not_exceeds_total
    CHECK (paid_amount <= total_amount),

  -- Si está completada, debe tener fecha de completado
  CONSTRAINT check_completed_has_date
    CHECK (
      (order_status = 'completed' AND completed_at IS NOT NULL)
      OR
      (order_status != 'completed')
    ),

  -- Si está en split, debe tener método y número de divisiones
  CONSTRAINT check_split_data
    CHECK (
      (is_split_active = true AND split_method IS NOT NULL AND number_of_splits IS NOT NULL)
      OR
      (is_split_active = false)
    )
);

-- ===== COMENTARIOS =====
COMMENT ON TABLE tap_pay_orders IS 'Órdenes para el servicio Tap & Pay - La orden es de la mesa completa, participantes en active_table_users';
COMMENT ON COLUMN tap_pay_orders.table_id IS 'Referencia a la mesa física (FK a tables)';
COMMENT ON COLUMN tap_pay_orders.is_split_active IS 'Indica si la cuenta está siendo dividida entre múltiples personas';
COMMENT ON COLUMN tap_pay_orders.split_method IS 'Método de división: equal (equitativo), by_items (por items), custom_amount (monto personalizado)';
COMMENT ON COLUMN tap_pay_orders.remaining_amount IS 'Monto pendiente de pagar (calculado: total - paid)';

-- ===== INDICES PARA RENDIMIENTO =====
-- Índice por table_id
CREATE INDEX idx_tap_pay_orders_table_id
  ON tap_pay_orders(table_id)
  WHERE table_id IS NOT NULL;

-- Índice por estados (para filtrar órdenes activas, pendientes de pago, etc.)
CREATE INDEX idx_tap_pay_orders_status
  ON tap_pay_orders(order_status, payment_status)
  WHERE order_status IN ('active', 'confirmed', 'preparing', 'ready');

-- Índice por fecha de creación (para reportes y búsquedas temporales)
CREATE INDEX idx_tap_pay_orders_created_at
  ON tap_pay_orders(created_at DESC);

-- Índice compuesto para dashboard de restaurante
CREATE INDEX idx_tap_pay_orders_restaurant_date
  ON tap_pay_orders(restaurant_id, branch_number, created_at DESC);

-- Índice para órdenes con split activo
CREATE INDEX idx_tap_pay_orders_split_active
  ON tap_pay_orders(id)
  WHERE is_split_active = true;

-- ===== TRIGGER: Actualizar updated_at automáticamente =====
CREATE TRIGGER trigger_update_tap_pay_orders_updated_at
  BEFORE UPDATE ON tap_pay_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===== TRIGGER: Actualizar remaining_amount automáticamente =====
CREATE OR REPLACE FUNCTION update_tap_pay_remaining_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_amount = GREATEST(NEW.total_amount - NEW.paid_amount, 0);

  -- Actualizar payment_status según el monto pagado
  IF NEW.paid_amount >= NEW.total_amount THEN
    NEW.payment_status = 'paid';
  ELSIF NEW.paid_amount > 0 THEN
    NEW.payment_status = 'partial';
  ELSE
    NEW.payment_status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tap_pay_remaining_amount
  BEFORE INSERT OR UPDATE OF total_amount, paid_amount ON tap_pay_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_tap_pay_remaining_amount();
