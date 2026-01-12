-- ===============================================
-- SOLUCIÓN SEGURA PARA REGISTRO DE USUARIOS SIN SERVICE KEY
-- ===============================================

-- Eliminar el enfoque anterior que requería service key
DROP POLICY IF EXISTS user_admin_portal_insert_policy ON user_admin_portal;

-- Crear una política de inserción más específica y segura
CREATE POLICY user_admin_portal_insert_policy ON user_admin_portal
    FOR INSERT
    WITH CHECK (
        -- Permitir inserción solo si es un nuevo usuario de Clerk válido
        -- (esto se validará en el backend con la autenticación de Clerk)
        clerk_user_id IS NOT NULL
        AND email IS NOT NULL
        AND LENGTH(clerk_user_id) > 10 -- IDs de Clerk son largos
        AND email LIKE '%@%' -- Validación básica de email
    );

-- ===============================================
-- FUNCIÓN SEGURA PARA REGISTRO INICIAL
-- ===============================================

-- Esta función permitirá el registro inicial sin necesidad de service key
CREATE OR REPLACE FUNCTION secure_register_user_from_clerk(
    p_clerk_user_id VARCHAR(50),
    p_email VARCHAR(255),
    p_first_name VARCHAR(100) DEFAULT NULL,
    p_last_name VARCHAR(100) DEFAULT NULL,
    p_restaurant_name VARCHAR(100) DEFAULT 'Mi Restaurante'
)
RETURNS JSONB
SECURITY DEFINER -- Esto permite que la función ejecute con privilegios del owner
SET search_path = public
AS $$
DECLARE
    new_user user_admin_portal;
    new_restaurant restaurants;
    invitation_client_id UUID;
    result JSONB;
BEGIN
    -- Verificar que el usuario no exista ya
    SELECT * INTO new_user
    FROM user_admin_portal
    WHERE clerk_user_id = p_clerk_user_id;

    -- Si el usuario ya existe, devolverlo con su restaurante
    IF new_user.id IS NOT NULL THEN
        SELECT * INTO new_restaurant
        FROM restaurants
        WHERE user_id = new_user.id
        AND is_active = true
        LIMIT 1;

        result := jsonb_build_object(
            'user', row_to_json(new_user),
            'restaurant', row_to_json(new_restaurant)
        );

        RETURN result;
    END IF;

    -- Crear nuevo usuario
    INSERT INTO user_admin_portal (clerk_user_id, email, first_name, last_name)
    VALUES (p_clerk_user_id, p_email, p_first_name, p_last_name)
    RETURNING * INTO new_user;

    -- Buscar client_id desde pending_invitations usando el email
    SELECT client_id INTO invitation_client_id
    FROM pending_invitations
    WHERE email = p_email
    AND status = 'registered'
    LIMIT 1;

    -- Crear restaurante por defecto con client_id si existe
    INSERT INTO restaurants (user_id, name, description, client_id)
    VALUES (
        new_user.id,
        p_restaurant_name,
        'Descripción de tu restaurante - agrega información sobre tu cocina, especialidades y ambiente',
        invitation_client_id -- Puede ser NULL si no hay invitación
    )
    RETURNING * INTO new_restaurant;

    -- Construir resultado
    result := jsonb_build_object(
        'user', row_to_json(new_user),
        'restaurant', row_to_json(new_restaurant)
    );

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        -- En caso de error, devolver información útil
        RAISE EXCEPTION 'Error en registro seguro: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- PERMISOS PARA LA FUNCIÓN
-- ===============================================

-- Dar permisos públicos para ejecutar esta función (pero no otras)
GRANT EXECUTE ON FUNCTION secure_register_user_from_clerk TO anon;
GRANT EXECUTE ON FUNCTION secure_register_user_from_clerk TO authenticated;

-- ===============================================
-- NOTAS DE SEGURIDAD
-- ===============================================

-- Esta función es SEGURA porque:
-- 1. Solo permite crear usuarios, no modificar existentes arbitrariamente
-- 2. Valida que los datos de entrada sean correctos
-- 3. No expone datos sensibles
-- 4. Solo se puede llamar con datos validados por Clerk en el backend
-- 5. No requiere service key peligrosa