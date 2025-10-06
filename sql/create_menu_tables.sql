-- ===============================================
-- SISTEMA DE MENÚ PARA ADMIN PORTAL
-- ===============================================

-- Tabla de secciones del menú
CREATE TABLE IF NOT EXISTS menu_sections (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de platillos del menú
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    discount INTEGER DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
    custom_fields JSONB DEFAULT '[]'::jsonb,
    is_available BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (section_id) REFERENCES menu_sections(id) ON DELETE CASCADE
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_menu_sections_display_order ON menu_sections(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_sections_is_active ON menu_sections(is_active);
CREATE INDEX IF NOT EXISTS idx_menu_items_section_id ON menu_items(section_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON menu_items(is_available);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON menu_items(display_order);

-- Función para actualizar el campo updated_at automáticamente
CREATE OR REPLACE FUNCTION update_menu_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at
CREATE TRIGGER trigger_update_menu_sections_updated_at
    BEFORE UPDATE ON menu_sections
    FOR EACH ROW EXECUTE FUNCTION update_menu_updated_at_column();

CREATE TRIGGER trigger_update_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION update_menu_updated_at_column();

-- ===============================================
-- FUNCIONES ÚTILES PARA EL SISTEMA DE MENÚ
-- ===============================================

-- Función para reordenar secciones
CREATE OR REPLACE FUNCTION reorder_menu_sections(section_orders JSONB)
RETURNS BOOLEAN AS $$
DECLARE
    section_data RECORD;
BEGIN
    -- section_orders debe ser un array de objetos: [{"id": 1, "display_order": 0}, {"id": 2, "display_order": 1}]
    FOR section_data IN
        SELECT
            (value->>'id')::INTEGER as section_id,
            (value->>'display_order')::INTEGER as new_order
        FROM jsonb_array_elements(section_orders)
    LOOP
        UPDATE menu_sections
        SET display_order = section_data.new_order
        WHERE id = section_data.section_id;
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener menú completo con secciones y platillos
CREATE OR REPLACE FUNCTION get_complete_menu()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', ms.id,
            'name', ms.name,
            'is_active', ms.is_active,
            'display_order', ms.display_order,
            'created_at', ms.created_at,
            'items', COALESCE(items.items, '[]'::jsonb)
        ) ORDER BY ms.display_order, ms.id
    ) INTO result
    FROM menu_sections ms
    LEFT JOIN (
        SELECT
            section_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', mi.id,
                    'name', mi.name,
                    'description', mi.description,
                    'image_url', mi.image_url,
                    'price', mi.price,
                    'discount', mi.discount,
                    'custom_fields', mi.custom_fields,
                    'is_available', mi.is_available,
                    'display_order', mi.display_order,
                    'created_at', mi.created_at
                ) ORDER BY mi.display_order, mi.id
            ) as items
        FROM menu_items mi
        WHERE mi.is_available = true
        GROUP BY section_id
    ) items ON ms.id = items.section_id
    WHERE ms.is_active = true;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Habilitar Row Level Security (opcional pero recomendado)
ALTER TABLE menu_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad básicas (permitir todo por ahora, ajustar según necesidades)
CREATE POLICY "Allow all operations on menu_sections" ON menu_sections FOR ALL USING (true);
CREATE POLICY "Allow all operations on menu_items" ON menu_items FOR ALL USING (true);