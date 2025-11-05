-- ====================================================
-- Script para resolver conflictos de funciones y actualizar con campos faltantes
-- Eliminar funciones existentes y recrear con soporte completo
-- ====================================================

-- Paso 1: Eliminar funciones existentes que tienen conflictos
DROP FUNCTION IF EXISTS create_tap_order_with_first_dish(
    INTEGER, INTEGER, VARCHAR(50), DECIMAL(10,2), INTEGER, VARCHAR, VARCHAR, VARCHAR, VARCHAR
);

DROP FUNCTION IF EXISTS add_dish_to_existing_tap_order(
    UUID, VARCHAR(50), DECIMAL(10,2), INTEGER
);

-- Paso 2: Recrear función create_tap_order_with_first_dish con campos completos
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
    p_images JSONB DEFAULT '[]'::jsonb,              -- NUEVO: Soporte para imágenes
    p_custom_fields JSONB DEFAULT NULL,               -- NUEVO: Campos personalizados
    p_extra_price DECIMAL(10,2) DEFAULT 0             -- NUEVO: Precio extra
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

        -- NO marcar mesa como ocupada en tap-order-and-pay
        -- Las mesas permanecen 'available' para múltiples usuarios
        -- UPDATE tables SET status = 'occupied' WHERE id = v_table_id; -- REMOVIDO
    ELSE
        v_order_exists := TRUE;
    END IF;

    -- Crear dish_order con TODOS los campos (incluyendo los faltantes)
    INSERT INTO dish_order (
        user_order_id,          -- NULL para Tap Order
        tap_order_id,           -- UUID para Tap Order
        item,
        quantity,
        price,
        status,
        payment_status,
        images,                 -- NUEVO: Imágenes del platillo
        custom_fields,          -- NUEVO: Campos personalizados
        extra_price             -- NUEVO: Precio extra
    ) VALUES (
        NULL,                   -- EXPLÍCITO: NULL para user_order_id
        v_tap_order_id,         -- UUID válido para tap_order_id
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid',
        p_images,               -- NUEVO: Soporte para imágenes
        p_custom_fields,        -- NUEVO: Campos personalizados
        p_extra_price           -- NUEVO: Precio extra
    ) RETURNING id INTO v_dish_order_id;

    -- Recalcular total de tap_order (incluye extra_price automáticamente)
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

-- Paso 3: Recrear función add_dish_to_existing_tap_order con campos completos
CREATE OR REPLACE FUNCTION add_dish_to_existing_tap_order(
    p_tap_order_id UUID,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_quantity INTEGER DEFAULT 1,
    p_images JSONB DEFAULT '[]'::jsonb,              -- NUEVO: Soporte para imágenes
    p_custom_fields JSONB DEFAULT NULL,               -- NUEVO: Campos personalizados
    p_extra_price DECIMAL(10,2) DEFAULT 0             -- NUEVO: Precio extra
) RETURNS JSON AS $$
DECLARE
    v_table_id UUID;
    v_dish_order_id UUID;
    v_result JSON;
BEGIN
    -- Verificar que tap_order existe y está activa, obtener table_id por JOIN
    SELECT tap.table_id INTO v_table_id
    FROM tap_orders_and_pay tap
    WHERE tap.id = p_tap_order_id
    AND tap.order_status IN ('active', 'confirmed');

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Tap order % no encontrada o no está activa', p_tap_order_id;
    END IF;

    -- Crear dish_order con TODOS los campos (incluyendo los faltantes)
    INSERT INTO dish_order (
        user_order_id,          -- NULL para Tap Order
        tap_order_id,           -- UUID para Tap Order
        item,
        quantity,
        price,
        status,
        payment_status,
        images,                 -- NUEVO: Imágenes del platillo
        custom_fields,          -- NUEVO: Campos personalizados
        extra_price             -- NUEVO: Precio extra
    ) VALUES (
        NULL,                   -- EXPLÍCITO: NULL para user_order_id
        p_tap_order_id,         -- UUID válido para tap_order_id
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid',
        p_images,               -- NUEVO: Soporte para imágenes
        p_custom_fields,        -- NUEVO: Campos personalizados
        p_extra_price           -- NUEVO: Precio extra
    ) RETURNING id INTO v_dish_order_id;

    -- Recalcular total (incluye extra_price automáticamente)
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

-- Paso 4: Actualizar la función de cálculo de total para incluir extra_price
CREATE OR REPLACE FUNCTION update_tap_order_total(p_tap_order_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    v_total DECIMAL(10,2);
BEGIN
    -- Calcular total de todos los dish_orders incluyendo extra_price
    SELECT COALESCE(SUM(quantity * (price + COALESCE(extra_price, 0))), 0)
    INTO v_total
    FROM dish_order
    WHERE tap_order_id = p_tap_order_id;

    -- Actualizar tap_orders_and_pay
    UPDATE tap_orders_and_pay
    SET
        total_amount = v_total,
        updated_at = NOW()
    WHERE id = p_tap_order_id;

    RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON FUNCTION create_tap_order_with_first_dish IS
'Crea tap_order y primer dish_order con soporte completo para images, custom_fields y extra_price. VERSIÓN ACTUALIZADA';

COMMENT ON FUNCTION add_dish_to_existing_tap_order IS
'Agrega platillo a tap_order existente con soporte completo para images, custom_fields y extra_price. VERSIÓN ACTUALIZADA';

COMMENT ON FUNCTION update_tap_order_total IS
'Recalcula total de tap_order incluyendo extra_price de cada dish_order. VERSIÓN ACTUALIZADA';

-- Paso 5: Verificación final
DO $$
BEGIN
    RAISE NOTICE '=== ACTUALIZACIÓN FUNCIONES TAP ORDER COMPLETADA ===';
    RAISE NOTICE '✅ Funciones anteriores eliminadas para evitar conflictos';
    RAISE NOTICE '✅ create_tap_order_with_first_dish recreada con 12 parámetros';
    RAISE NOTICE '✅ add_dish_to_existing_tap_order recreada con 7 parámetros';
    RAISE NOTICE '✅ update_tap_order_total actualizada para incluir extra_price';
    RAISE NOTICE '✅ Soporte completo para images, custom_fields, extra_price';
    RAISE NOTICE 'Sistema listo para testing con campos completos';
END $$;