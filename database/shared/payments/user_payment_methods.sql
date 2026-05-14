-- ============================================================
-- user_payment_methods — Tarjetas guardadas de usuarios registrados
-- guest_payment_methods — Tarjetas temporales de invitados (expiran en 24h)
-- Última verificación: 2026-05-14
-- ============================================================

-- USER PAYMENT METHODS
CREATE TABLE IF NOT EXISTS public.user_payment_methods (
  id                  uuid    NOT NULL DEFAULT gen_random_uuid(),
  user_id             uuid,
  last_four_digits    varchar NOT NULL,
  card_type           varchar NOT NULL,
  card_brand          varchar,
  expiry_month        integer NOT NULL,
  expiry_year         integer NOT NULL,
  cardholder_name     varchar,
  billing_country     varchar,
  billing_postal_code varchar,
  is_active           boolean DEFAULT true,
  is_default          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  CONSTRAINT user_payment_methods_pkey PRIMARY KEY (id),
  CONSTRAINT user_payment_methods_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TRIGGER ensure_single_default_payment_method_trigger
  BEFORE INSERT OR UPDATE ON public.user_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_payment_method();

CREATE TRIGGER ensure_single_default_user_payment_method_trigger
  BEFORE INSERT OR UPDATE ON public.user_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_user_payment_method();

CREATE TRIGGER update_user_payment_methods_updated_at
  BEFORE UPDATE ON public.user_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_upm_user ON public.user_payment_methods (user_id);

ALTER TABLE public.user_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
  ON public.user_payment_methods FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_users_own_records"
  ON public.user_payment_methods FOR ALL TO public
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "anon_backend_operations"
  ON public.user_payment_methods FOR ALL TO anon USING (true) WITH CHECK (true);

-- GUEST PAYMENT METHODS
CREATE TABLE IF NOT EXISTS public.guest_payment_methods (
  id                  uuid    NOT NULL DEFAULT gen_random_uuid(),
  guest_id            varchar NOT NULL,
  last_four_digits    varchar NOT NULL,
  card_type           varchar NOT NULL,
  card_brand          varchar,
  expiry_month        integer NOT NULL,
  expiry_year         integer NOT NULL,
  cardholder_name     varchar,
  billing_country     varchar,
  billing_postal_code varchar,
  table_number        varchar,
  session_data        jsonb   DEFAULT '{}'::jsonb,
  is_active           boolean DEFAULT true,
  is_default          boolean DEFAULT false,
  expires_at          timestamptz DEFAULT (now() + interval '24 hours'),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  CONSTRAINT guest_payment_methods_pkey PRIMARY KEY (id)
);

CREATE TRIGGER ensure_single_default_guest_payment_method_trigger
  BEFORE INSERT OR UPDATE ON public.guest_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_guest_payment_method();

CREATE TRIGGER update_guest_payment_methods_updated_at
  BEFORE UPDATE ON public.guest_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_guest_payment_methods_updated_at();

CREATE INDEX IF NOT EXISTS idx_gpm_guest ON public.guest_payment_methods (guest_id);

ALTER TABLE public.guest_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to guest_payment_methods"
  ON public.guest_payment_methods FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "guest_payment_methods_all_policy"
  ON public.guest_payment_methods FOR ALL TO public USING (true) WITH CHECK (true);
