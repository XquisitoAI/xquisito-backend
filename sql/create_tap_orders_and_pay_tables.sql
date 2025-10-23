-- ====================================================
-- Script para crear tabla tap_orders_and_pay y modificar dish_order
-- Para el nuevo flujo de Tap Order and Pay
-- ====================================================

-- Crear tabla principal tap_orders_and_pay
CREATE TABLE public.tap_orders_and_pay (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relaciones con tablas existentes
  table_id uuid NOT NULL REFERENCES tables(id),
  clerk_user_id varchar REFERENCES users(clerk_user_id), -- NULL = invitado

  -- Datos del cliente (invitado o registrado)
  customer_name varchar,
  customer_phone varchar,
  customer_email varchar,

  -- Control de orden
  total_amount numeric DEFAULT 0,
  payment_status varchar DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  order_status varchar DEFAULT 'active' CHECK (order_status IN ('active', 'confirmed', 'preparing', 'completed', 'abandoned')),

  -- Ya no necesitamos qr_token con el flujo de URL directa

  -- Metadatos
  session_data jsonb DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Agregar columna de referencia a la tabla dish_order existente
ALTER TABLE public.dish_order
ADD COLUMN tap_order_id uuid REFERENCES tap_orders_and_pay(id);

-- Crear índices para mejorar performance
CREATE INDEX idx_tap_orders_table_id ON tap_orders_and_pay(table_id);
-- Ya no necesitamos índice para qr_token
CREATE INDEX idx_tap_orders_clerk_user_id ON tap_orders_and_pay(clerk_user_id);
CREATE INDEX idx_tap_orders_status ON tap_orders_and_pay(order_status, payment_status);
CREATE INDEX idx_dish_order_tap_order_id ON dish_order(tap_order_id);

-- Crear función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_tap_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para updated_at
CREATE TRIGGER trigger_update_tap_orders_updated_at
  BEFORE UPDATE ON tap_orders_and_pay
  FOR EACH ROW
  EXECUTE FUNCTION update_tap_orders_updated_at();

-- Ya no necesitamos función para generar tokens QR

-- Comentarios para documentación
COMMENT ON TABLE tap_orders_and_pay IS 'Tabla principal para gestionar órdenes del flujo Tap Order and Pay';
COMMENT ON COLUMN tap_orders_and_pay.clerk_user_id IS 'ID de Clerk para usuarios registrados, NULL para invitados';
-- Ya no necesitamos comentario para qr_token
COMMENT ON COLUMN tap_orders_and_pay.session_data IS 'Datos adicionales flexibles en formato JSON';
COMMENT ON COLUMN dish_order.tap_order_id IS 'Referencia a la orden de Tap Order and Pay (nueva funcionalidad)';