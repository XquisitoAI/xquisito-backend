-- ============================================================
-- profiles — Perfil extendido de usuarios Supabase Auth
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid        NOT NULL,
  email       text,
  phone       text,
  first_name  text,
  last_name   text,
  birth_date  date,
  gender      public.gender_type,
  photo_url   text,
  account_type public.account_type NOT NULL DEFAULT 'customer',
  user_context text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- TRIGGER
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON public.profiles (account_type);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
