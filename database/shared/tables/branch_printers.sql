-- ============================================================
-- branch_printers — Impresoras configuradas por sucursal
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.branch_printers (
  id              uuid    NOT NULL DEFAULT gen_random_uuid(),
  branch_id       uuid    NOT NULL,
  name            varchar,
  role            varchar,
  connection_type text    NOT NULL DEFAULT 'wifi',
  ip              varchar,
  port            integer DEFAULT 9100,
  usb_device_name text,
  is_active       boolean DEFAULT true,
  last_seen_at    timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  CONSTRAINT branch_printers_pkey PRIMARY KEY (id),
  CONSTRAINT branch_printers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT branch_printers_branch_id_ip_key UNIQUE (branch_id, ip)
);

-- TRIGGER
CREATE TRIGGER trigger_branch_printers_updated_at
  BEFORE UPDATE ON public.branch_printers
  FOR EACH ROW EXECUTE FUNCTION public.update_branch_printers_updated_at();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_branch_printers_branch ON public.branch_printers (branch_id);

-- RLS (acceso vía service_role desde el backend)
ALTER TABLE public.branch_printers ENABLE ROW LEVEL SECURITY;
