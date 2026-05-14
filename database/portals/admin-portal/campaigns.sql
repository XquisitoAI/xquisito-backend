-- ============================================================
-- Admin Portal — Campañas de marketing
-- Portal: Por restaurante (segmentos, campañas, envíos)
-- Última verificación: 2026-05-14
-- ============================================================

-- CUSTOMER SEGMENTS — Segmentos de clientes con filtros dinámicos
CREATE TABLE IF NOT EXISTS public.customer_segments (
  id                   uuid    NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id        integer,
  segment_name         varchar(255) NOT NULL,
  filters              jsonb   NOT NULL DEFAULT '{}'::jsonb,
  active_filters_count integer DEFAULT 0,
  estimated_customers  integer DEFAULT 0,
  created_at           timestamp DEFAULT now(),
  updated_at           timestamp DEFAULT now(),

  CONSTRAINT customer_segments_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to customer_segments"
  ON public.customer_segments FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "customer_segments_select_policy"
  ON public.customer_segments FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "customer_segments_insert_policy"
  ON public.customer_segments FOR INSERT TO public
  WITH CHECK (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "customer_segments_update_policy"
  ON public.customer_segments FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "customer_segments_delete_policy"
  ON public.customer_segments FOR DELETE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

-- CAMPAIGNS — Campañas de marketing por restaurante
CREATE TABLE IF NOT EXISTS public.campaigns (
  id               uuid    NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id    integer NOT NULL,
  name             varchar(255) NOT NULL,
  description      text,
  segment_id       uuid    NOT NULL,
  reward_type      campaign_reward_type NOT NULL DEFAULT 'discount_percentage',
  reward_value     numeric,
  reward_code      varchar(50),
  reward_description text,
  points_required  integer DEFAULT 0,
  points_awarded   integer DEFAULT 0,
  start_date       timestamptz NOT NULL,
  end_date         timestamptz NOT NULL,
  status           campaign_status NOT NULL DEFAULT 'draft',
  delivery_methods text[]  NOT NULL DEFAULT '{email}'::text[],
  auto_send        boolean DEFAULT false,
  send_immediately boolean DEFAULT false,
  total_targeted   integer DEFAULT 0,
  total_sent       integer DEFAULT 0,
  total_delivered  integer DEFAULT 0,
  total_opened     integer DEFAULT 0,
  total_clicked    integer DEFAULT 0,
  total_redeemed   integer DEFAULT 0,
  budget_limit     numeric,
  current_spend    numeric DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  created_by       text,
  first_sent_at    timestamptz,

  CONSTRAINT campaigns_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to campaigns"
  ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "campaigns_select_policy"
  ON public.campaigns FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "campaigns_insert_policy"
  ON public.campaigns FOR INSERT TO public
  WITH CHECK (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "campaigns_update_policy"
  ON public.campaigns FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "campaigns_delete_policy"
  ON public.campaigns FOR DELETE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

-- CAMPAIGN TEMPLATES — Plantillas asignadas a una campaña
CREATE TABLE IF NOT EXISTS public.campaign_templates (
  id                     uuid    NOT NULL DEFAULT gen_random_uuid(),
  campaign_id            uuid    NOT NULL,
  is_primary             boolean DEFAULT false,
  custom_variables       jsonb   DEFAULT '{}'::jsonb,
  created_at             timestamptz DEFAULT now(),
  template_whatsapp_id   varchar(255),
  template_id            uuid,

  CONSTRAINT campaign_templates_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to campaign_templates"
  ON public.campaign_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "campaign_templates_all_policy"
  ON public.campaign_templates FOR ALL TO public USING (true) WITH CHECK (true);

-- CAMPAIGN SENDS — Registro de envíos individuales por campaña y usuario
CREATE TABLE IF NOT EXISTS public.campaign_sends (
  id                       uuid    NOT NULL DEFAULT gen_random_uuid(),
  campaign_id              uuid    NOT NULL,
  user_id                  text    NOT NULL,
  delivery_method          varchar(20) NOT NULL,
  template_id              uuid,
  recipient_email          varchar(255),
  recipient_phone          varchar(50),
  message_content          text,
  status                   send_status NOT NULL DEFAULT 'pending',
  sent_at                  timestamptz,
  delivered_at             timestamptz,
  opened_at                timestamptz,
  clicked_at               timestamptz,
  redeemed_at              timestamptz,
  failed_at                timestamptz,
  error_message            text,
  retry_count              integer DEFAULT 0,
  device_info              jsonb   DEFAULT '{}'::jsonb,
  click_data               jsonb   DEFAULT '{}'::jsonb,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  template_whatsapp_id     varchar(255) DEFAULT NULL,
  message_content_whatsapp text,

  CONSTRAINT campaign_sends_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to campaign_sends"
  ON public.campaign_sends FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "campaign_sends_all_policy"
  ON public.campaign_sends FOR ALL TO public USING (true) WITH CHECK (true);
