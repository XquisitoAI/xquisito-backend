-- ============================================================
-- kitchen_push_subscriptions — Tokens push para notificaciones de cocina
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kitchen_push_subscriptions (
  id            uuid    NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id integer NOT NULL,
  platform      varchar NOT NULL,
  token         text    NOT NULL,
  created_at    timestamptz DEFAULT now(),

  CONSTRAINT kitchen_push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT kitchen_push_subscriptions_token_key UNIQUE (token)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_kitchen_push_restaurant ON public.kitchen_push_subscriptions (restaurant_id);

-- RLS (acceso libre: el backend registra tokens desde dispositivos de cocina)
ALTER TABLE public.kitchen_push_subscriptions ENABLE ROW LEVEL SECURITY;
