-- ====================================================
-- Actualizar get_table_order_summary para incluir branch_number
-- ====================================================

-- Eliminar versiones antiguas para evitar conflictos
DROP FUNCTION IF EXISTS get_table_order_summary(INTEGER);
DROP FUNCTION IF EXISTS get_table_order_summary(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_table_order_summary(INTEGER, INTEGER, INTEGER);

-- ====================================================
-- Actualizar función get_table_order_summary
-- ====================================================
CREATE OR REPLACE FUNCTION get_table_order_summary(
    p_restaurant_id INTEGER,
    p_branch_number INTEGER,
    p_table_number INTEGER
)
RETURNS TABLE (
    table_order_id UUID,
    restaurant_id INTEGER,
    branch_number INTEGER,
    table_number INTEGER,
    status VARCHAR(20),
    total_amount DECIMAL(10,2),
    paid_amount DECIMAL(10,2),
    remaining_amount DECIMAL(10,2),
    no_items INTEGER,
    created_at TIMESTAMP
) AS $$
BEGIN
    -- Retornar resumen filtrando por restaurant_id y branch_number
    RETURN QUERY
    SELECT
        "to".id,
        b.restaurant_id,
        b.branch_number,
        t.table_number,
        "to".status,
        "to".total_amount,
        "to".paid_amount,
        "to".remaining_amount,
        "to".no_items,
        "to".created_at
    FROM table_order "to"
    JOIN tables t ON "to".table_id = t.id
    JOIN branches b ON t.branch_id = b.id
    WHERE t.table_number = p_table_number
    AND b.restaurant_id = p_restaurant_id
    AND b.branch_number = p_branch_number
    AND "to".status IN ('not_paid', 'partial')
    ORDER BY "to".created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- Comentarios
-- ====================================================
COMMENT ON FUNCTION get_table_order_summary IS 'Obtiene el resumen de la orden activa de una mesa, con soporte para restaurant_id y branch_number. Retorna información de totales, estado y número de items.';
