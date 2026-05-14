-- ============================================================
-- Admin Portal — Plantillas de comunicación
-- Portal: Por restaurante (email y SMS para campañas)
-- Última verificación: 2026-05-14
-- ============================================================

-- EMAIL TEMPLATES — Plantillas de email para campañas
CREATE TABLE IF NOT EXISTS public.email_templates (
  id            uuid    NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id integer NOT NULL,
  name          varchar(255) NOT NULL,
  subject       varchar(255) NOT NULL,
  blocks        jsonb   NOT NULL,
  is_default    boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  CONSTRAINT email_templates_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to email_templates"
  ON public.email_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "email_templates_select_policy"
  ON public.email_templates FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "email_templates_insert_policy"
  ON public.email_templates FOR INSERT TO public
  WITH CHECK (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "email_templates_update_policy"
  ON public.email_templates FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "email_templates_delete_policy"
  ON public.email_templates FOR DELETE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

-- SMS TEMPLATES — Plantillas de SMS para campañas
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id            uuid    NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id integer NOT NULL,
  name          varchar(255) NOT NULL,
  blocks        jsonb   NOT NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  CONSTRAINT sms_templates_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

-- SMS templates usan auth.jwt() ->> 'sub' en lugar de rls.clerk_user_id
CREATE POLICY "Users can view their restaurant's templates"
  ON public.sms_templates FOR SELECT TO public
  USING (
    restaurant_id IN (
      SELECT restaurants.id FROM restaurants
      WHERE restaurants.user_id IN (
        SELECT user_admin_portal.id FROM user_admin_portal
        WHERE (user_admin_portal.clerk_user_id)::text = (auth.jwt() ->> 'sub'::text)
      )
    )
  );

CREATE POLICY "Users can create templates for their restaurant"
  ON public.sms_templates FOR INSERT TO public
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurants.id FROM restaurants
      WHERE restaurants.user_id IN (
        SELECT user_admin_portal.id FROM user_admin_portal
        WHERE (user_admin_portal.clerk_user_id)::text = (auth.jwt() ->> 'sub'::text)
      )
    )
  );

CREATE POLICY "Users can update their restaurant's templates"
  ON public.sms_templates FOR UPDATE TO public
  USING (
    restaurant_id IN (
      SELECT restaurants.id FROM restaurants
      WHERE restaurants.user_id IN (
        SELECT user_admin_portal.id FROM user_admin_portal
        WHERE (user_admin_portal.clerk_user_id)::text = (auth.jwt() ->> 'sub'::text)
      )
    )
  );

CREATE POLICY "Users can delete their restaurant's templates"
  ON public.sms_templates FOR DELETE TO public
  USING (
    restaurant_id IN (
      SELECT restaurants.id FROM restaurants
      WHERE restaurants.user_id IN (
        SELECT user_admin_portal.id FROM user_admin_portal
        WHERE (user_admin_portal.clerk_user_id)::text = (auth.jwt() ->> 'sub'::text)
      )
    )
  );
