-- ============================================================
-- menu_sections — Secciones del menú por restaurante
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.menu_sections (
  id            serial  NOT NULL,
  restaurant_id integer,
  name          varchar NOT NULL,
  clasificacion integer,  -- 1=food, 2=drinks, 3=other
  is_active     boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  CONSTRAINT menu_sections_pkey PRIMARY KEY (id),
  CONSTRAINT menu_sections_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id)
);

-- TRIGGER
CREATE TRIGGER trigger_update_menu_sections_updated_at
  BEFORE UPDATE ON public.menu_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_menu_updated_at_column();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_menu_sections_restaurant ON public.menu_sections (restaurant_id);

-- RLS
ALTER TABLE public.menu_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_sections_select_policy"
  ON public.menu_sections FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "menu_sections_insert_policy"
  ON public.menu_sections FOR INSERT TO public
  WITH CHECK (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "menu_sections_update_policy"
  ON public.menu_sections FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "menu_sections_delete_policy"
  ON public.menu_sections FOR DELETE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );
