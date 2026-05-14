-- ============================================================
-- ENUMs — Tipos enumerados del esquema público
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TYPE public.account_type AS ENUM (
  'customer',
  'admin',
  'main'
);

CREATE TYPE public.gender_type AS ENUM (
  'male',
  'female',
  'other'
);

CREATE TYPE public.campaign_status AS ENUM (
  'draft',
  'scheduled',
  'running',
  'paused',
  'completed',
  'cancelled'
);

CREATE TYPE public.campaign_reward_type AS ENUM (
  'discount_percentage',
  'discount_fixed',
  'free_item',
  'points',
  'buy_one_get_one'
);

CREATE TYPE public.send_status AS ENUM (
  'pending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'redeemed',
  'failed',
  'bounced'
);

CREATE TYPE public.template_type AS ENUM (
  'sms',
  'email',
  'whatsapp',
  'push'
);
