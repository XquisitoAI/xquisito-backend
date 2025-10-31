-- ===============================================
-- MAIN PORTAL - SISTEMA DE CLIENTES Y SUCURSALES
-- Para ser usado por Super Administradores
-- ===============================================

-- 1. Tabla de clientes (restaurantes desde perspectiva del main-portal)
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,                    -- Nombre del restaurante
    owner_name VARCHAR(255) NOT NULL,              -- Nombre del dueño
    phone VARCHAR(50) NOT NULL,                    -- Teléfono de contacto
    email VARCHAR(255) NOT NULL UNIQUE,            -- Email del cliente
    services JSONB DEFAULT '[]'::jsonb,            -- Array de servicios activos
    active BOOLEAN DEFAULT true,                   -- Estado del cliente
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT clients_email_format CHECK (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'),
    CONSTRAINT clients_name_length CHECK (char_length(name) >= 2),
    CONSTRAINT clients_owner_name_length CHECK (char_length(owner_name) >= 2)
);

-- 2. Tabla de sucursales (branches de cada cliente)
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,                      -- FK hacia clients
    name VARCHAR(255) NOT NULL,                   -- Nombre de la sucursal
    address TEXT NOT NULL,                        -- Dirección completa
    tables INTEGER NOT NULL DEFAULT 1,            -- Número de mesas
    active BOOLEAN DEFAULT true,                  -- Estado de la sucursal
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Foreign Keys
    CONSTRAINT fk_branches_client
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT branches_name_length CHECK (char_length(name) >= 2),
    CONSTRAINT branches_address_length CHECK (char_length(address) >= 10),
    CONSTRAINT branches_tables_positive CHECK (tables > 0 AND tables <= 1000)
);

-- 3. Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);

CREATE INDEX IF NOT EXISTS idx_branches_client_id ON branches(client_id);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(active);
CREATE INDEX IF NOT EXISTS idx_branches_created_at ON branches(created_at);

-- 4. Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 5. Triggers para updated_at
DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_branches_updated_at ON branches;
CREATE TRIGGER update_branches_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Función para obtener estadísticas de cliente
CREATE OR REPLACE FUNCTION get_client_stats(client_uuid UUID)
RETURNS TABLE (
    total_branches INTEGER,
    active_branches INTEGER,
    total_tables INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_branches,
        COUNT(CASE WHEN active THEN 1 END)::INTEGER as active_branches,
        COALESCE(SUM(tables), 0)::INTEGER as total_tables
    FROM branches
    WHERE client_id = client_uuid;
END;
$$ LANGUAGE plpgsql;

-- 7. RLS (Row Level Security) - Preparado para futuras implementaciones
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Política temporal que permite todo (ajustar según necesidades de autenticación)
DROP POLICY IF EXISTS "Allow all operations on clients" ON clients;
CREATE POLICY "Allow all operations on clients" ON clients
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on branches" ON branches;
CREATE POLICY "Allow all operations on branches" ON branches
    FOR ALL USING (true) WITH CHECK (true);

-- 8. Datos de ejemplo para desarrollo (COMENTADO - tablas limpias)
-- INSERT INTO clients (name, owner_name, phone, email, services, active) VALUES
--     ('Restaurante El Dorado', 'Carlos Mendoza', '+52 55 1234 5678', 'carlos.mendoza@eldorado.com',
--      '["tap-order-pay", "flex-bill", "tap-pay"]'::jsonb, true),
--     ('La Trattoria Italiana', 'Giuseppe Romano', '+52 55 9876 5432', 'giuseppe@trattoria.com',
--      '["flex-bill", "food-hall"]'::jsonb, true),
--     ('Sushi Express', 'Hiroshi Tanaka', '+52 55 5555 1234', 'tanaka@sushiexpress.com',
--      '["pick-n-go", "tap-pay"]'::jsonb, true)
-- ON CONFLICT (email) DO NOTHING;

-- Obtener IDs de clientes para las sucursales (COMENTADO)
-- DO $$
-- DECLARE
--     eldorado_id UUID;
--     trattoria_id UUID;
--     sushi_id UUID;
-- BEGIN
--     SELECT id INTO eldorado_id FROM clients WHERE email = 'carlos.mendoza@eldorado.com';
--     SELECT id INTO trattoria_id FROM clients WHERE email = 'giuseppe@trattoria.com';
--     SELECT id INTO sushi_id FROM clients WHERE email = 'tanaka@sushiexpress.com';

--     INSERT INTO branches (client_id, name, address, tables, active) VALUES
--         (eldorado_id, 'Sucursal Centro', 'Av. Reforma 123, Centro, Ciudad de México', 25, true),
--         (eldorado_id, 'Sucursal Norte', 'Blvd. Norte 456, Zona Industrial, Ciudad de México', 18, true),
--         (trattoria_id, 'Sucursal Principal', 'Calle Italia 789, Polanco, Ciudad de México', 30, true),
--         (sushi_id, 'Sucursal Plaza', 'Plaza Comercial 234, Reforma, Ciudad de México', 15, true)
--     ON CONFLICT DO NOTHING;
-- END $$;

-- 9. Comentarios para documentación
COMMENT ON TABLE clients IS 'Clientes (restaurantes) gestionados desde el main-portal por super administradores';
COMMENT ON TABLE branches IS 'Sucursales de cada cliente, con información específica de ubicación y capacidad';

COMMENT ON COLUMN clients.services IS 'Array JSON de servicios activos: tap-order-pay, flex-bill, food-hall, tap-pay, pick-n-go';
COMMENT ON COLUMN branches.tables IS 'Número de mesas disponibles en la sucursal (1-1000)';

-- ===============================================
-- VERIFICACIÓN DE INSTALACIÓN
-- ===============================================

-- Verificar que las tablas fueron creadas correctamente
DO $$
BEGIN
    -- Verificar clients
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'clients') THEN
        RAISE NOTICE '✅ Tabla clients creada correctamente';
    ELSE
        RAISE EXCEPTION '❌ Error: Tabla clients no fue creada';
    END IF;

    -- Verificar branches
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'branches') THEN
        RAISE NOTICE '✅ Tabla branches creada correctamente';
    ELSE
        RAISE EXCEPTION '❌ Error: Tabla branches no fue creada';
    END IF;

    -- Verificar que las tablas estén listas para usar
    RAISE NOTICE '✅ Tablas creadas correctamente - Listas para insertar datos';
    RAISE NOTICE 'ℹ️  Clientes actuales: %', (SELECT COUNT(*) FROM clients);
    RAISE NOTICE 'ℹ️  Sucursales actuales: %', (SELECT COUNT(*) FROM branches);

    RAISE NOTICE '🎉 Main Portal database setup completed successfully!';
END $$;