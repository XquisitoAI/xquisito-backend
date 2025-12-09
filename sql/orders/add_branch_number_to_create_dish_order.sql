-- ====================================================
-- Actualizar create_dish_order para incluir branch_number
-- ====================================================

-- NOTA: Este script asume que ya existe la función create_dish_order con p_restaurant_id

-- Eliminar versiones antiguas de create_dish_order para evitar conflictos
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER, VARCHAR, TEXT[], JSONB, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER, VARCHAR, TEXT[], JSONB, DECIMAL);

-- ====================================================
-- Actualizar función create_dish_order
-- ====================================================
CREATE OR REPLACE FUNCTION create_dish_order(
    p_table_number INTEGER,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_guest_name VARCHAR(255) DEFAULT NULL,
    p_quantity INTEGER DEFAULT 1,
    p_guest_id VARCHAR(255) DEFAULT NULL,
    p_images TEXT[] DEFAULT NULL,
    p_custom_fields JSONB DEFAULT NULL,
    p_extra_price DECIMAL(10,2) DEFAULT 0,
    p_restaurant_id INTEGER DEFAULT NULL,
    p_branch_number INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_table_order_id UUID;
    v_user_order_id UUID;
    v_dish_order_id UUID;
BEGIN
    -- Buscar orden activa para la mesa (filtrando por restaurant_id y branch_number)
    SELECT "to".id INTO v_table_order_id
    FROM table_order "to"
    JOIN tables t ON "to".table_id = t.id
    JOIN branches b ON t.branch_id = b.id
    WHERE t.table_number = p_table_number
    AND b.restaurant_id = p_restaurant_id
    AND b.branch_number = p_branch_number
    AND "to".status IN ('not_paid', 'partial');

    -- Si no hay orden activa, crear una nueva
    IF v_table_order_id IS NULL THEN
        v_table_order_id := open_table_order(p_table_number, p_restaurant_id, p_branch_number);
    END IF;

    -- Agregar usuario a la orden (con guest_id)
    v_user_order_id := add_user_to_order(v_table_order_id, p_user_id, p_guest_name, p_guest_id);

    -- Crear el platillo con custom_fields y extra_price
    INSERT INTO dish_order (
        user_order_id,
        item,
        quantity,
        price,
        status,
        payment_status,
        images,
        custom_fields,
        extra_price
    )
    VALUES (
        v_user_order_id,
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid',
        p_images,
        p_custom_fields,
        p_extra_price
    )
    RETURNING id INTO v_dish_order_id;

    RETURN v_dish_order_id;
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- Comentarios
-- ====================================================
COMMENT ON FUNCTION create_dish_order IS 'Crea una nueva orden de platillo para una mesa, con soporte para restaurant_id y branch_number. Busca o crea una table_order activa, agrega el usuario a la orden, y crea el dish_order con custom_fields y extra_price.';
