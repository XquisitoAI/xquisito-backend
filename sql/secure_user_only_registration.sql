-- ===============================================
-- FUNCIÓN SEGURA PARA REGISTRO DE SOLO USUARIO (SIN RESTAURANTE)
-- ===============================================

-- Esta función reemplaza la anterior que creaba restaurante automáticamente
CREATE OR REPLACE FUNCTION secure_register_user_only_from_clerk(
    p_clerk_user_id VARCHAR(50),
    p_email VARCHAR(255),
    p_first_name VARCHAR(100) DEFAULT NULL,
    p_last_name VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER -- Esto permite que la función ejecute con privilegios del owner
SET search_path = public
AS $$
DECLARE
    existing_user user_admin_portal;
    new_user user_admin_portal;
    result JSONB;
BEGIN
    -- Verificar si el usuario ya existe por clerk_user_id
    SELECT * INTO existing_user
    FROM user_admin_portal
    WHERE clerk_user_id = p_clerk_user_id;

    -- Si el usuario ya existe con el mismo clerk_user_id
    IF existing_user.id IS NOT NULL THEN
        -- Si está inactivo, reactivarlo y actualizar datos
        IF existing_user.is_active = false THEN
            UPDATE user_admin_portal
            SET
                is_active = true,
                email = p_email,
                first_name = p_first_name,
                last_name = p_last_name,
                updated_at = CURRENT_TIMESTAMP
            WHERE clerk_user_id = p_clerk_user_id
            RETURNING * INTO new_user;

            result := jsonb_build_object(
                'user', row_to_json(new_user),
                'restaurant', NULL,
                'message', 'User reactivated successfully'
            );
        ELSE
            -- Usuario activo, solo actualizar datos si es necesario
            UPDATE user_admin_portal
            SET
                email = p_email,
                first_name = p_first_name,
                last_name = p_last_name,
                updated_at = CURRENT_TIMESTAMP
            WHERE clerk_user_id = p_clerk_user_id
            RETURNING * INTO new_user;

            result := jsonb_build_object(
                'user', row_to_json(new_user),
                'restaurant', NULL,
                'message', 'User already exists and updated'
            );
        END IF;

        RETURN result;
    END IF;

    -- Verificar si existe un usuario con el mismo email pero diferente clerk_user_id
    SELECT * INTO existing_user
    FROM user_admin_portal
    WHERE email = p_email AND clerk_user_id != p_clerk_user_id;

    -- Si existe usuario con mismo email pero diferente clerk_user_id
    IF existing_user.id IS NOT NULL THEN
        -- Actualizar el clerk_user_id y reactivar si es necesario
        UPDATE user_admin_portal
        SET
            clerk_user_id = p_clerk_user_id,
            first_name = p_first_name,
            last_name = p_last_name,
            is_active = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE email = p_email
        RETURNING * INTO new_user;

        result := jsonb_build_object(
            'user', row_to_json(new_user),
            'restaurant', NULL,
            'message', 'User account updated with new Clerk ID'
        );

        RETURN result;
    END IF;

    -- Crear nuevo usuario si no existe
    INSERT INTO user_admin_portal (clerk_user_id, email, first_name, last_name, is_active)
    VALUES (p_clerk_user_id, p_email, p_first_name, p_last_name, true)
    RETURNING * INTO new_user;

    -- Construir resultado solo con usuario (sin restaurante)
    result := jsonb_build_object(
        'user', row_to_json(new_user),
        'restaurant', NULL,
        'message', 'User created successfully. Restaurant setup required.'
    );

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        -- En caso de error, devolver información útil
        RAISE EXCEPTION 'Error en registro de usuario: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- FUNCIÓN SEPARADA PARA CREAR RESTAURANTE
-- ===============================================

CREATE OR REPLACE FUNCTION create_user_restaurant(
    p_clerk_user_id VARCHAR(50),
    p_restaurant_name VARCHAR(100),
    p_description TEXT DEFAULT 'Descripción de tu restaurante - agrega información sobre tu cocina, especialidades y ambiente'
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_record user_admin_portal;
    new_restaurant restaurants;
    result JSONB;
BEGIN
    -- Obtener el usuario
    SELECT * INTO user_record
    FROM user_admin_portal
    WHERE clerk_user_id = p_clerk_user_id
    AND is_active = true;

    IF user_record.id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', p_clerk_user_id;
    END IF;

    -- Verificar si ya tiene un restaurante
    SELECT * INTO new_restaurant
    FROM restaurants
    WHERE user_id = user_record.id
    AND is_active = true
    LIMIT 1;

    IF new_restaurant.id IS NOT NULL THEN
        -- Ya tiene restaurante, devolverlo
        result := jsonb_build_object(
            'user', row_to_json(user_record),
            'restaurant', row_to_json(new_restaurant),
            'message', 'Restaurant already exists'
        );
    ELSE
        -- Crear nuevo restaurante
        INSERT INTO restaurants (user_id, name, description)
        VALUES (user_record.id, p_restaurant_name, p_description)
        RETURNING * INTO new_restaurant;

        result := jsonb_build_object(
            'user', row_to_json(user_record),
            'restaurant', row_to_json(new_restaurant),
            'message', 'Restaurant created successfully'
        );
    END IF;

    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error creando restaurante: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- PERMISOS
-- ===============================================

GRANT EXECUTE ON FUNCTION secure_register_user_only_from_clerk TO anon;
GRANT EXECUTE ON FUNCTION secure_register_user_only_from_clerk TO authenticated;

GRANT EXECUTE ON FUNCTION create_user_restaurant TO anon;
GRANT EXECUTE ON FUNCTION create_user_restaurant TO authenticated;

-- ===============================================
-- NOTAS
-- ===============================================

-- secure_register_user_only_from_clerk:
--   - Identifica usuarios por clerk_user_id (principal)
--   - Maneja soft delete con is_active
--   - Permite reutilización de emails con nuevos clerk_user_id
--   - Solo crea usuario, devuelve restaurant: null
--
-- create_user_restaurant: Crea restaurante para usuario existente
-- Esto permite un flujo de setup paso a paso y mejor gestión del ciclo de vida del usuario