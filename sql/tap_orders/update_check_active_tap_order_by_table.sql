-- Actualizar función para verificar orden activa con validación de branch_number

-- Primero eliminamos la función antigua (sin branch_number)
DROP FUNCTION IF EXISTS check_active_tap_order_by_table(INTEGER, INTEGER);

-- Ahora creamos la nueva función con branch_number
CREATE OR REPLACE FUNCTION check_active_tap_order_by_table(
    p_table_number INTEGER,
    p_restaurant_id INTEGER,
    p_branch_number INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_table_id UUID;
    v_tap_order_id UUID;
    v_result JSON;
    v_branch_id UUID;
BEGIN
    -- 1. Obtener branch_id desde branch_number
    SELECT b.id INTO v_branch_id
    FROM branches b
    WHERE b.branch_number = p_branch_number
      AND b.restaurant_id = p_restaurant_id;

    IF v_branch_id IS NULL THEN
        RETURN json_build_object(
            'hasOrder', false,
            'error', 'Branch not found'
        );
    END IF;

    -- 2. Obtener table_id validando branch_id
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number
      AND restaurant_id = p_restaurant_id
      AND branch_id = v_branch_id;

    IF v_table_id IS NULL THEN
        RETURN json_build_object(
            'hasOrder', false,
            'error', 'Table not found'
        );
    END IF;

    -- 3. Buscar tap_order activa
    SELECT id INTO v_tap_order_id
    FROM tap_orders_and_pay
    WHERE table_id = v_table_id
    AND order_status IN ('active', 'confirmed', 'preparing')
    ORDER BY created_at DESC
    LIMIT 1;

    -- 4. Retornar resultado
    IF v_tap_order_id IS NOT NULL THEN
        -- Obtener resumen completo usando la función existente
        SELECT get_tap_order_complete_summary(v_tap_order_id) INTO v_result;
        RETURN json_build_object(
            'hasOrder', true,
            'data', v_result
        );
    ELSE
        RETURN json_build_object(
            'hasOrder', false,
            'table_info', json_build_object(
                'table_id', v_table_id,
                'table_number', p_table_number,
                'restaurant_id', p_restaurant_id,
                'branch_number', p_branch_number
            )
        );
    END IF;
END;
$$;

-- Comentario explicativo
COMMENT ON FUNCTION check_active_tap_order_by_table IS
'Verifica si existe una orden activa para una mesa específica.
Valida que la mesa pertenezca a la sucursal especificada antes de buscar.
NO crea una orden si no existe.';
