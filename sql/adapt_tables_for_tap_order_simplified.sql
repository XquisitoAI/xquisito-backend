-- ====================================================
-- Script para adaptar tablas existentes para Tap Order
-- Arquitectura Distribuida: dish_order + tables + tap_orders_and_pay
-- VERSIÓN SIMPLIFICADA - SOLO tap_order_id
-- ====================================================

-- Paso 1: Agregar solo la columna tap_order_id a dish_order
ALTER TABLE public.dish_order
ADD COLUMN IF NOT EXISTS tap_order_id uuid REFERENCES tap_orders_and_pay(id);

-- Paso 2: Crear índice para mejorar performance
CREATE INDEX IF NOT EXISTS idx_dish_order_tap_order_id ON dish_order(tap_order_id);

-- Paso 3: Función para crear tap order completo cuando se agrega primer platillo
CREATE OR REPLACE FUNCTION create_tap_order_with_first_dish(
    p_table_number INTEGER,
    p_restaurant_id UUID,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_quantity INTEGER DEFAULT 1,
    p_customer_name VARCHAR DEFAULT NULL,
    p_customer_phone VARCHAR DEFAULT NULL,
    p_customer_email VARCHAR DEFAULT NULL,
    p_clerk_user_id VARCHAR DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_table_id UUID;
    v_tap_order_id UUID;
    v_dish_order_id UUID;
    v_result JSON;
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

        -- Marcar mesa como ocupada
        UPDATE tables SET status = 'occupied' WHERE id = v_table_id;
    END IF;

    -- Crear dish_order (sin table_id, se obtiene por JOIN)
    INSERT INTO dish_order (
        tap_order_id,
        item,
        quantity,
        price,
        status,
        payment_status
    ) VALUES (
        v_tap_order_id,
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid'
    ) RETURNING id INTO v_dish_order_id;

    -- Recalcular total de tap_order
    PERFORM update_tap_order_total(v_tap_order_id);

    -- Retornar resultado
    v_result := json_build_object(
        'tap_order_id', v_tap_order_id,
        'dish_order_id', v_dish_order_id,
        'table_id', v_table_id,
        'action', CASE
            WHEN v_tap_order_id IS NOT NULL THEN 'dish_added_to_existing_order'
            ELSE 'new_order_created_with_first_dish'
        END
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Paso 4: Función para agregar platillos adicionales a tap order existente
CREATE OR REPLACE FUNCTION add_dish_to_existing_tap_order(
    p_tap_order_id UUID,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_quantity INTEGER DEFAULT 1
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

    -- Crear dish_order (sin table_id redundante)
    INSERT INTO dish_order (
        tap_order_id,
        item,
        quantity,
        price,
        status,
        payment_status
    ) VALUES (
        p_tap_order_id,
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid'
    ) RETURNING id INTO v_dish_order_id;

    -- Recalcular total
    PERFORM update_tap_order_total(p_tap_order_id);

    v_result := json_build_object(
        'dish_order_id', v_dish_order_id,
        'tap_order_id', p_tap_order_id,
        'table_id', v_table_id,
        'item', p_item,
        'quantity', p_quantity,
        'price', p_price
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Paso 5: Función para recalcular total de tap_order
CREATE OR REPLACE FUNCTION update_tap_order_total(p_tap_order_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    v_total DECIMAL(10,2);
BEGIN
    -- Calcular total de todos los dish_orders de esta tap_order
    SELECT COALESCE(SUM(quantity * price), 0)
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

-- Paso 6: Función para obtener resumen completo de tap_order
CREATE OR REPLACE FUNCTION get_tap_order_complete_summary(p_tap_order_id UUID)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'tap_order', json_build_object(
            'id', tap.id,
            'customer_name', tap.customer_name,
            'customer_phone', tap.customer_phone,
            'customer_email', tap.customer_email,
            'total_amount', tap.total_amount,
            'payment_status', tap.payment_status,
            'order_status', tap.order_status,
            'created_at', tap.created_at,
            'updated_at', tap.updated_at
        ),
        'table', json_build_object(
            'id', t.id,
            'table_number', t.table_number,
            'restaurant_id', t.restaurant_id,
            'status', t.status
        ),
        'dishes', COALESCE((
            SELECT json_agg(json_build_object(
                'id', dish.id,
                'item', dish.item,
                'quantity', dish.quantity,
                'price', dish.price,
                'status', dish.status,
                'payment_status', dish.payment_status,
                'total_price', dish.quantity * dish.price
            ))
            FROM dish_order dish
            WHERE dish.tap_order_id = tap.id
            ORDER BY dish.created_at
        ), '[]'::json)
    ) INTO v_result
    FROM tap_orders_and_pay tap
    JOIN tables t ON tap.table_id = t.id
    WHERE tap.id = p_tap_order_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Paso 7: Función para verificar si existe tap_order activa en una mesa
CREATE OR REPLACE FUNCTION check_active_tap_order_by_table(
    p_table_number INTEGER,
    p_restaurant_id UUID
) RETURNS JSON AS $$
DECLARE
    v_table_id UUID;
    v_tap_order_id UUID;
    v_result JSON;
BEGIN
    -- Obtener table_id
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number AND restaurant_id = p_restaurant_id;

    IF v_table_id IS NULL THEN
        RETURN json_build_object(
            'hasOrder', false,
            'error', 'Table not found'
        );
    END IF;

    -- Buscar tap_order activa
    SELECT id INTO v_tap_order_id
    FROM tap_orders_and_pay
    WHERE table_id = v_table_id
    AND order_status IN ('active', 'confirmed', 'preparing')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_tap_order_id IS NOT NULL THEN
        -- Obtener resumen completo
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
                'restaurant_id', p_restaurant_id
            )
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Paso 8: Trigger para actualizar tap_order total cuando se modifica dish_order
CREATE OR REPLACE FUNCTION trigger_update_tap_order_total()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo ejecutar si tiene tap_order_id
    IF (TG_OP = 'DELETE' AND OLD.tap_order_id IS NOT NULL) THEN
        PERFORM update_tap_order_total(OLD.tap_order_id);
        RETURN OLD;
    ELSIF (TG_OP IN ('INSERT', 'UPDATE') AND NEW.tap_order_id IS NOT NULL) THEN
        PERFORM update_tap_order_total(NEW.tap_order_id);
        RETURN NEW;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Crear triggers
DROP TRIGGER IF EXISTS trigger_dish_order_update_tap_total ON dish_order;
CREATE TRIGGER trigger_dish_order_update_tap_total
    AFTER INSERT OR UPDATE OR DELETE ON dish_order
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_tap_order_total();

-- Comentarios para documentación
COMMENT ON COLUMN dish_order.tap_order_id IS 'Referencia a tap_orders_and_pay para vincular platillos con sesión Tap Order (NULL para Flex-Bill)';
COMMENT ON FUNCTION create_tap_order_with_first_dish IS 'Crea tap_order y primer dish_order en una transacción';
COMMENT ON FUNCTION add_dish_to_existing_tap_order IS 'Agrega platillo adicional a tap_order existente';
COMMENT ON FUNCTION update_tap_order_total IS 'Recalcula total de tap_order basado en dish_orders asociados';
COMMENT ON FUNCTION get_tap_order_complete_summary IS 'Obtiene resumen completo de tap_order con platillos y datos de mesa usando JOINs';
COMMENT ON FUNCTION check_active_tap_order_by_table IS 'Verifica si existe tap_order activa en una mesa específica';