-- ============================================================
-- Main Portal — Tablas auxiliares
-- Portal: Superadmin Even
-- Última verificación: 2026-05-14
-- ============================================================

-- WAITLIST — Lista de espera para acceso anticipado
CREATE TABLE IF NOT EXISTS public.waitlist (
  id         bigserial    NOT NULL,
  email      varchar(255) NOT NULL,
  created_at timestamptz  DEFAULT now(),

  CONSTRAINT waitlist_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for authenticated users"
  ON public.waitlist FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Enable read for authenticated users"
  ON public.waitlist FOR SELECT TO public
  USING (auth.role() = 'authenticated'::text);

-- PCI AUDIT LOGS — Auditoría de eventos relacionados con PCI-DSS
-- INSERT-only para cualquier rol; SELECT bloqueado (solo service_role via MCP/backend directo)
CREATE TABLE IF NOT EXISTS public.pci_audit_logs (
  id          uuid    NOT NULL DEFAULT gen_random_uuid(),
  timestamp   timestamptz NOT NULL DEFAULT now(),
  user_id     text    DEFAULT 'anonymous',
  event_type  text    NOT NULL,
  resource    text    NOT NULL,
  result      text    NOT NULL,
  source_ip   text,
  service     text    DEFAULT 'even-backend',
  metadata    jsonb,

  CONSTRAINT pci_audit_logs_pkey PRIMARY KEY (id)
);

-- RLS — INSERT abierto para registrar eventos; SELECT cerrado (seguridad PCI)
ALTER TABLE public.pci_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_only"
  ON public.pci_audit_logs FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "service_role_select"
  ON public.pci_audit_logs FOR SELECT TO public USING (false);
