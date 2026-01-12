-- =====================================================
-- STORED PROCEDURES PARA TAP & PAY
-- Descripción: Funciones para gestionar órdenes y pagos de Tap & Pay
-- Fecha: 2026-01-09
-- =====================================================

-- ===== FUNCIÓN: Obtener orden activa por mesa =====
CREATE OR REPLACE FUNCTION get_tap_pay_order_by_table(
    p_restaurant_id INTEGER,
    p_branch_number INTEGER,
    p_table_number INTEGER
)
RETURNS TABLE (
    order_id UUID,
    table_number INTEGER,
    restaurant_id INTEGER,
    branch_number INTEGER,
    total_amount DECIMAL,
    paid_amount DECIMAL,
    remaining_amount DECIMAL,
    payment_status VARCHAR,
    order_status VARCHAR,
    is_split_active BOOLEAN,
    split_method VARCHAR,
    number_of_splits INTEGER,
    created_at TIMESTAMPTZ,
    items JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id as order_id,
        t.table_number,
        o.restaurant_id,
        o.branch_number,
        o.total_amount,
        o.paid_amount,
        o.remaining_amount,
        o.payment_status,
        o.order_status,
        o.is_split_active,
        o.split_method,
        o.number_of_splits,
        o.created_at,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', d.id,
                        'item', d.item,
                        'quantity', d.quantity,
                        'price', d.price,
                        'extra_price', COALESCE(d.extra_price, 0),
                        'total_price', (d.price + COALESCE(d.extra_price, 0)) * d.quantity,
                        'status', d.status,
                        'payment_status', d.payment_status,
                        'images', d.images,
                        'custom_fields', d.custom_fields
                    )
                )
                FROM dish_order d
                WHERE d.tap_pay_order_id = o.id
            ),
            '[]'::jsonb
        ) as items
    FROM tap_pay_orders o
    JOIN tables t ON o.table_id = t.id
    WHERE o.restaurant_id = p_restaurant_id
      AND o.branch_number = p_branch_number
      AND t.table_number = p_table_number
      AND o.order_status IN ('active', 'confirmed', 'preparing', 'ready')
      AND o.payment_status IN ('pending', 'partial')
    ORDER BY o.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ===== FUNCIÓN: Obtener orden por ID =====
