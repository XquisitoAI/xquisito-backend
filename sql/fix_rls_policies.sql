-- ===============================================
-- ARREGLAR POLÍTICAS RLS PARA ADMIN PORTAL
-- ===============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE user_admin_portal ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- ===============================================
-- POLÍTICAS PARA user_admin_portal
-- ===============================================

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS user_admin_portal_insert_policy ON user_admin_portal;
DROP POLICY IF EXISTS user_admin_portal_select_policy ON user_admin_portal;
DROP POLICY IF EXISTS user_admin_portal_update_policy ON user_admin_portal;
DROP POLICY IF EXISTS user_admin_portal_delete_policy ON user_admin_portal;

-- Permitir insertar usuarios (para sync desde Clerk)
CREATE POLICY user_admin_portal_insert_policy ON user_admin_portal
    FOR INSERT
    WITH CHECK (true); -- Permitir cualquier inserción

-- Permitir a los usuarios ver solo sus propios datos
CREATE POLICY user_admin_portal_select_policy ON user_admin_portal
    FOR SELECT
    USING (
        clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        OR current_setting('rls.clerk_user_id', true) IS NULL -- Para operaciones del sistema
    );

-- Permitir a los usuarios actualizar solo sus propios datos
CREATE POLICY user_admin_portal_update_policy ON user_admin_portal
    FOR UPDATE
    USING (
        clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Prohibir eliminación (solo soft delete)
CREATE POLICY user_admin_portal_delete_policy ON user_admin_portal
    FOR DELETE
    USING (false); -- Prohibir eliminación física

-- ===============================================
-- POLÍTICAS PARA restaurants
-- ===============================================

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS restaurants_insert_policy ON restaurants;
DROP POLICY IF EXISTS restaurants_select_policy ON restaurants;
DROP POLICY IF EXISTS restaurants_update_policy ON restaurants;
DROP POLICY IF EXISTS restaurants_delete_policy ON restaurants;

-- Permitir insertar restaurantes (para usuarios autenticados)
CREATE POLICY restaurants_insert_policy ON restaurants
    FOR INSERT
    WITH CHECK (
        user_id IN (
            SELECT id FROM user_admin_portal
            WHERE clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Permitir ver solo restaurantes propios
CREATE POLICY restaurants_select_policy ON restaurants
    FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM user_admin_portal
            WHERE clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Permitir actualizar solo restaurantes propios
CREATE POLICY restaurants_update_policy ON restaurants
    FOR UPDATE
    USING (
        user_id IN (
            SELECT id FROM user_admin_portal
            WHERE clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Prohibir eliminación física
CREATE POLICY restaurants_delete_policy ON restaurants
    FOR DELETE
    USING (false);

-- ===============================================
-- POLÍTICAS PARA menu_sections
-- ===============================================

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS menu_sections_insert_policy ON menu_sections;
DROP POLICY IF EXISTS menu_sections_select_policy ON menu_sections;
DROP POLICY IF EXISTS menu_sections_update_policy ON menu_sections;
DROP POLICY IF EXISTS menu_sections_delete_policy ON menu_sections;

-- Permitir insertar secciones en restaurantes propios
CREATE POLICY menu_sections_insert_policy ON menu_sections
    FOR INSERT
    WITH CHECK (
        restaurant_id IN (
            SELECT r.id FROM restaurants r
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Permitir ver solo secciones de restaurantes propios
CREATE POLICY menu_sections_select_policy ON menu_sections
    FOR SELECT
    USING (
        restaurant_id IN (
            SELECT r.id FROM restaurants r
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Permitir actualizar solo secciones propias
CREATE POLICY menu_sections_update_policy ON menu_sections
    FOR UPDATE
    USING (
        restaurant_id IN (
            SELECT r.id FROM restaurants r
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Permitir eliminación de secciones propias
CREATE POLICY menu_sections_delete_policy ON menu_sections
    FOR DELETE
    USING (
        restaurant_id IN (
            SELECT r.id FROM restaurants r
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- ===============================================
-- POLÍTICAS PARA menu_items
-- ===============================================

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS menu_items_insert_policy ON menu_items;
DROP POLICY IF EXISTS menu_items_select_policy ON menu_items;
DROP POLICY IF EXISTS menu_items_update_policy ON menu_items;
DROP POLICY IF EXISTS menu_items_delete_policy ON menu_items;

-- Permitir insertar items en secciones propias
CREATE POLICY menu_items_insert_policy ON menu_items
    FOR INSERT
    WITH CHECK (
        section_id IN (
            SELECT ms.id FROM menu_sections ms
            JOIN restaurants r ON ms.restaurant_id = r.id
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Permitir ver solo items de secciones propias
CREATE POLICY menu_items_select_policy ON menu_items
    FOR SELECT
    USING (
        section_id IN (
            SELECT ms.id FROM menu_sections ms
            JOIN restaurants r ON ms.restaurant_id = r.id
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Permitir actualizar solo items propios
CREATE POLICY menu_items_update_policy ON menu_items
    FOR UPDATE
    USING (
        section_id IN (
            SELECT ms.id FROM menu_sections ms
            JOIN restaurants r ON ms.restaurant_id = r.id
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- Permitir eliminación de items propios
CREATE POLICY menu_items_delete_policy ON menu_items
    FOR DELETE
    USING (
        section_id IN (
            SELECT ms.id FROM menu_sections ms
            JOIN restaurants r ON ms.restaurant_id = r.id
            JOIN user_admin_portal u ON r.user_id = u.id
            WHERE u.clerk_user_id = current_setting('rls.clerk_user_id', true)::VARCHAR
        )
        OR current_setting('rls.clerk_user_id', true) IS NULL
    );

-- ===============================================
-- FUNCIÓN HELPER PARA ESTABLECER CONTEXT DE USUARIO
-- ===============================================

-- Esta función se usará en el backend para establecer el contexto del usuario
CREATE OR REPLACE FUNCTION set_rls_user_context(p_clerk_user_id VARCHAR(50))
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('rls.clerk_user_id', p_clerk_user_id, true);
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- FUNCIÓN HELPER PARA LIMPIAR CONTEXT
-- ===============================================

CREATE OR REPLACE FUNCTION clear_rls_user_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('rls.clerk_user_id', NULL, true);
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- NOTA IMPORTANTE
-- ===============================================

-- Para usar estas políticas, el backend debe:
-- 1. Llamar a set_rls_user_context(clerk_user_id) antes de hacer operaciones
-- 2. Usar supabase service key para operaciones del sistema (sync inicial)
-- 3. Llamar a clear_rls_user_context() cuando termine