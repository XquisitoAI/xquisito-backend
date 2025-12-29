-- ====================================================
-- Tabla de Habitaciones (Rooms) para Room Service
-- Similar a tables pero para servicios de hotelería
-- ====================================================

CREATE TABLE IF NOT EXISTS public.rooms (
  -- Identificador único
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Número de habitación (único por sucursal)
  room_number INTEGER NOT NULL,

  -- Relación con restaurante/cliente
  restaurant_id INTEGER NOT NULL,

  -- Relación con sucursal
  branch_id UUID NOT NULL,

  -- Estado de la habitación
  status VARCHAR(20) DEFAULT 'available',
  -- Estados: available, occupied, reserved, maintenance

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- =============================================
  -- CONSTRAINTS
  -- =============================================

  -- FK a branches
  CONSTRAINT fk_rooms_branch FOREIGN KEY (branch_id)
    REFERENCES public.branches(id) ON DELETE CASCADE,

  -- FK a restaurants (tabla principal de restaurantes)
  CONSTRAINT fk_rooms_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id) ON DELETE CASCADE,

  -- Única habitación por número y sucursal
  -- Esto permite que cada sucursal tenga su propia habitación 101, 102, etc.
  CONSTRAINT unique_branch_room UNIQUE (branch_id, room_number),

  -- Validar estados permitidos
  CONSTRAINT chk_room_status CHECK (
    status IN ('available', 'occupied', 'reserved', 'maintenance')
  )
);

-- =============================================
-- ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índice por branch_id
CREATE INDEX IF NOT EXISTS idx_rooms_branch_id
ON public.rooms(branch_id);

-- Índice por restaurant_id
CREATE INDEX IF NOT EXISTS idx_rooms_restaurant_id
ON public.rooms(restaurant_id);

-- Índice por status
CREATE INDEX IF NOT EXISTS idx_rooms_status
ON public.rooms(status);

-- Índice compuesto para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_rooms_restaurant_room_number
ON public.rooms(restaurant_id, room_number);

-- =============================================
-- TRIGGER PARA ACTUALIZAR updated_at
-- =============================================

-- Crear función si no existe
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Política permisiva para desarrollo (ajustar en producción)
CREATE POLICY "Allow all operations on rooms" ON public.rooms
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =============================================

COMMENT ON TABLE public.rooms IS
'Tabla de habitaciones para el servicio Room Service (hotelería)';

COMMENT ON COLUMN public.rooms.room_number IS
'Número de habitación único por sucursal';

COMMENT ON COLUMN public.rooms.status IS
'Estado: available (disponible), occupied (ocupada), reserved (reservada), maintenance (mantenimiento)';

COMMENT ON COLUMN public.rooms.branch_id IS
'Sucursal a la que pertenece la habitación';

COMMENT ON COLUMN public.rooms.restaurant_id IS
'Restaurante propietario de la habitación';
