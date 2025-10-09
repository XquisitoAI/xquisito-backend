-- ===============================================
-- SCRIPT DE DIAGNÓSTICO PARA PROBLEMAS DE PAID_AMOUNT
-- ===============================================
-- Ejecuta este script para diagnosticar por qué no se actualiza paid_amount

-- 1. Verificar que los triggers existen y están activos
SELECT
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'dish_order'
ORDER BY trigger_name;

-- Deberías ver 3 triggers:
-- - trigger_update_totals_on_dish_insert (AFTER INSERT)
-- - trigger_update_totals_on_dish_update (AFTER UPDATE)
-- - trigger_update_totals_on_dish_delete (AFTER DELETE)

-- 2. Verificar estructura de dish_order (debe tener columna extra_price)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'dish_order'
ORDER BY ordinal_position;

-- 3. Ver estado actual de una mesa específica
-- Reemplaza '1' con el número de tu mesa
SELECT
    t.table_number,
    t.restaurant_id,
    t.status as table_status,
    to_id.id as table_order_id,
    to_id.total_amount,
    to_id.paid_amount,
    to_id.remaining_amount,
    to_id.no_items,
    to_id.status as order_status
FROM tables t
LEFT JOIN table_order to_id ON to_id.table_id = t.id
WHERE t.table_number = 1
AND to_id.status IN ('not_paid', 'partial')
ORDER BY to_id.created_at DESC
LIMIT 1;

-- 4. Ver todos los dish_order de una mesa con cálculos manuales
-- Reemplaza '1' con el número de tu mesa
WITH active_table_order AS (
    SELECT to_id.id
    FROM tables t
    JOIN table_order to_id ON to_id.table_id = t.id
    WHERE t.table_number = 1
    AND to_id.status IN ('not_paid', 'partial')
    LIMIT 1
)
SELECT
    do_id.id as dish_order_id,
    do_id.item,
    do_id.quantity,
    do_id.price,
    do_id.extra_price,
    (do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0))) as total_price,
    do_id.payment_status,
    do_id.status as cooking_status
FROM dish_order do_id
JOIN user_order uo ON do_id.user_order_id = uo.id
JOIN active_table_order ato ON uo.table_order_id = ato.id
ORDER BY do_id.created_at;

-- 5. Calcular manualmente los totales que DEBERÍAN estar en table_order
-- Reemplaza '1' con el número de tu mesa
WITH active_table_order AS (
    SELECT to_id.id
    FROM tables t
    JOIN table_order to_id ON to_id.table_id = t.id
    WHERE t.table_number = 1
    AND to_id.status IN ('not_paid', 'partial')
    LIMIT 1
)
SELECT
    COUNT(do_id.id) as num_items,
    SUM(do_id.quantity) as total_quantity,
    SUM(do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0))) as calculated_total_amount,
    SUM(CASE
        WHEN do_id.payment_status = 'paid'
        THEN do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0))
        ELSE 0
    END) as calculated_paid_amount,
    SUM(CASE
        WHEN do_id.payment_status = 'not_paid'
        THEN do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0))
        ELSE 0
    END) as calculated_remaining_amount
FROM dish_order do_id
JOIN user_order uo ON do_id.user_order_id = uo.id
JOIN active_table_order ato ON uo.table_order_id = ato.id;

-- 6. Comparar valores calculados vs valores en table_order
-- Reemplaza '1' con el número de tu mesa
WITH active_table_order AS (
    SELECT to_id.id
    FROM tables t
    JOIN table_order to_id ON to_id.table_id = t.id
    WHERE t.table_number = 1
    AND to_id.status IN ('not_paid', 'partial')
    LIMIT 1
),
calculated AS (
    SELECT
        SUM(do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0))) as calc_total,
        SUM(CASE
            WHEN do_id.payment_status = 'paid'
            THEN do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0))
            ELSE 0
        END) as calc_paid
    FROM dish_order do_id
    JOIN user_order uo ON do_id.user_order_id = uo.id
    JOIN active_table_order ato ON uo.table_order_id = ato.id
)
SELECT
    to_id.total_amount as stored_total,
    c.calc_total as calculated_total,
    (to_id.total_amount = c.calc_total) as total_matches,
    to_id.paid_amount as stored_paid,
    c.calc_paid as calculated_paid,
    (to_id.paid_amount = c.calc_paid) as paid_matches,
    to_id.remaining_amount as stored_remaining,
    (c.calc_total - c.calc_paid) as calculated_remaining,
    (to_id.remaining_amount = (c.calc_total - c.calc_paid)) as remaining_matches
FROM table_order to_id
CROSS JOIN calculated c
WHERE to_id.id IN (SELECT id FROM active_table_order);

-- ===============================================
-- INTERPRETACIÓN DE RESULTADOS:
-- ===============================================
-- Si en la consulta #6 ves que:
-- - total_matches = false: El trigger no se ejecutó al insertar items
-- - paid_matches = false: El trigger no se ejecutó al pagar items
-- - remaining_matches = false: Los cálculos están incorrectos

-- SOLUCIÓN SI LOS TRIGGERS NO FUNCIONAN:
-- 1. Ejecuta el script add_restaurant_id_to_tables.sql completo
-- 2. Luego ejecuta este UPDATE manual para forzar la actualización:
/*
WITH active_table_order AS (
    SELECT to_id.id
    FROM tables t
    JOIN table_order to_id ON to_id.table_id = t.id
    WHERE t.table_number = 1
    AND to_id.status IN ('not_paid', 'partial')
    LIMIT 1
)
UPDATE table_order
SET
    total_amount = (
        SELECT SUM(do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0)))
        FROM dish_order do_id
        JOIN user_order uo ON do_id.user_order_id = uo.id
        WHERE uo.table_order_id = table_order.id
    ),
    paid_amount = (
        SELECT COALESCE(SUM(
            CASE
                WHEN do_id.payment_status = 'paid'
                THEN do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0))
                ELSE 0
            END
        ), 0)
        FROM dish_order do_id
        JOIN user_order uo ON do_id.user_order_id = uo.id
        WHERE uo.table_order_id = table_order.id
    ),
    remaining_amount = (
        SELECT SUM(do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0)))
        FROM dish_order do_id
        JOIN user_order uo ON do_id.user_order_id = uo.id
        WHERE uo.table_order_id = table_order.id
    ) - (
        SELECT COALESCE(SUM(
            CASE
                WHEN do_id.payment_status = 'paid'
                THEN do_id.quantity * (do_id.price + COALESCE(do_id.extra_price, 0))
                ELSE 0
            END
        ), 0)
        FROM dish_order do_id
        JOIN user_order uo ON do_id.user_order_id = uo.id
        WHERE uo.table_order_id = table_order.id
    )
WHERE id IN (SELECT id FROM active_table_order);
*/
