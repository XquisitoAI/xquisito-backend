-- ============================================================
-- Room Service — Tablas principales
-- Servicio: Pedidos a habitación de hotel
-- Última verificación: 2026-05-14
-- ============================================================

-- ROOM ORDERS — Pedido de room service por habitación
CREATE TABLE IF NOT EXISTS public.room_orders (
  id             uuid    NOT NULL DEFAULT gen_random_uuid(),
  room_id        uuid    NOT NULL,
  customer_name  varchar,
  customer_phone varchar,
  user_id        varchar,
  total_amount   numeric NOT NULL DEFAULT 0.00,
  payment_status varchar NOT NULL DEFAULT 'pending',
  order_status   varchar NOT NULL DEFAULT 'pending',
  folio          varchar,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT room_orders_pkey PRIMARY KEY (id),
  CONSTRAINT room_orders_room_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id)
);

CREATE TRIGGER trg_set_folio_room_orders
  BEFORE INSERT ON public.room_orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_folio_room_orders();

CREATE TRIGGER update_room_orders_updated_at
  BEFORE UPDATE ON public.room_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_room_orders_room ON public.room_orders (room_id);
CREATE INDEX IF NOT EXISTS idx_room_orders_status ON public.room_orders (order_status, payment_status);

-- RLS
ALTER TABLE public.room_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on room_orders"
  ON public.room_orders FOR ALL TO public USING (true) WITH CHECK (true);
