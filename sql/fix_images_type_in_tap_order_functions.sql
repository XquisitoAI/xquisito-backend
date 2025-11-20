-- ====================================================
-- Script para corregir el tipo de p_images de JSONB a TEXT[]
-- en las funciones de Tap Order
-- ====================================================

-- Paso 1: Eliminar todas las versiones anteriores de las funciones
DROP FUNCTION IF EXISTS create_tap_order_with_first_dish CASCADE;
DROP FUNCTION IF EXISTS add_dish_to_existing_tap_order CASCADE;

-- Paso 2: Crear create_tap_order_with_first_dish con tipos correctos
CREATE OR REPLACE FUNCTION create_tap_order_with_first_dish(
    p_table_number INTEGER,
    p_restaurant_id INTEGER,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_quantity INTEGER DEFAULT 1,
    p_customer_name VARCHAR DEFAULT NULL,
    p_customer_phone VARCHAR DEFAULT NULL,
    p_customer_email VARCHAR DEFAULT NULL,
    p_clerk_user_id VARCHAR DEFAULT NULL,
    p_images TEXT[] DEFAULT ARRAY[]::TEXT[],          -- CORREGIDO: De JSONB a TEXT[]
    p_custom_fields JSONB DEFAULT NULL,
    p_extra_price DECIMAL(10,2) DEFAULT 0
) RETURNS JSON AS $$
DECLARE
    v_table_id UUID;
    v_tap_order_id UUID;
    v_dish_order_id UUID;
    v_result JSON;
    v_order_exists BOOLEAN := FALSE;
BEGIN
    -- Obtener table_id
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number AND restaurant_id = p_restaurant_id;

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Mesa % no encontrada en restaurante %', p_table_number, p_restaurant_id;
    END IF;

    -- Verificar si ya existe una tap_order activa para esta mesa
    SELECT id INTO v_tap_order_id
    FROM tap_orders_and_pay
    WHERE table_id = v_table_id
    AND order_status IN ('active', 'confirmed', 'preparing')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Si no existe tap_order, crear una nueva
    IF v_tap_order_id IS NULL THEN
        INSERT INTO tap_orders_and_pay (
            table_id,
            clerk_user_id,
            customer_name,
            customer_phone,
            customer_email,
            total_amount,
            payment_status,
            order_status
        ) VALUES (
            v_table_id,
            p_clerk_user_id,
            p_customer_name,
            p_customer_phone,
            p_customer_email,
            0,
            'pending',
            'active'
        ) RETURNING id INTO v_tap_order_id;
    ELSE
        v_order_exists := TRUE;
    END IF;

    -- Crear dish_order con TODOS los campos
    INSERT INTO dish_order (
        user_order_id,
        tap_order_id,
        item,
        quantity,
        price,
        status,
        payment_status,
        images,              -- TEXT[] correcto
        custom_fields,
        extra_price
    ) VALUES (
        NULL,
        v_tap_order_id,
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid',
        p_images,            -- TEXT[] correcto
        p_custom_fields,
        p_extra_price
    ) RETURNING id INTO v_dish_order_id;

    -- Recalcular total de tap_order
    PERFORM update_tap_order_total(v_tap_order_id);

    -- Retornar resultado completo
    v_result := json_build_object(
        'tap_order_id', v_tap_order_id,
        'dish_order_id', v_dish_order_id,
        'table_id', v_table_id,
        'action', CASE
            WHEN v_order_exists THEN 'dish_added_to_existing_order'
            ELSE 'new_order_created_with_first_dish'
        END,
        'dish_details', json_build_object(
            'item', p_item,
            'quantity', p_quantity,
            'price', p_price,
            'extra_price', p_extra_price,
            'total_dish_price', (p_price + p_extra_price) * p_quantity,
            'images', p_images,
            'custom_fields', p_custom_fields
        )
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Paso 3: Crear add_dish_to_existing_tap_order con tipos correctos
CREATE OR REPLACE FUNCTION add_dish_to_existing_tap_order(
    p_tap_order_id UUID,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_quantity INTEGER DEFAULT 1,
    p_images TEXT[] DEFAULT ARRAY[]::TEXT[],          -- CORREGIDO: De JSONB a TEXT[]
    p_custom_fields JSONB DEFAULT NULL,
    p_extra_price DECIMAL(10,2) DEFAULT 0
) RETURNS JSON AS $$
DECLARE
    v_table_id UUID;
    v_dish_order_id UUID;
    v_result JSON;
BEGIN
    -- Verificar que tap_order existe y está activa
    SELECT tap.table_id INTO v_table_id
    FROM tap_orders_and_pay tap
    WHERE tap.id = p_tap_order_id
    AND tap.order_status IN ('active', 'confirmed');

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Tap order % no encontrada o no está activa', p_tap_order_id;
    END IF;

    -- Crear dish_order con TODOS los campos
    INSERT INTO dish_order (
        user_order_id,
        tap_order_id,
        item,
        quantity,
        price,
        status,
        payment_status,
        images,              -- TEXT[] correcto
        custom_fields,
        extra_price
    ) VALUES (
        NULL,
        p_tap_order_id,
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid',
        p_images,            -- TEXT[] correcto
        p_custom_fields,
        p_extra_price
    ) RETURNING id INTO v_dish_order_id;

    -- Recalcular total
    PERFORM update_tap_order_total(p_tap_order_id);

    -- Retornar resultado completo
    v_result := json_build_object(
        'dish_order_id', v_dish_order_id,
        'tap_order_id', p_tap_order_id,
        'table_id', v_table_id,
        'dish_details', json_build_object(
            'item', p_item,
            'quantity', p_quantity,
            'price', p_price,
            'extra_price', p_extra_price,
            'total_dish_price', (p_price + p_extra_price) * p_quantity,
            'images', p_images,
            'custom_fields', p_custom_fields
        )
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON FUNCTION create_tap_order_with_first_dish IS
'Crea tap_order y primer dish_order - p_images es TEXT[] para compatibilidad con la columna';

COMMENT ON FUNCTION add_dish_to_existing_tap_order IS
'Agrega platillo a tap_order existente - p_images es TEXT[] para compatibilidad con la columna';

-- Verificación
DO $$
BEGIN
    RAISE NOTICE '=== CORRECCIÓN TIPO DE DATOS IMAGES ===';
    RAISE NOTICE '✅ create_tap_order_with_first_dish: p_images cambiado de JSONB a TEXT[]';
    RAISE NOTICE '✅ add_dish_to_existing_tap_order: p_images cambiado de JSONB a TEXT[]';
    RAISE NOTICE 'Las funciones ahora son compatibles con la columna images TEXT[] de dish_order';
END $$;
