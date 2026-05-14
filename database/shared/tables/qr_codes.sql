-- ============================================================
-- qr_codes — Códigos QR por mesa, habitación o sucursal
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.qr_codes (
  id            uuid    NOT NULL DEFAULT gen_random_uuid(),
  code          varchar NOT NULL,
  client_id     uuid    NOT NULL,
  restaurant_id integer NOT NULL,
  branch_id     uuid    NOT NULL,
  branch_number integer NOT NULL,
  service       varchar NOT NULL,
  qr_type       varchar NOT NULL,
  table_number  integer,
  room_number   integer,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  CONSTRAINT qr_codes_pkey PRIMARY KEY (id),
  CONSTRAINT qr_codes_code_key UNIQUE (code),
  CONSTRAINT qr_codes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT qr_codes_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id),
  CONSTRAINT qr_codes_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT fk_qr_codes_branch_composite FOREIGN KEY (restaurant_id, branch_number) REFERENCES public.branches(restaurant_id, branch_number),
  CONSTRAINT qr_codes_service_check CHECK (
    (service)::text = ANY (ARRAY['flex_bill', 'pick_and_go', 'tap_order_and_pay', 'room_service', 'tap_and_pay']::text[])
  )
);

-- TRIGGER
CREATE TRIGGER trigger_update_qr_codes_updated_at
  BEFORE UPDATE ON public.qr_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_qr_codes_updated_at();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_qr_codes_code ON public.qr_codes (code);
CREATE INDEX IF NOT EXISTS idx_qr_codes_branch ON public.qr_codes (branch_id, service);
CREATE INDEX IF NOT EXISTS idx_qr_codes_active ON public.qr_codes (is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados (admin portal) pueden hacer todo
CREATE POLICY "Allow all operations for authenticated users"
  ON public.qr_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Lectura pública solo para QR activos (clientes escaneando)
CREATE POLICY "Allow public read for active QR codes"
  ON public.qr_codes FOR SELECT TO anon USING (is_active = true);
