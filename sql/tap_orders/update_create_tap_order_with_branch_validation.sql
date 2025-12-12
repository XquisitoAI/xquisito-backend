-- Actualizar función para crear tap order con validación de branch_number
-- Esta función valida que la mesa pertenezca a la sucursal especificada antes de crear la orden

-- Primero eliminamos la función antigua (sin branch_number)
DROP FUNCTION IF EXISTS create_tap_order_with_first_dish(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, NUMERIC);

-- Ahora creamos la nueva función con branch_number
CREATE OR REPLACE FUNCTION create_tap_order_with_first_dish(
  p_table_number INTEGER,
  p_restaurant_id INTEGER,
  p_branch_number INTEGER,
  p_item TEXT,
  p_price NUMERIC,
  p_quantity INTEGER DEFAULT 1,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_email TEXT DEFAULT NULL,
  p_clerk_user_id TEXT DEFAULT NULL,
  p_images TEXT[] DEFAULT '{}',
  p_custom_fields JSONB DEFAULT NULL,
  p_extra_price NUMERIC DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_table_id UUID;
    v_tap_order_id UUID;
    v_dish_order_id UUID;
    v_result JSON;
    v_order_exists BOOLEAN := FALSE;
    v_branch_id UUID;
BEGIN
    -- 1. Obtener branch_id desde branch_number
    SELECT b.id INTO v_branch_id
    FROM branches b
    WHERE b.branch_number = p_branch_number
      AND b.restaurant_id = p_restaurant_id;

    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'Sucursal % no encontrada para restaurante %',
          p_branch_number, p_restaurant_id;
    END IF;

    -- 2. Obtener table_id validando branch_id
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number
      AND restaurant_id = p_restaurant_id
      AND branch_id = v_branch_id;

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Mesa % no encontrada para restaurante % y sucursal %',
          p_table_number, p_restaurant_id, p_branch_number;
    END IF;

    -- 3. Verificar si ya existe una tap_order activa para esta mesa
    SELECT id INTO v_tap_order_id
    FROM tap_orders_and_pay
    WHERE table_id = v_table_id
    AND order_status IN ('active', 'confirmed', 'preparing')
    ORDER BY created_at DESC
    LIMIT 1;

    -- 4. Si no existe tap_order, crear una nueva
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

    -- 5. Crear dish_order con TODOS los campos
    INSERT INTO dish_order (
        user_order_id,
        tap_order_id,
        item,
        quantity,
        price,
        status,
        payment_status,
        images,
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
        p_images,
        p_custom_fields,
        p_extra_price
    ) RETURNING id INTO v_dish_order_id;

    -- 6. Recalcular total de tap_order
    PERFORM update_tap_order_total(v_tap_order_id);

    -- 7. Retornar resultado completo
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
$$;

-- Comentario explicativo
COMMENT ON FUNCTION create_tap_order_with_first_dish IS
'Crea una nueva orden tap con el primer platillo o agrega el platillo a una orden existente.
Valida que la mesa pertenezca a la sucursal especificada antes de procesar.';
