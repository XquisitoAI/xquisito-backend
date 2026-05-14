-- ============================================================
-- order_flow_logs — Logs de flujo de órdenes (auditoría)
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_flow_logs (
  id            uuid  NOT NULL DEFAULT gen_random_uuid(),
  order_id      uuid,
  order_type    text,
  restaurant_id integer,
  step          text  NOT NULL,
  status        text  NOT NULL,
  error_message text,
  metadata      jsonb,
  created_at    timestamptz DEFAULT now(),

  CONSTRAINT order_flow_logs_pkey PRIMARY KEY (id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_order_flow_logs_order_id ON public.order_flow_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_order_flow_logs_restaurant ON public.order_flow_logs (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_flow_logs_created_at ON public.order_flow_logs (created_at DESC);

-- RLS (sin política: solo acceso por service_role via backend)
ALTER TABLE public.order_flow_logs ENABLE ROW LEVEL SECURITY;
