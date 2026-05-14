-- ============================================================
-- payment_providers — Proveedores de pago disponibles
-- payment_integrations — Integraciones activas por cliente
-- payment_method_tokens — Tokens de tarjeta por método de pago
-- Última verificación: 2026-05-14
-- ============================================================

-- PAYMENT PROVIDERS
CREATE TABLE IF NOT EXISTS public.payment_providers (
  id         uuid    NOT NULL DEFAULT gen_random_uuid(),
  code       varchar NOT NULL,
  name       varchar NOT NULL,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT payment_providers_pkey PRIMARY KEY (id),
  CONSTRAINT payment_providers_code_key UNIQUE (code)
);

ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_providers_read_all"
  ON public.payment_providers FOR SELECT TO public USING (true);

-- PAYMENT INTEGRATIONS (por cliente)
CREATE TABLE IF NOT EXISTS public.payment_integrations (
  id          uuid    NOT NULL DEFAULT gen_random_uuid(),
  client_id   uuid    NOT NULL,
  provider_id uuid    NOT NULL,
  is_active   boolean DEFAULT true,
  settings    jsonb   DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  CONSTRAINT payment_integrations_pkey PRIMARY KEY (id),
  CONSTRAINT payment_integrations_client_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT payment_integrations_provider_fkey FOREIGN KEY (provider_id) REFERENCES public.payment_providers(id)
);

ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_integrations_read_all"
  ON public.payment_integrations FOR SELECT TO public USING (true);

CREATE POLICY "payment_integrations_write_authenticated"
  ON public.payment_integrations FOR ALL TO public
  USING (auth.role() = 'authenticated');

-- PAYMENT METHOD TOKENS (tokenización de tarjetas)
CREATE TABLE IF NOT EXISTS public.payment_method_tokens (
  id                   uuid    NOT NULL DEFAULT gen_random_uuid(),
  payment_method_id    uuid    NOT NULL,
  provider             varchar NOT NULL,
  provider_token       varchar NOT NULL,
  provider_customer_id varchar,
  user_type            varchar NOT NULL DEFAULT 'user',
  is_active            boolean DEFAULT true,
  created_at           timestamptz DEFAULT now(),

  CONSTRAINT payment_method_tokens_pkey PRIMARY KEY (id)
);

ALTER TABLE public.payment_method_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pmt_read_all"
  ON public.payment_method_tokens FOR SELECT TO public USING (true);
