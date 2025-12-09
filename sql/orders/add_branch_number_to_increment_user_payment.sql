-- ====================================================
-- Actualizar increment_user_payment para incluir branch_number
-- ====================================================

-- Eliminar las 2 versiones existentes con sus firmas exactas
DROP FUNCTION IF EXISTS increment_user_payment(p_table_number integer, p_field text, p_amount numeric, p_user_id character varying, p_guest_name text);
DROP FUNCTION IF EXISTS increment_user_payment(p_restaurant_id integer, p_table_number integer, p_user_id character varying, p_guest_name text, p_field text, p_amount numeric);

-- ====================================================
-- Actualizar función increment_user_payment
-- ====================================================
CREATE OR REPLACE FUNCTION increment_user_payment(
    p_table_number INTEGER,
    p_field TEXT,
    p_amount DECIMAL(10,2),
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_guest_name TEXT DEFAULT NULL,
    p_restaurant_id INTEGER DEFAULT NULL,
    p_branch_number INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    -- Validar que se proporcionó al menos uno de los identificadores
    IF p_user_id IS NULL AND p_guest_name IS NULL THEN
        RAISE EXCEPTION 'Must provide either user_id or guest_name';
    END IF;

    -- Validar campo de pago
    IF p_field NOT IN ('total_paid_individual', 'total_paid_amount', 'total_paid_split') THEN
        RAISE EXCEPTION 'Invalid payment field: %', p_field;
    END IF;

    -- Incrementar el campo correspondiente filtrando por restaurant_id y branch_number
    IF p_field = 'total_paid_individual' THEN
        IF p_restaurant_id IS NOT NULL AND p_branch_number IS NOT NULL THEN
            UPDATE active_table_users
            SET total_paid_individual = total_paid_individual + p_amount,
                updated_at = NOW()
            WHERE table_number = p_table_number
            AND restaurant_id = p_restaurant_id
            AND branch_number = p_branch_number
            AND (
                (p_user_id IS NOT NULL AND user_id = p_user_id) OR
                (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
            );
        ELSIF p_restaurant_id IS NOT NULL THEN
            -- Retrocompatibilidad: solo restaurant_id
            UPDATE active_table_users
            SET total_paid_individual = total_paid_individual + p_amount,
                updated_at = NOW()
            WHERE table_number = p_table_number
            AND restaurant_id = p_restaurant_id
            AND (
                (p_user_id IS NOT NULL AND user_id = p_user_id) OR
                (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
            );
        ELSE
            -- Retrocompatibilidad: sin filtros de restaurante
            UPDATE active_table_users
            SET total_paid_individual = total_paid_individual + p_amount,
                updated_at = NOW()
            WHERE table_number = p_table_number
            AND (
                (p_user_id IS NOT NULL AND user_id = p_user_id) OR
                (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
            );
        END IF;
    ELSIF p_field = 'total_paid_amount' THEN
        IF p_restaurant_id IS NOT NULL AND p_branch_number IS NOT NULL THEN
            UPDATE active_table_users
            SET total_paid_amount = total_paid_amount + p_amount,
                updated_at = NOW()
            WHERE table_number = p_table_number
            AND restaurant_id = p_restaurant_id
            AND branch_number = p_branch_number
            AND (
                (p_user_id IS NOT NULL AND user_id = p_user_id) OR
                (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
            );
        ELSIF p_restaurant_id IS NOT NULL THEN
            UPDATE active_table_users
            SET total_paid_amount = total_paid_amount + p_amount,
                updated_at = NOW()
            WHERE table_number = p_table_number
            AND restaurant_id = p_restaurant_id
            AND (
                (p_user_id IS NOT NULL AND user_id = p_user_id) OR
                (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
            );
        ELSE
            UPDATE active_table_users
            SET total_paid_amount = total_paid_amount + p_amount,
                updated_at = NOW()
            WHERE table_number = p_table_number
            AND (
                (p_user_id IS NOT NULL AND user_id = p_user_id) OR
                (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
            );
        END IF;
    ELSIF p_field = 'total_paid_split' THEN
        IF p_restaurant_id IS NOT NULL AND p_branch_number IS NOT NULL THEN
            UPDATE active_table_users
            SET total_paid_split = total_paid_split + p_amount,
                updated_at = NOW()
            WHERE table_number = p_table_number
            AND restaurant_id = p_restaurant_id
            AND branch_number = p_branch_number
            AND (
                (p_user_id IS NOT NULL AND user_id = p_user_id) OR
                (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
            );
        ELSIF p_restaurant_id IS NOT NULL THEN
            UPDATE active_table_users
            SET total_paid_split = total_paid_split + p_amount,
                updated_at = NOW()
            WHERE table_number = p_table_number
            AND restaurant_id = p_restaurant_id
            AND (
                (p_user_id IS NOT NULL AND user_id = p_user_id) OR
                (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
            );
        ELSE
            UPDATE active_table_users
            SET total_paid_split = total_paid_split + p_amount,
                updated_at = NOW()
            WHERE table_number = p_table_number
            AND (
                (p_user_id IS NOT NULL AND user_id = p_user_id) OR
                (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
            );
        END IF;
    END IF;

    -- Verificar que se actualizó al menos una fila
    IF NOT FOUND THEN
        -- Si no existe el usuario, crearlo primero con restaurant_id y branch_number
        INSERT INTO active_table_users (
            table_number,
            user_id,
            guest_name,
            total_paid_individual,
            total_paid_amount,
            total_paid_split,
            restaurant_id,
            branch_number
        ) VALUES (
            p_table_number,
            p_user_id,
            p_guest_name,
            CASE WHEN p_field = 'total_paid_individual' THEN p_amount ELSE 0 END,
            CASE WHEN p_field = 'total_paid_amount' THEN p_amount ELSE 0 END,
            CASE WHEN p_field = 'total_paid_split' THEN p_amount ELSE 0 END,
            p_restaurant_id,
            p_branch_number
        );
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- Comentarios
-- ====================================================
COMMENT ON FUNCTION increment_user_payment IS 'Incrementa el pago de un usuario en active_table_users, con soporte para restaurant_id y branch_number. Si el usuario no existe, lo crea automáticamente.';
