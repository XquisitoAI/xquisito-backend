-- ====================================================
-- Actualizar open_table_order para incluir branch_number
-- ====================================================

-- Eliminar versiones antiguas para evitar conflictos
DROP FUNCTION IF EXISTS open_table_order(INTEGER);
DROP FUNCTION IF EXISTS open_table_order(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS open_table_order(INTEGER, INTEGER, INTEGER);

-- ====================================================
-- Actualizar función open_table_order
-- ====================================================
CREATE OR REPLACE FUNCTION open_table_order(
    p_table_number INTEGER,
    p_restaurant_id INTEGER DEFAULT NULL,
    p_branch_number INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_table_id UUID;
    v_order_id UUID;
BEGIN
    -- Buscar mesa filtrando por restaurant_id y branch_number
    SELECT t.id INTO v_table_id
    FROM tables t
    JOIN branches b ON t.branch_id = b.id
    WHERE t.table_number = p_table_number
    AND b.restaurant_id = p_restaurant_id
    AND b.branch_number = p_branch_number
    AND t.status = 'available';

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Mesa % no está disponible', p_table_number;
    END IF;

    -- Crear la orden de mesa (table_order ya tiene branch_number y restaurant_id por las migraciones)
    INSERT INTO table_order (table_id, status, restaurant_id, branch_number)
    VALUES (v_table_id, 'not_paid', p_restaurant_id, p_branch_number)
    RETURNING id INTO v_order_id;

    -- Cambiar estado de mesa a ocupada
    UPDATE tables SET status = 'occupied' WHERE id = v_table_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- Comentarios
-- ====================================================
COMMENT ON FUNCTION open_table_order IS 'Abre una nueva orden para una mesa, con soporte para restaurant_id y branch_number. Valida disponibilidad y actualiza el estado de la mesa.';
