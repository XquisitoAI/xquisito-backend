-- ============================================================
-- rooms — Habitaciones de hotel por sucursal (Room Service)
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rooms (
  id          uuid    NOT NULL DEFAULT gen_random_uuid(),
  room_number integer NOT NULL,
  restaurant_id integer NOT NULL,
  branch_id   uuid    NOT NULL,
  status      varchar DEFAULT 'available',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT fk_rooms_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id),
  CONSTRAINT fk_rooms_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT unique_branch_room UNIQUE (branch_id, room_number)
);

-- TRIGGER
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_rooms_branch_id ON public.rooms (branch_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms (status);

-- RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on rooms"
  ON public.rooms FOR ALL TO public USING (true) WITH CHECK (true);
