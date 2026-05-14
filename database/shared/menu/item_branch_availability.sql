-- ============================================================
-- item_branch_availability — Disponibilidad de items por sucursal
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.item_branch_availability (
  id           serial  NOT NULL,
  item_id      integer NOT NULL,
  branch_id    uuid    NOT NULL,
  is_available boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),

  CONSTRAINT item_branch_availability_pkey PRIMARY KEY (id),
  CONSTRAINT iba_item_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE,
  CONSTRAINT iba_branch_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE,
  CONSTRAINT iba_item_branch_unique UNIQUE (item_id, branch_id)
);

-- TRIGGER
CREATE TRIGGER trigger_update_item_branch_availability_updated_at
  BEFORE UPDATE ON public.item_branch_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_iba_branch ON public.item_branch_availability (branch_id);
CREATE INDEX IF NOT EXISTS idx_iba_item ON public.item_branch_availability (item_id);

-- RLS
ALTER TABLE public.item_branch_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on item_branch_availability"
  ON public.item_branch_availability FOR ALL TO public USING (true) WITH CHECK (true);
