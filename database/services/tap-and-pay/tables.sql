-- ============================================================
-- Tap & Pay — Tablas principales
-- Servicio: El cliente escanea QR y paga la cuenta del POS existente
-- (Se integra con sistemas POS como Soft Restaurant / Symphony)
-- Última verificación: 2026-05-14
-- ============================================================

-- TAP PAY ORDERS — Sesión de pago de cuenta POS
CREATE TABLE IF NOT EXISTS public.tap_pay_orders (
  id               uuid    NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id    integer NOT NULL,
  branch_number    integer NOT NULL,
  table_id         uuid,
  total_amount     numeric DEFAULT 0,
  paid_amount      numeric DEFAULT 0,
  remaining_amount numeric DEFAULT 0,
  payment_status   varchar NOT NULL DEFAULT 'pending',
  order_status     varchar NOT NULL DEFAULT 'active',
  is_split_active  boolean DEFAULT false,
  split_method     varchar,
  number_of_splits integer,
  -- Referencia al POS
  pos_order_id     varchar,
  pos_check_number varchar,
  folio            varchar,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  cancelled_at     timestamptz,

  CONSTRAINT tap_pay_orders_pkey PRIMARY KEY (id),
  CONSTRAINT tap_pay_orders_table_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id)
);

-- Folio generado al insertar
CREATE TRIGGER trg_set_folio_tap_pay_orders
  BEFORE INSERT ON public.tap_pay_orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_folio_tap_pay_orders();

-- Ocupa la mesa al crear la orden
CREATE TRIGGER trigger_occupy_table_on_tap_pay_order_create
  AFTER INSERT ON public.tap_pay_orders
  FOR EACH ROW EXECUTE FUNCTION public.occupy_table_on_tap_pay_order_create();

-- Libera la mesa al completar el pago
CREATE TRIGGER trigger_release_table_on_tap_pay_order_complete
  AFTER UPDATE ON public.tap_pay_orders
  FOR EACH ROW EXECUTE FUNCTION public.release_table_on_tap_pay_order_complete();

-- Recalcula remaining_amount al cambiar paid_amount
CREATE TRIGGER trigger_update_tap_pay_remaining_amount
  BEFORE INSERT OR UPDATE ON public.tap_pay_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_tap_pay_remaining_amount();

CREATE TRIGGER trigger_update_tap_pay_orders_updated_at
  BEFORE UPDATE ON public.tap_pay_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tap_pay_orders_restaurant ON public.tap_pay_orders (restaurant_id, branch_number);
CREATE INDEX IF NOT EXISTS idx_tap_pay_orders_table ON public.tap_pay_orders (table_id) WHERE table_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tap_pay_orders_status ON public.tap_pay_orders (order_status, payment_status);

-- RLS
ALTER TABLE public.tap_pay_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to tap_pay_orders"
  ON public.tap_pay_orders FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tap_pay_orders_insert_policy"
  ON public.tap_pay_orders FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "tap_pay_orders_select_policy"
  ON public.tap_pay_orders FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "tap_pay_orders_update_policy"
  ON public.tap_pay_orders FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "tap_pay_orders_delete_policy"
  ON public.tap_pay_orders FOR DELETE TO public USING (false);

-- ACTIVE TAP PAY USERS — Usuarios en sesión activa de Tap & Pay
CREATE TABLE IF NOT EXISTS public.active_tap_pay_users (
  id               uuid    NOT NULL DEFAULT gen_random_uuid(),
  tap_pay_order_id uuid    NOT NULL,
  user_id          uuid,
  guest_id         text,
  guest_name       varchar,
  amount_paid      numeric DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),

  CONSTRAINT active_tap_pay_users_pkey PRIMARY KEY (id),
  CONSTRAINT active_tap_pay_users_order_fkey FOREIGN KEY (tap_pay_order_id) REFERENCES public.tap_pay_orders(id)
);

CREATE TRIGGER trigger_update_active_tap_pay_users_updated_at
  BEFORE UPDATE ON public.active_tap_pay_users
  FOR EACH ROW EXECUTE FUNCTION public.update_active_tap_pay_users_updated_at();

CREATE INDEX IF NOT EXISTS idx_active_tap_pay_order ON public.active_tap_pay_users (tap_pay_order_id);

ALTER TABLE public.active_tap_pay_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to active_tap_pay_users"
  ON public.active_tap_pay_users FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "active_tap_pay_users_all_policy"
  ON public.active_tap_pay_users FOR ALL TO public USING (true) WITH CHECK (true);
