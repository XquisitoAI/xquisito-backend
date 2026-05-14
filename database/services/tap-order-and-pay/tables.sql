-- ============================================================
-- Tap Order & Pay — Tablas principales
-- Servicio: El cliente escanea QR en mesa, ordena y paga desde su celular
-- Última verificación: 2026-05-14
-- ============================================================

-- TAP ORDERS AND PAY — Orden principal del servicio Tap Order & Pay
CREATE TABLE IF NOT EXISTS public.tap_orders_and_pay (
  id             uuid    NOT NULL DEFAULT gen_random_uuid(),
  table_id       uuid    NOT NULL,
  clerk_user_id  varchar,
  customer_name  varchar,
  customer_phone varchar,
  customer_email varchar,
  total_amount   numeric DEFAULT 0,
  payment_status varchar DEFAULT 'pending',
  order_status   varchar DEFAULT 'active',
  folio          varchar,
  order_notes    text,
  session_data   jsonb   DEFAULT '{}'::jsonb,
  created_at     timestamptz DEFAULT now(),
  completed_at   timestamptz,
  updated_at     timestamptz DEFAULT now(),

  CONSTRAINT tap_orders_and_pay_pkey PRIMARY KEY (id),
  CONSTRAINT tap_orders_and_pay_table_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id)
);

-- Folio generado al insertar
CREATE TRIGGER trg_set_folio_tap_orders
  BEFORE INSERT ON public.tap_orders_and_pay
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_folio_tap_orders();

-- Libera la mesa cuando el pago se completa
CREATE TRIGGER trigger_release_table_on_order_complete
  AFTER UPDATE ON public.tap_orders_and_pay
  FOR EACH ROW EXECUTE FUNCTION public.release_table_on_order_complete();

CREATE TRIGGER trigger_update_tap_orders_updated_at
  BEFORE UPDATE ON public.tap_orders_and_pay
  FOR EACH ROW EXECUTE FUNCTION public.update_tap_orders_updated_at();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tap_orders_table ON public.tap_orders_and_pay (table_id);
CREATE INDEX IF NOT EXISTS idx_tap_orders_status ON public.tap_orders_and_pay (order_status, payment_status);

-- RLS
ALTER TABLE public.tap_orders_and_pay ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to tap_orders_and_pay"
  ON public.tap_orders_and_pay FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tap_orders_and_pay_all_policy"
  ON public.tap_orders_and_pay FOR ALL TO public USING (true) WITH CHECK (true);
