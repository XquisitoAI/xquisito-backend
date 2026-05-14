-- ============================================================
-- menu_items — Platillos y bebidas del menú
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.menu_items (
  id            serial   NOT NULL,
  section_id    integer  NOT NULL,
  name          varchar  NOT NULL,
  description   text,
  image_url     text,
  price         numeric  NOT NULL,
  base_price    numeric,
  discount      integer  DEFAULT 0,
  custom_fields jsonb    DEFAULT '[]'::jsonb,
  is_available  boolean  DEFAULT true,
  display_order integer  DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  CONSTRAINT menu_items_pkey PRIMARY KEY (id),
  CONSTRAINT menu_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.menu_sections(id) ON DELETE CASCADE
);

-- TRIGGER
CREATE TRIGGER trigger_update_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_menu_updated_at_column();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_menu_items_section ON public.menu_items (section_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON public.menu_items (is_available) WHERE is_available = true;

-- RLS
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items_select_policy"
  ON public.menu_items FOR SELECT TO public
  USING (
    (section_id IN (
      SELECT ms.id FROM public.menu_sections ms
      JOIN public.restaurants r ON ms.restaurant_id = r.id
      JOIN public.user_admin_portal u ON r.user_id = u.id
      WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text
    )) OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "menu_items_insert_policy"
  ON public.menu_items FOR INSERT TO public
  WITH CHECK (
    (section_id IN (
      SELECT ms.id FROM public.menu_sections ms
      JOIN public.restaurants r ON ms.restaurant_id = r.id
      JOIN public.user_admin_portal u ON r.user_id = u.id
      WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text
    )) OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "menu_items_update_policy"
  ON public.menu_items FOR UPDATE TO public
  USING (
    (section_id IN (
      SELECT ms.id FROM public.menu_sections ms
      JOIN public.restaurants r ON ms.restaurant_id = r.id
      JOIN public.user_admin_portal u ON r.user_id = u.id
      WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text
    )) OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "menu_items_delete_policy"
  ON public.menu_items FOR DELETE TO public
  USING (
    (section_id IN (
      SELECT ms.id FROM public.menu_sections ms
      JOIN public.restaurants r ON ms.restaurant_id = r.id
      JOIN public.user_admin_portal u ON r.user_id = u.id
      WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text
    )) OR current_setting('rls.clerk_user_id', true) IS NULL
  );
