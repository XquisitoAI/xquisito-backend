-- =============================================
-- ACTUALIZAR CONSTRAINT PARA PICK & GO
-- Permite que payment_transactions tenga pick & go orders
-- =============================================
-- Ejecutar este script en Supabase SQL Editor
-- =============================================

-- 1. ELIMINAR CONSTRAINT ANTERIOR
-- =============================================

ALTER TABLE public.payment_transactions
DROP CONSTRAINT IF EXISTS chk_one_order_type;

-- 2. AGREGAR NUEVO CONSTRAINT CON PICK & GO
-- =============================================

ALTER TABLE public.payment_transactions
ADD CONSTRAINT chk_one_order_type CHECK (
    -- Solo una de las tres opciones debe estar presente
    (
        (id_table_order IS NOT NULL AND id_tap_orders_and_pay IS NULL AND id_pick_and_go_order IS NULL) OR
        (id_table_order IS NULL AND id_tap_orders_and_pay IS NOT NULL AND id_pick_and_go_order IS NULL) OR
        (id_table_order IS NULL AND id_tap_orders_and_pay IS NULL AND id_pick_and_go_order IS NOT NULL)
    )
);

-- 3. VERIFICACIÓN
-- =============================================

-- Ver el constraint actualizado
SELECT
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conname = 'chk_one_order_type';