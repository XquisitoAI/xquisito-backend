-- ============================================================
-- Pick & Go — Tablas principales
-- Servicio: Pedidos para llevar con pago digital
-- Nota: carts y cart_items son compartidos → shared/orders/carts.sql
-- Última verificación: 2026-05-14
-- ============================================================

-- PICK AND GO ORDERS — Órdenes confirmadas para llevar
CREATE TABLE IF NOT EXISTS public.pick_and_go_orders (
  id             uuid    NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id  integer,
  branch_number  integer,
  clerk_user_id  varchar,
  customer_name  varchar,
  customer_phone varchar,
  customer_email varchar,
  total_amount   numeric DEFAULT 0,
  payment_status varchar DEFAULT 'pending',
  order_status   varchar DEFAULT 'active',
  cooking_status varchar NOT NULL DEFAULT 'preparing',
  folio          varchar,
  order_notes    text,
  session_data   jsonb   DEFAULT '{}'::jsonb,
  prep_metadata  jsonb   DEFAULT '{}'::jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),

  CONSTRAINT pick_and_go_orders_pkey PRIMARY KEY (id)
);

CREATE TRIGGER trg_set_folio_pick_and_go
  BEFORE INSERT ON public.pick_and_go_orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_folio_pick_and_go();

CREATE TRIGGER trigger_update_pick_and_go_orders_updated_at
  BEFORE UPDATE ON public.pick_and_go_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_pick_and_go_orders_updated_at();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_pick_and_go_restaurant ON public.pick_and_go_orders (restaurant_id, branch_number);
CREATE INDEX IF NOT EXISTS idx_pick_and_go_status     ON public.pick_and_go_orders (order_status, payment_status);

-- RLS
ALTER TABLE public.pick_and_go_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to pick_and_go_orders"
  ON public.pick_and_go_orders FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "pick_and_go_orders_insert_policy"
  ON public.pick_and_go_orders FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "pick_and_go_orders_select_policy"
  ON public.pick_and_go_orders FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "pick_and_go_orders_update_policy"
  ON public.pick_and_go_orders FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

-- DELETE bloqueado (auditoría)
CREATE POLICY "pick_and_go_orders_delete_policy"
  ON public.pick_and_go_orders FOR DELETE TO public USING (false);
