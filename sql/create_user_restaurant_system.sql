-- ===============================================
-- SISTEMA DE USUARIOS Y RESTAURANTES
-- ===============================================

-- 1. Tabla de usuarios del admin portal
CREATE TABLE IF NOT EXISTS user_admin_portal (
    id SERIAL PRIMARY KEY,
    clerk_user_id VARCHAR(50) NOT NULL UNIQUE, -- ID de Clerk
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de restaurantes (pertenece a un usuario)
CREATE TABLE IF NOT EXISTS restaurants (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL, -- FK a user_admin_portal
    name VARCHAR(100) NOT NULL,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES user_admin_portal(id) ON DELETE CASCADE
);

-- 3. Actualizar menu_sections para que pertenezca a un restaurante
DO $$
BEGIN
    -- Agregar restaurant_id a menu_sections si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'menu_sections'
        AND column_name = 'restaurant_id'
    ) THEN
        ALTER TABLE menu_sections
        ADD COLUMN restaurant_id INTEGER,
        ADD CONSTRAINT fk_menu_sections_restaurant
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. menu_items ya está bien (pertenece a menu_sections)
-- No necesita cambios, ya tiene section_id como FK

-- ===============================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ===============================================

CREATE INDEX IF NOT EXISTS idx_user_admin_portal_clerk_id ON user_admin_portal(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_admin_portal_email ON user_admin_portal(email);
CREATE INDEX IF NOT EXISTS idx_user_admin_portal_is_active ON user_admin_portal(is_active);

CREATE INDEX IF NOT EXISTS idx_restaurants_user_id ON restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_is_active ON restaurants(is_active);

CREATE INDEX IF NOT EXISTS idx_menu_sections_restaurant_id ON menu_sections(restaurant_id);

-- ===============================================
-- TRIGGERS PARA UPDATED_AT
-- ===============================================

-- Trigger para user_admin_portal
CREATE TRIGGER trigger_update_user_admin_portal_updated_at
    BEFORE UPDATE ON user_admin_portal
    FOR EACH ROW EXECUTE FUNCTION update_menu_updated_at_column();

-- Trigger para restaurants
CREATE TRIGGER trigger_update_restaurants_updated_at
    BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_menu_updated_at_column();

-- ===============================================
-- FUNCIONES ÚTILES
-- ===============================================

-- Función para crear usuario con restaurante por defecto
CREATE OR REPLACE FUNCTION create_user_with_default_restaurant(
    p_clerk_user_id VARCHAR(50),
    p_email VARCHAR(255),
    p_first_name VARCHAR(100) DEFAULT NULL,
    p_last_name VARCHAR(100) DEFAULT NULL,
    p_restaurant_name VARCHAR(100) DEFAULT 'Mi Restaurante'
)
RETURNS JSONB AS $$
DECLARE
    new_user user_admin_portal;
    new_restaurant restaurants;
    result JSONB;
BEGIN
    -- Crear usuario
    INSERT INTO user_admin_portal (clerk_user_id, email, first_name, last_name)
    VALUES (p_clerk_user_id, p_email, p_first_name, p_last_name)
    ON CONFLICT (clerk_user_id) DO UPDATE SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        updated_at = NOW()
    RETURNING * INTO new_user;

    -- Crear restaurante por defecto si no existe
    INSERT INTO restaurants (user_id, name, description)
    VALUES (
        new_user.id,
        p_restaurant_name,
        'Descripción de tu restaurante - agrega información sobre tu cocina, especialidades y ambiente'
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO new_restaurant;

    -- Si el restaurante ya existía, obtenerlo
    IF new_restaurant.id IS NULL THEN
        SELECT * INTO new_restaurant
        FROM restaurants
        WHERE user_id = new_user.id
        AND is_active = true
        LIMIT 1;
    END IF;

    -- Construir resultado
    result := jsonb_build_object(
        'user', row_to_json(new_user),
        'restaurant', row_to_json(new_restaurant)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener usuario con su restaurante
CREATE OR REPLACE FUNCTION get_user_with_restaurant(p_clerk_user_id VARCHAR(50))
RETURNS JSONB AS $$
DECLARE
    user_record user_admin_portal;
    restaurant_record restaurants;
    result JSONB;
BEGIN
    -- Obtener usuario
    SELECT * INTO user_record
    FROM user_admin_portal
    WHERE clerk_user_id = p_clerk_user_id
    AND is_active = true;

    IF user_record.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Obtener restaurante
    SELECT * INTO restaurant_record
    FROM restaurants
    WHERE user_id = user_record.id
    AND is_active = true
    LIMIT 1;

    -- Construir resultado
    result := jsonb_build_object(
        'user', row_to_json(user_record),
        'restaurant', row_to_json(restaurant_record)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener menú completo de un usuario
CREATE OR REPLACE FUNCTION get_user_complete_menu(p_clerk_user_id VARCHAR(50))
RETURNS JSONB AS $$
DECLARE
    user_id INTEGER;
    restaurant_id INTEGER;
    result JSONB;
BEGIN
    -- Obtener user_id
    SELECT id INTO user_id
    FROM user_admin_portal
    WHERE clerk_user_id = p_clerk_user_id
    AND is_active = true;

    IF user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Obtener restaurant_id
    SELECT id INTO restaurant_id
    FROM restaurants
    WHERE user_id = user_id
    AND is_active = true
    LIMIT 1;

    IF restaurant_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Obtener menú completo
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', ms.id,
            'name', ms.name,
            'is_active', ms.is_active,
            'display_order', ms.display_order,
            'restaurant_id', ms.restaurant_id,
            'created_at', ms.created_at,
            'updated_at', ms.updated_at,
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
                    'section_id', mi.section_id,
                    'created_at', mi.created_at,
                    'updated_at', mi.updated_at
                ) ORDER BY mi.display_order, mi.id
            ) as items
        FROM menu_items mi
        WHERE mi.is_available = true
        GROUP BY section_id
    ) items ON ms.id = items.section_id
    WHERE ms.restaurant_id = restaurant_id
    AND ms.is_active = true;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- POLÍTICAS DE SEGURIDAD ROW LEVEL SECURITY
-- ===============================================

-- Habilitar RLS
ALTER TABLE user_admin_portal ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

-- Políticas para user_admin_portal
CREATE POLICY "Users can only access their own profile" ON user_admin_portal
    FOR ALL USING (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Políticas para restaurants
CREATE POLICY "Users can only access their own restaurants" ON restaurants
    FOR ALL USING (
        user_id IN (
            SELECT id FROM user_admin_portal
            WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );

-- Actualizar políticas existentes para menu_sections
DROP POLICY IF EXISTS "Allow all operations on menu_sections" ON menu_sections;
DROP POLICY IF EXISTS "Users can only access their restaurant menu sections" ON menu_sections;
CREATE POLICY "Users can only access their restaurant menu sections" ON menu_sections
    FOR ALL USING (
        restaurant_id IN (
            SELECT r.id FROM restaurants r
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );

-- Actualizar políticas para menu_items
DROP POLICY IF EXISTS "Allow all operations on menu_items" ON menu_items;
DROP POLICY IF EXISTS "Users can only access their restaurant menu items" ON menu_items;
CREATE POLICY "Users can only access their restaurant menu items" ON menu_items
    FOR ALL USING (
        section_id IN (
            SELECT ms.id FROM menu_sections ms
            JOIN restaurants r ON ms.restaurant_id = r.id
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );