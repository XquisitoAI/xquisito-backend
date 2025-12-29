-- ====================================================
-- Tabla de Órdenes de Habitación (Room Orders)
-- Similar a tap_orders_and_pay pero para Room Service
-- ====================================================

CREATE TABLE IF NOT EXISTS public.room_orders (
  -- Identificador único
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- =============================================
  -- INFORMACIÓN DEL CLIENTE
  -- =============================================

  -- Nombre del cliente
  customer_name VARCHAR(255),

  -- Teléfono del cliente
  customer_phone VARCHAR(50),

  -- ID de usuario o invitado (puede ser user_id de Supabase Auth o guest_id)
  user_id VARCHAR(255),

  -- =============================================
  -- RELACIONES
  -- =============================================

  -- Habitación asociada (REQUERIDO)
  room_id UUID NOT NULL,

  -- =============================================
  -- MONTOS
  -- =============================================

  -- Monto total de la orden
  total_amount DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,

  -- =============================================
  -- ESTADOS
  -- =============================================

  -- Estado de pago
  payment_status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  -- Estados: pending, paid, failed

  -- Estado de la orden
  order_status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  -- Estados: pending, completed, cancelled

  -- =============================================
  -- TIMESTAMPS
  -- =============================================

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- =============================================
  -- CONSTRAINTS
  -- =============================================

  -- FK a rooms
  CONSTRAINT fk_room_orders_room FOREIGN KEY (room_id)
    REFERENCES public.rooms(id) ON DELETE CASCADE,

  -- Validar payment_status
  CONSTRAINT chk_room_payment_status CHECK (
    payment_status IN ('pending', 'paid', 'failed')
  ),

  -- Validar order_status
  CONSTRAINT chk_room_order_status CHECK (
    order_status IN ('pending', 'completed', 'cancelled')
  ),

  -- Validar que total_amount no sea negativo
  CONSTRAINT chk_room_total_amount_positive CHECK (
    total_amount >= 0
  )
);

-- =============================================
-- ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índice por room_id
CREATE INDEX IF NOT EXISTS idx_room_orders_room_id
ON public.room_orders(room_id);

-- Índice compuesto por estados
CREATE INDEX IF NOT EXISTS idx_room_orders_status
ON public.room_orders(payment_status, order_status);

-- Índice por user_id
CREATE INDEX IF NOT EXISTS idx_room_orders_user_id
ON public.room_orders(user_id)
WHERE user_id IS NOT NULL;

-- Índice por fecha de creación (para reportes)
CREATE INDEX IF NOT EXISTS idx_room_orders_created
ON public.room_orders(created_at DESC);

-- Índice compuesto para búsquedas activas
CREATE INDEX IF NOT EXISTS idx_room_orders_active
ON public.room_orders(room_id, order_status)
WHERE order_status = 'pending';

-- =============================================
-- TRIGGER PARA ACTUALIZAR updated_at
-- =============================================

CREATE TRIGGER update_room_orders_updated_at
  BEFORE UPDATE ON public.room_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.room_orders ENABLE ROW LEVEL SECURITY;

-- Política permisiva para desarrollo (ajustar en producción)
CREATE POLICY "Allow all operations on room_orders" ON public.room_orders
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =============================================

COMMENT ON TABLE public.room_orders IS
'Órdenes de servicio a habitación (Room Service)';

COMMENT ON COLUMN public.room_orders.room_id IS
'Habitación asociada a esta orden';

COMMENT ON COLUMN public.room_orders.user_id IS
'ID de usuario (Supabase Auth) o guest_id (invitado). Puede ser NULL si no se identifica';

COMMENT ON COLUMN public.room_orders.payment_status IS
'Estado de pago: pending (pendiente), paid (pagado), failed (fallido)';

COMMENT ON COLUMN public.room_orders.order_status IS
'Estado de orden: pending (pendiente), completed (completada), cancelled (cancelada)';
