-- ============================================================
-- carts / cart_items — Carrito de compras compartido
-- Usado por: Pick & Go, Tap Order & Pay, Room Service, y otros servicios
-- Última verificación: 2026-05-14
-- ============================================================

-- CARTS — Carrito de compras (previo a ordenar)
CREATE TABLE IF NOT EXISTS public.carts (
  id            uuid    NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid,
  guest_id      varchar,
  client_id     uuid,
  restaurant_id integer,
  branch_number integer,
  total_items   integer DEFAULT 0,
  total_amount  numeric DEFAULT 0,
  order_notes   text,
  expires_at    timestamptz DEFAULT (now() + interval '24 hours'),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  CONSTRAINT carts_pkey PRIMARY KEY (id)
);

CREATE TRIGGER trigger_update_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_carts_user       ON public.carts (user_id)      WHERE user_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carts_guest      ON public.carts (guest_id)     WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carts_restaurant ON public.carts (restaurant_id, branch_number);

-- RLS
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on carts"
  ON public.carts FOR ALL TO public USING (true);

-- CART ITEMS — Ítems dentro del carrito
CREATE TABLE IF NOT EXISTS public.cart_items (
  id                   uuid    NOT NULL DEFAULT gen_random_uuid(),
  cart_id              uuid    NOT NULL,
  menu_item_id         integer NOT NULL,
  item_name            text    NOT NULL,
  item_description     text,
  item_images          text[],
  item_features        text[]  DEFAULT ARRAY[]::text[],
  quantity             integer NOT NULL DEFAULT 1,
  unit_price           numeric NOT NULL,
  extra_price          numeric DEFAULT 0,
  discount             integer DEFAULT 0,
  custom_fields        jsonb   DEFAULT '[]'::jsonb,
  special_instructions text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),

  CONSTRAINT cart_items_pkey PRIMARY KEY (id),
  CONSTRAINT cart_items_cart_fkey      FOREIGN KEY (cart_id)      REFERENCES public.carts(id)      ON DELETE CASCADE,
  CONSTRAINT cart_items_menu_item_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id)
);

CREATE TRIGGER trigger_update_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recalcula total del carrito al insertar/actualizar/eliminar ítems
CREATE TRIGGER trigger_update_cart_totals_on_insert
  AFTER INSERT ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_cart_totals();

CREATE TRIGGER trigger_update_cart_totals_on_update
  AFTER UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_cart_totals();

CREATE TRIGGER trigger_update_cart_totals_on_delete
  AFTER DELETE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_cart_totals();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON public.cart_items (cart_id);

-- RLS
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on cart_items"
  ON public.cart_items FOR ALL TO public USING (true);
