-- Actualizar funciones SQL para usar guest_id como identificador único de invitados

-- 1. Actualizar función add_user_to_order para incluir guest_id
CREATE OR REPLACE FUNCTION add_user_to_order(
    p_table_order_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_guest_name VARCHAR(255) DEFAULT NULL,
    p_guest_id VARCHAR(255) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_user_order_id UUID;
BEGIN
    -- Verificar si el usuario ya existe en la orden
    -- Priorizar guest_id si está disponible, si no usar guest_name
    SELECT id INTO v_user_order_id
    FROM user_order
    WHERE table_order_id = p_table_order_id
    AND (
        (p_user_id IS NOT NULL AND user_id = p_user_id) OR
        (p_guest_id IS NOT NULL AND guest_id = p_guest_id) OR
        (p_guest_id IS NULL AND p_user_id IS NULL AND guest_name = p_guest_name)
    );

    -- Si no existe, crear nuevo user_order
    IF v_user_order_id IS NULL THEN
        INSERT INTO user_order (table_order_id, user_id, guest_name, guest_id)
        VALUES (p_table_order_id, p_user_id, p_guest_name, p_guest_id)
        RETURNING id INTO v_user_order_id;
    END IF;

    RETURN v_user_order_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Actualizar función create_dish_order para incluir guest_id
CREATE OR REPLACE FUNCTION create_dish_order(
    p_table_number INTEGER,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_guest_name VARCHAR(255) DEFAULT NULL,
    p_quantity INTEGER DEFAULT 1,
    p_guest_id VARCHAR(255) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_table_order_id UUID;
    v_user_order_id UUID;
    v_dish_order_id UUID;
BEGIN
    -- Buscar orden activa para la mesa o crear una nueva
    SELECT "to".id INTO v_table_order_id
    FROM table_order "to"
    JOIN tables t ON "to".table_id = t.id
    WHERE t.table_number = p_table_number
    AND "to".status IN ('not_paid', 'partial');

    -- Si no hay orden activa, crear una nueva
    IF v_table_order_id IS NULL THEN
        v_table_order_id := open_table_order(p_table_number);
    END IF;

    -- Agregar usuario a la orden (con guest_id)
    v_user_order_id := add_user_to_order(v_table_order_id, p_user_id, p_guest_name, p_guest_id);

    -- Crear el platillo
    INSERT INTO dish_order (user_order_id, item, quantity, price, status, payment_status)
    VALUES (v_user_order_id, p_item, p_quantity, p_price, 'pending', 'not_paid')
    RETURNING id INTO v_dish_order_id;

    RETURN v_dish_order_id;
END;
$$ LANGUAGE plpgsql;