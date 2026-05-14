-- ============================================================
-- tables — Mesas físicas de cada sucursal
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tables (
  id           uuid    NOT NULL DEFAULT gen_random_uuid(),
  table_number integer NOT NULL,
  restaurant_id integer,
  branch_id    uuid,
  status       varchar DEFAULT 'available',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),

  CONSTRAINT tables_pkey PRIMARY KEY (id),
  CONSTRAINT fk_tables_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id),
  CONSTRAINT fk_tables_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT tables_branch_table_unique UNIQUE (branch_id, table_number)
);

-- TRIGGER
CREATE TRIGGER trigger_update_tables_updated_at
  BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tables_branch_id ON public.tables (branch_id);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON public.tables (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON public.tables (status);

-- RLS
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on tables"
  ON public.tables FOR ALL TO public USING (true);
