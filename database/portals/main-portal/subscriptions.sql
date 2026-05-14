-- ============================================================
-- Main Portal — Configuración de planes
-- Portal: Superadmin Xquisito (límites globales por plan)
-- Nota: subscriptions, plan_usage y subscription_transactions
--       están en portals/admin-portal/subscriptions.sql
-- Última verificación: 2026-05-14
-- ============================================================

-- PLAN CONFIGURATIONS — Límites globales por tipo de plan (solo service_role puede modificar)
CREATE TABLE IF NOT EXISTS public.plan_configurations (
  id            serial      NOT NULL,
  plan_type     varchar(20) NOT NULL,
  feature_name  varchar(50) NOT NULL,
  feature_limit integer     NOT NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  CONSTRAINT plan_configurations_pkey PRIMARY KEY (id)
);

-- RLS — lectura pública, escritura solo service_role
ALTER TABLE public.plan_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to plan_configurations"
  ON public.plan_configurations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "plan_configurations_select_policy"
  ON public.plan_configurations FOR SELECT TO public USING (true);

CREATE POLICY "plan_configurations_insert_policy"
  ON public.plan_configurations FOR INSERT TO public WITH CHECK (false);

CREATE POLICY "plan_configurations_update_policy"
  ON public.plan_configurations FOR UPDATE TO public USING (false);

CREATE POLICY "plan_configurations_delete_policy"
  ON public.plan_configurations FOR DELETE TO public USING (false);
