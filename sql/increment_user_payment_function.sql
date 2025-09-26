-- Función para incrementar pagos de usuarios activos
CREATE OR REPLACE FUNCTION increment_user_payment(
    p_table_number INTEGER,
    p_field TEXT,
    p_amount DECIMAL(10,2),
    p_user_id UUID DEFAULT NULL,
    p_guest_name TEXT DEFAULT NULL
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

    -- Incrementar el campo correspondiente
    IF p_field = 'total_paid_individual' THEN
        UPDATE active_table_users
        SET total_paid_individual = total_paid_individual + p_amount,
            updated_at = NOW()
        WHERE table_number = p_table_number
        AND (
            (p_user_id IS NOT NULL AND user_id = p_user_id) OR
            (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
        );
    ELSIF p_field = 'total_paid_amount' THEN
        UPDATE active_table_users
        SET total_paid_amount = total_paid_amount + p_amount,
            updated_at = NOW()
        WHERE table_number = p_table_number
        AND (
            (p_user_id IS NOT NULL AND user_id = p_user_id) OR
            (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
        );
    ELSIF p_field = 'total_paid_split' THEN
        UPDATE active_table_users
        SET total_paid_split = total_paid_split + p_amount,
            updated_at = NOW()
        WHERE table_number = p_table_number
        AND (
            (p_user_id IS NOT NULL AND user_id = p_user_id) OR
            (p_guest_name IS NOT NULL AND guest_name = p_guest_name)
        );
    END IF;

    -- Verificar que se actualizó al menos una fila
    IF NOT FOUND THEN
        -- Si no existe el usuario, crearlo primero
        INSERT INTO active_table_users (
            table_number,
            user_id,
            guest_name,
            total_paid_individual,
            total_paid_amount,
            total_paid_split
        ) VALUES (
            p_table_number,
            p_user_id,
            p_guest_name,
            CASE WHEN p_field = 'total_paid_individual' THEN p_amount ELSE 0 END,
            CASE WHEN p_field = 'total_paid_amount' THEN p_amount ELSE 0 END,
            CASE WHEN p_field = 'total_paid_split' THEN p_amount ELSE 0 END
        );
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;