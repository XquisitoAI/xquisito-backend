-- ============================================================
-- branches — Sucursales de un restaurante
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.branches (
  id                    uuid      NOT NULL DEFAULT gen_random_uuid(),
  client_id             uuid      NOT NULL,
  restaurant_id         integer   NOT NULL,
  branch_number         integer   NOT NULL,
  name                  varchar   NOT NULL,
  address               text      NOT NULL,
  tables                integer   NOT NULL DEFAULT 1,
  rooms                 integer   DEFAULT 0,
  room_ranges           jsonb     DEFAULT '[]'::jsonb,
  opening_hours         jsonb,
  active                boolean   DEFAULT true,
  deleted               boolean   DEFAULT false,
  master_crew_device_id text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),

  CONSTRAINT branches_pkey PRIMARY KEY (id),
  CONSTRAINT fk_branches_client FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT fk_branches_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id),
  CONSTRAINT branches_client_branch_number_unique UNIQUE (client_id, branch_number),
  CONSTRAINT branches_restaurant_branch_unique UNIQUE (restaurant_id, branch_number)
);

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.set_branch_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Asigna branch_number incremental por client_id
  IF NEW.branch_number IS NULL THEN
    SELECT COALESCE(MAX(branch_number), 0) + 1
    INTO NEW.branch_number
    FROM public.branches
    WHERE client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_branch_number
  BEFORE INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_branch_number();

CREATE TRIGGER trigger_auto_calculate_rooms
  BEFORE INSERT OR UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.auto_calculate_rooms();

CREATE TRIGGER trigger_auto_create_tables
  AFTER INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_tables_on_branch_insert();

CREATE TRIGGER trigger_auto_update_tables
  AFTER UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.auto_update_tables_on_branch_update();

CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_branches_client_id ON public.branches (client_id);
CREATE INDEX IF NOT EXISTS idx_branches_restaurant_id ON public.branches (restaurant_id);

-- RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on branches"
  ON public.branches FOR ALL TO public USING (true) WITH CHECK (true);
