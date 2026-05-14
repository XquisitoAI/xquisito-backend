-- ============================================================
-- Admin Portal — Suscripciones por restaurante
-- Portal: Por restaurante (plan activo, uso y transacciones de pago)
-- Última verificación: 2026-05-14
-- ============================================================

-- SUBSCRIPTIONS — Suscripción activa de un restaurante a un plan
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       serial       NOT NULL,
  restaurant_id            integer      NOT NULL,
  plan_type                varchar(20)  NOT NULL,
  status                   varchar(20)  NOT NULL DEFAULT 'active',
  ecartpay_customer_id     varchar(255),
  ecartpay_subscription_id varchar(255),
  start_date               timestamptz  NOT NULL DEFAULT now(),
  end_date                 timestamptz,
  auto_renew               boolean      DEFAULT true,
  price_paid               numeric,
  currency                 varchar(3)   DEFAULT 'MXN',
  created_at               timestamptz  DEFAULT now(),
  updated_at               timestamptz  DEFAULT now(),
  renewal_attempts         integer      DEFAULT 0,
  last_renewal_attempt     timestamptz,
  scheduled_plan_change    varchar(50),
  renewal_reminder_sent    boolean      DEFAULT false,
  next_billing_date        timestamptz,

  CONSTRAINT subscriptions_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to subscriptions"
  ON public.subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "subscriptions_insert_policy"
  ON public.subscriptions FOR INSERT TO public
  WITH CHECK (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "subscriptions_select_policy"
  ON public.subscriptions FOR SELECT TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "subscriptions_update_policy"
  ON public.subscriptions FOR UPDATE TO public
  USING (
    (restaurant_id IN (SELECT r.id FROM public.restaurants r JOIN public.user_admin_portal u ON r.user_id = u.id WHERE (u.clerk_user_id)::text = (current_setting('rls.clerk_user_id', true))::text))
    OR current_setting('rls.clerk_user_id', true) IS NULL
  );

CREATE POLICY "subscriptions_delete_policy"
  ON public.subscriptions FOR DELETE TO public USING (false);

-- PLAN USAGE — Contador de uso de features por período de suscripción
CREATE TABLE IF NOT EXISTS public.plan_usage (
  id              serial      NOT NULL,
  subscription_id integer     NOT NULL,
  feature_type    varchar(50) NOT NULL,
  usage_count     integer     NOT NULL DEFAULT 0,
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  CONSTRAINT plan_usage_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.plan_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to plan_usage"
  ON public.plan_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "plan_usage_select_policy"
  ON public.plan_usage FOR SELECT TO public
  USING ((current_setting('rls.clerk_user_id', true) IS NOT NULL) OR (auth.uid() IS NOT NULL));

CREATE POLICY "plan_usage_insert_policy"
  ON public.plan_usage FOR INSERT TO public WITH CHECK (false);

CREATE POLICY "plan_usage_update_policy"
  ON public.plan_usage FOR UPDATE TO public USING (false);

CREATE POLICY "plan_usage_delete_policy"
  ON public.plan_usage FOR DELETE TO public USING (false);

-- SUBSCRIPTION TRANSACTIONS — Historial de pagos de suscripción
CREATE TABLE IF NOT EXISTS public.subscription_transactions (
  id                  serial      NOT NULL,
  subscription_id     integer     NOT NULL,
  ecartpay_payment_id varchar(255),
  transaction_type    varchar(20) NOT NULL,
  amount              numeric     NOT NULL,
  currency            varchar(3)  DEFAULT 'MXN',
  status              varchar(20) NOT NULL,
  transaction_date    timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  CONSTRAINT subscription_transactions_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.subscription_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to subscription_transactions"
  ON public.subscription_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "subscription_transactions_select_policy"
  ON public.subscription_transactions FOR SELECT TO public
  USING ((current_setting('rls.clerk_user_id', true) IS NOT NULL) OR (auth.uid() IS NOT NULL));

CREATE POLICY "subscription_transactions_insert_policy"
  ON public.subscription_transactions FOR INSERT TO public WITH CHECK (false);

CREATE POLICY "subscription_transactions_update_policy"
  ON public.subscription_transactions FOR UPDATE TO public USING (false);

CREATE POLICY "subscription_transactions_delete_policy"
  ON public.subscription_transactions FOR DELETE TO public USING (false);
