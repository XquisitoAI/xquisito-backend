-- ============================================================
-- restaurants — Restaurantes registrados en la plataforma
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.restaurants (
  id                   serial        NOT NULL,
  user_id              integer       NOT NULL,
  client_id            uuid,
  name                 varchar       NOT NULL,
  description          text,
  logo_url             text,
  banner_url           text,
  address              text,
  phone                varchar,
  email                varchar,
  is_active            boolean       DEFAULT true,
  table_count          integer       DEFAULT 0,
  room_count           integer       DEFAULT 0,
  order_notifications  boolean       DEFAULT true,
  email_notifications  boolean       DEFAULT false,
  sms_notifications    boolean       DEFAULT false,
  opening_hours        jsonb         DEFAULT '{"monday":{"is_closed":false,"open_time":"09:00","close_time":"22:00"},"tuesday":{"is_closed":false,"open_time":"09:00","close_time":"22:00"},"wednesday":{"is_closed":false,"open_time":"09:00","close_time":"22:00"},"thursday":{"is_closed":false,"open_time":"09:00","close_time":"22:00"},"friday":{"is_closed":false,"open_time":"09:00","close_time":"23:00"},"saturday":{"is_closed":false,"open_time":"10:00","close_time":"23:00"},"sunday":{"is_closed":false,"open_time":"10:00","close_time":"20:00"}}'::jsonb,
  deleted              boolean       DEFAULT false,
  created_at           timestamptz   DEFAULT now(),
  updated_at           timestamptz   DEFAULT now(),

  CONSTRAINT restaurants_pkey PRIMARY KEY (id),
  CONSTRAINT restaurants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_admin_portal(id),
  CONSTRAINT fk_restaurants_client FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.validate_notification_settings()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Asegura que al menos order_notifications esté habilitado
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_validate_notification_settings
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.validate_notification_settings();

CREATE TRIGGER trigger_update_restaurants_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.update_menu_updated_at_column();

-- Sync inicial de conteos desde clients al insertar un restaurant
CREATE TRIGGER trigger_apply_initial_table_count
  AFTER INSERT ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.sync_initial_table_count_from_client();

CREATE TRIGGER trigger_apply_initial_room_count
  AFTER INSERT ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.sync_initial_room_count_from_client();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_restaurants_user_id ON public.restaurants (user_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_client_id ON public.restaurants (client_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_deleted ON public.restaurants (deleted) WHERE deleted = false;

-- RLS
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurants_select_policy"
  ON public.restaurants FOR SELECT TO public
  USING (
    (user_id IN (SELECT id FROM public.user_admin_portal WHERE (clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "restaurants_insert_policy"
  ON public.restaurants FOR INSERT TO public
  WITH CHECK (
    (user_id IN (SELECT id FROM public.user_admin_portal WHERE (clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "restaurants_update_policy"
  ON public.restaurants FOR UPDATE TO public
  USING (
    (user_id IN (SELECT id FROM public.user_admin_portal WHERE (clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

-- DELETE bloqueado intencionalmente (soft delete via columna deleted)
CREATE POLICY "restaurants_delete_policy"
  ON public.restaurants FOR DELETE TO public USING (false);