CREATE OR REPLACE FUNCTION get_tap_pay_order_by_id(p_order_id UUID)
RETURNS TABLE (
    order_id UUID,
    table_number INTEGER,
    restaurant_id INTEGER,
    branch_number INTEGER,
    total_amount DECIMAL,
    paid_amount DECIMAL,
    remaining_amount DECIMAL,
    payment_status VARCHAR,
    order_status VARCHAR,
    is_split_active BOOLEAN,
    split_method VARCHAR,
    number_of_splits INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    items JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id as order_id,
        t.table_number,
        o.restaurant_id,
        o.branch_number,
        o.total_amount,
        o.paid_amount,
        o.remaining_amount,
        o.payment_status,
        o.order_status,
        o.is_split_active,
        o.split_method,
        o.number_of_splits,
        o.created_at,
        o.updated_at,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', d.id,
                        'item', d.item,
                        'quantity', d.quantity,
                        'price', d.price,
                        'extra_price', COALESCE(d.extra_price, 0),
                        'total_price', (d.price + COALESCE(d.extra_price, 0)) * d.quantity,
                        'status', d.status,
                        'payment_status', d.payment_status,
                        'images', d.images,
                        'custom_fields', d.custom_fields
                    )
                )
                FROM dish_order d
                WHERE d.tap_pay_order_id = o.id
            ),
            '[]'::jsonb
        ) as items
    FROM tap_pay_orders o
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE o.id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- ===== FUNCIÓN: Crear orden de Tap & Pay =====
CREATE OR REPLACE FUNCTION create_tap_pay_order(
    p_restaurant_id INTEGER,
    p_branch_number INTEGER,
    p_table_number INTEGER,
    p_customer_name VARCHAR,
    p_customer_phone VARCHAR DEFAULT NULL,
    p_customer_email VARCHAR DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_guest_id VARCHAR DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_table_id UUID;
    v_subtotal DECIMAL := 0;
    v_tax DECIMAL := 0;
    v_total DECIMAL := 0;
    v_item JSONB;
BEGIN
    -- Obtener table_id
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number
      AND branch_id IN (
          SELECT id FROM branches
          WHERE restaurant_id = p_restaurant_id
            AND branch_number = p_branch_number
      )
    LIMIT 1;

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Mesa % no encontrada', p_table_number;
    END IF;

    -- Calcular totales de los items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_subtotal := v_subtotal + (
            (v_item->>'price')::DECIMAL *
            (v_item->>'quantity')::INTEGER
        );
    END LOOP;

    -- Calcular IVA (16%)
    v_tax := v_subtotal * 0.16;
    v_total := v_subtotal + v_tax;

    -- Crear orden
    INSERT INTO tap_pay_orders (
        restaurant_id,
        branch_number,
        table_id,
        customer_name,
        customer_phone,
        customer_email,
        user_id,
        guest_id,
        subtotal,
        tax,
        total_amount,
        paid_amount,
        remaining_amount,
        payment_status,
        order_status
    ) VALUES (
        p_restaurant_id,
        p_branch_number,
        v_table_id,
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_user_id,
        p_guest_id,
        v_subtotal,
        v_tax,
        v_total,
        0,
        v_total,
        'pending',
        'active'
    )
    RETURNING id INTO v_order_id;

    -- Insertar items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO dish_order (
            tap_pay_order_id,
            item,
            quantity,
            price,
            extra_price,
            status,
            payment_status,
            images,
            custom_fields
        ) VALUES (
            v_order_id,
            v_item->>'item',
            (v_item->>'quantity')::INTEGER,
            (v_item->>'price')::DECIMAL,
            COALESCE((v_item->>'extra_price')::DECIMAL, 0),
            COALESCE(v_item->>'status', 'delivered'),
            'not_paid',
            COALESCE((v_item->>'images')::TEXT[], ARRAY[]::TEXT[]),
            COALESCE(v_item->'custom_fields', '{}'::jsonb)
        );
    END LOOP;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- ===== FUNCIÓN: Actualizar monto pagado de orden =====
CREATE OR REPLACE FUNCTION update_tap_pay_order_paid_amount(
    p_order_id UUID,
    p_amount_to_add DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_new_paid_amount DECIMAL;
BEGIN
    UPDATE tap_pay_orders
    SET paid_amount = paid_amount + p_amount_to_add
    WHERE id = p_order_id
    RETURNING paid_amount INTO v_new_paid_amount;

    IF v_new_paid_amount IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ===== FUNCIÓN: Completar orden si está totalmente pagada =====
CREATE OR REPLACE FUNCTION check_and_complete_tap_pay_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_payment_status VARCHAR;
BEGIN
    SELECT payment_status INTO v_payment_status
    FROM tap_pay_orders
    WHERE id = p_order_id;

    IF v_payment_status = 'paid' THEN
        UPDATE tap_pay_orders
        SET order_status = 'completed',
            completed_at = NOW()
        WHERE id = p_order_id
          AND order_status != 'completed';

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_tap_pay_order_by_table IS 'Obtiene la orden activa de Tap & Pay para una mesa específica';
COMMENT ON FUNCTION get_tap_pay_order_by_id IS 'Obtiene una orden de Tap & Pay por su ID con todos sus detalles';
COMMENT ON FUNCTION create_tap_pay_order IS 'Crea una nueva orden de Tap & Pay con sus items';
COMMENT ON FUNCTION update_tap_pay_order_paid_amount IS 'Actualiza el monto pagado de una orden';
COMMENT ON FUNCTION check_and_complete_tap_pay_order IS 'Verifica si la orden está completamente pagada y la marca como completada';
