-- ============================================================
-- Flex Bill — Tablas principales
-- Servicio: Pago de cuenta en mesa para usuarios registrados y guests
-- Última verificación: 2026-05-14
-- ============================================================

-- TABLE ORDER — Orden activa en una mesa
CREATE TABLE IF NOT EXISTS public.table_order (
  id               uuid    NOT NULL DEFAULT gen_random_uuid(),
  table_id         uuid    NOT NULL,
  restaurant_id    integer NOT NULL,
  branch_number    integer NOT NULL,
  no_items         integer DEFAULT 0,
  total_amount     numeric DEFAULT 0,
  paid_amount      numeric DEFAULT 0,
  remaining_amount numeric DEFAULT 0,
  status           varchar NOT NULL,
  folio            varchar,
  created_at       timestamp DEFAULT CURRENT_TIMESTAMP,
  closed_at        timestamp,

  CONSTRAINT table_order_pkey PRIMARY KEY (id),
  CONSTRAINT table_order_table_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id)
);

CREATE TRIGGER trg_set_folio_table_order
  BEFORE INSERT ON public.table_order
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_folio_table_order();

CREATE INDEX IF NOT EXISTS idx_table_order_table ON public.table_order (table_id);
CREATE INDEX IF NOT EXISTS idx_table_order_status ON public.table_order (status);
CREATE INDEX IF NOT EXISTS idx_table_order_restaurant ON public.table_order (restaurant_id, branch_number);

ALTER TABLE public.table_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to table_order"
  ON public.table_order FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "table_order_select_policy"
  ON public.table_order FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "table_order_insert_policy"
  ON public.table_order FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "table_order_update_policy"
  ON public.table_order FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "table_order_delete_policy"
  ON public.table_order FOR DELETE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

-- USER ORDER — Participante en una table_order (usuario o guest)
CREATE TABLE IF NOT EXISTS public.user_order (
  id                    uuid    NOT NULL DEFAULT gen_random_uuid(),
  table_order_id        uuid    NOT NULL,
  user_id               uuid,
  guest_name            varchar,
  guest_id              varchar,
  payment_method_id     integer,
  payment_card_last_four varchar,
  payment_card_type     varchar,
  order_notes           text,

  CONSTRAINT user_order_pkey PRIMARY KEY (id),
  CONSTRAINT user_order_table_order_fkey FOREIGN KEY (table_order_id) REFERENCES public.table_order(id)
);

CREATE INDEX IF NOT EXISTS idx_user_order_table_order ON public.user_order (table_order_id);

ALTER TABLE public.user_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to user_order"
  ON public.user_order FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "user_order_select_policy"
  ON public.user_order FOR SELECT TO public USING (true);

CREATE POLICY "user_order_insert_policy"
  ON public.user_order FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "user_order_update_policy"
  ON public.user_order FOR UPDATE TO public USING (true);

CREATE POLICY "user_order_delete_policy"
  ON public.user_order FOR DELETE TO public
  USING ((current_setting('rls.clerk_user_id', true) IS NOT NULL) OR (auth.uid() IS NOT NULL));

-- ACTIVE TABLE USERS — Usuarios activos en una mesa (para split de cuenta)
CREATE TABLE IF NOT EXISTS public.active_table_users (
  id                   uuid    NOT NULL DEFAULT gen_random_uuid(),
  table_number         integer NOT NULL,
  restaurant_id        integer NOT NULL,
  branch_number        integer NOT NULL,
  user_id              varchar,
  guest_id             varchar,
  guest_name           text,
  total_paid_individual numeric DEFAULT 0,
  total_paid_amount     numeric DEFAULT 0,
  total_paid_split      numeric DEFAULT 0,
  is_in_split          boolean DEFAULT false,
  created_at           timestamp DEFAULT now(),
  updated_at           timestamp DEFAULT now(),

  CONSTRAINT active_table_users_pkey PRIMARY KEY (id),
  CONSTRAINT fk_active_users_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id),
  CONSTRAINT fk_active_table_users_branch FOREIGN KEY (restaurant_id, branch_number) REFERENCES public.branches(restaurant_id, branch_number)
);

CREATE INDEX IF NOT EXISTS idx_active_table_users_restaurant_branch ON public.active_table_users (restaurant_id, branch_number);
CREATE INDEX IF NOT EXISTS idx_active_table_users_table ON public.active_table_users (table_number);
CREATE INDEX IF NOT EXISTS idx_active_table_users_user ON public.active_table_users (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_active_table_users_guest_id ON public.active_table_users (guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_active_table_users_guest ON public.active_table_users (guest_name) WHERE guest_name IS NOT NULL;

ALTER TABLE public.active_table_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to active_table_users"
  ON public.active_table_users FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "active_table_users_all_policy"
  ON public.active_table_users FOR ALL TO public USING (true) WITH CHECK (true);

-- SPLIT PAYMENTS — Pagos divididos en Flex Bill
CREATE TABLE IF NOT EXISTS public.split_payments (
  id              uuid    NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id   integer NOT NULL,
  branch_number   integer NOT NULL,
  table_number    integer NOT NULL,
  user_id         varchar,
  guest_id        varchar,
  guest_name      varchar,
  expected_amount numeric NOT NULL,
  amount_paid     numeric DEFAULT 0,
  original_total  numeric NOT NULL,
  status          varchar DEFAULT 'pending',
  created_at      timestamp DEFAULT CURRENT_TIMESTAMP,
  paid_at         timestamp,
  updated_at      timestamp DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT split_payments_pkey PRIMARY KEY (id)
);

CREATE TRIGGER update_split_payments_updated_at
  BEFORE UPDATE ON public.split_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_split_payments_updated_at();

CREATE INDEX IF NOT EXISTS idx_split_payments_restaurant ON public.split_payments (restaurant_id, branch_number, table_number);

ALTER TABLE public.split_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to split_payments"
  ON public.split_payments FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "split_payments_insert_policy"
  ON public.split_payments FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "split_payments_select_policy"
  ON public.split_payments FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "split_payments_update_policy"
  ON public.split_payments FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "split_payments_delete_policy"
  ON public.split_payments FOR DELETE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );
