-- ============================================================
-- payment_transactions — Registro contable de todos los pagos
-- Cubre: Flex Bill, Tap Order & Pay, Pick & Go, Room Service, Tap & Pay
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id                          uuid    NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id               integer NOT NULL,
  payment_method_id           uuid,

  -- Referencias a órdenes (solo una aplica por transacción)
  id_table_order              uuid,
  id_tap_orders_and_pay       uuid,
  id_pick_and_go_order        uuid,
  id_room_order               uuid,
  id_tap_pay_order            uuid,

  -- Montos base
  base_amount                 numeric NOT NULL,
  tip_amount                  numeric NOT NULL DEFAULT 0,
  iva_tip                     numeric NOT NULL DEFAULT 0,
  total_amount_charged        numeric NOT NULL,
  subtotal_for_commission     numeric NOT NULL,

  -- Comisión Even
  even_rate_applied       numeric NOT NULL,
  even_commission_total   numeric NOT NULL DEFAULT 0,
  even_commission_client  numeric NOT NULL DEFAULT 0,
  even_commission_restaurant numeric NOT NULL DEFAULT 0,
  iva_even_client         numeric NOT NULL DEFAULT 0,
  iva_even_restaurant     numeric NOT NULL DEFAULT 0,
  even_client_charge      numeric NOT NULL DEFAULT 0,
  even_restaurant_charge  numeric NOT NULL DEFAULT 0,
  even_net_income         numeric NOT NULL,

  -- Comisión E-Cart (procesador de pagos)
  ecart_commission_rate       numeric NOT NULL,
  ecart_commission_amount     numeric NOT NULL DEFAULT 0,
  ecart_fixed_fee             numeric NOT NULL DEFAULT 1.50,
  iva_ecart                   numeric NOT NULL DEFAULT 0,
  ecart_commission_total      numeric NOT NULL DEFAULT 0,

  -- Ingreso neto del restaurante
  restaurant_net_income       numeric NOT NULL,

  -- Metadatos de pago
  card_type                   varchar NOT NULL,
  currency                    varchar NOT NULL DEFAULT 'MXN',
  user_id                     varchar,
  transaction_by              varchar DEFAULT 'guest',
  payment_source              varchar,
  ecartpay_order_id           varchar,

  created_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payment_transactions_pkey PRIMARY KEY (id)
);

-- TRIGGER de validación
CREATE TRIGGER validate_payment_amounts_trigger
  BEFORE INSERT OR UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_transaction_amounts();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_pt_restaurant ON public.payment_transactions (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_pt_table_order ON public.payment_transactions (id_table_order) WHERE id_table_order IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pt_tap_order ON public.payment_transactions (id_tap_orders_and_pay) WHERE id_tap_orders_and_pay IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pt_pick_go ON public.payment_transactions (id_pick_and_go_order) WHERE id_pick_and_go_order IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pt_room ON public.payment_transactions (id_room_order) WHERE id_room_order IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pt_tap_pay ON public.payment_transactions (id_tap_pay_order) WHERE id_tap_pay_order IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pt_created_at ON public.payment_transactions (created_at DESC);

-- RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to payment_transactions"
  ON public.payment_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "payment_transactions_insert_policy"
  ON public.payment_transactions FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "payment_transactions_select_policy"
  ON public.payment_transactions FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "payment_transactions_update_policy"
  ON public.payment_transactions FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

-- DELETE bloqueado intencionalmente (auditoría financiera)
CREATE POLICY "payment_transactions_delete_policy"
  ON public.payment_transactions FOR DELETE TO public USING (false);
