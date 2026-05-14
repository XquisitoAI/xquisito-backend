-- ============================================================
-- dish_order — Ítems de pedido
-- Compartido por: Flex Bill (user_order_id), Tap Order & Pay (tap_order_id),
--                 Pick & Go (pick_and_go_order_id), Room Service (room_order_id),
--                 Tap & Pay (tap_pay_order_id)
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dish_order (
  id                  uuid    NOT NULL DEFAULT gen_random_uuid(),
  item                varchar NOT NULL,
  quantity            integer DEFAULT 1,
  price               numeric NOT NULL,
  extra_price         numeric DEFAULT 0,
  status              varchar NOT NULL,
  payment_status      varchar NOT NULL,
  images              text[]  DEFAULT '{}',
  custom_fields       jsonb,
  menu_item_id        integer,
  special_instructions text,

  -- FK a la orden padre (solo una aplica)
  user_order_id       uuid,
  tap_order_id        uuid,
  pick_and_go_order_id uuid,
  room_order_id       uuid,
  tap_pay_order_id    uuid,

  CONSTRAINT dish_order_pkey PRIMARY KEY (id),
  CONSTRAINT dish_order_menu_item_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id),
  CONSTRAINT dish_order_status_check CHECK (
    (status)::text = ANY (ARRAY['pending', 'preparing', 'partial_ready', 'ready', 'delivered', 'cancelled']::text[])
  )
);

-- TRIGGERS — Actualiza totales en la orden padre al cambiar ítems
CREATE TRIGGER trigger_update_totals_on_dish_insert
  AFTER INSERT ON public.dish_order
  FOR EACH ROW EXECUTE FUNCTION public.update_table_order_totals();

CREATE TRIGGER trigger_update_totals_on_dish_update
  AFTER UPDATE ON public.dish_order
  FOR EACH ROW EXECUTE FUNCTION public.update_table_order_totals();

CREATE TRIGGER trigger_update_totals_on_dish_delete
  AFTER DELETE ON public.dish_order
  FOR EACH ROW EXECUTE FUNCTION public.update_table_order_totals();

-- También actualiza totales en tap_orders_and_pay
CREATE TRIGGER trigger_dish_order_update_tap_total
  AFTER INSERT OR UPDATE OR DELETE ON public.dish_order
  FOR EACH ROW EXECUTE FUNCTION public.trigger_update_tap_order_total();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_dish_order_user_order ON public.dish_order (user_order_id) WHERE user_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dish_order_tap_order ON public.dish_order (tap_order_id) WHERE tap_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dish_order_pick_go ON public.dish_order (pick_and_go_order_id) WHERE pick_and_go_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dish_order_room ON public.dish_order (room_order_id) WHERE room_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dish_order_tap_pay ON public.dish_order (tap_pay_order_id) WHERE tap_pay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dish_order_status ON public.dish_order (status);

-- RLS
ALTER TABLE public.dish_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to dish_order"
  ON public.dish_order FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "dish_order_select_policy"
  ON public.dish_order FOR SELECT TO public USING (true);

CREATE POLICY "dish_order_insert_policy"
  ON public.dish_order FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "dish_order_update_policy"
  ON public.dish_order FOR UPDATE TO public USING (true);

CREATE POLICY "dish_order_delete_policy"
  ON public.dish_order FOR DELETE TO public
  USING ((current_setting('rls.clerk_user_id', true) IS NOT NULL) OR (auth.uid() IS NOT NULL));
