-- ===============================================
-- LIMPIAR FUNCIONES DUPLICADAS
-- ===============================================
-- Este script elimina todas las versiones anteriores de funciones
-- para evitar conflictos de sobrecarga (overloading)
--
-- EJECUTA ESTE SCRIPT PRIMERO, antes de add_restaurant_id_to_tables.sql

-- 1. Eliminar todas las versiones de open_table_order
DROP FUNCTION IF EXISTS open_table_order(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS open_table_order(INTEGER, INTEGER) CASCADE;

-- 2. Eliminar todas las versiones de create_dish_order
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER, VARCHAR, TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER, VARCHAR, TEXT[], JSONB) CASCADE;
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER, VARCHAR, TEXT[], JSONB, DECIMAL) CASCADE;
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER, VARCHAR, TEXT[], JSONB, DECIMAL, INTEGER) CASCADE;

-- 3. Eliminar todas las versiones de get_table_order_summary
DROP FUNCTION IF EXISTS get_table_order_summary(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_table_order_summary(INTEGER, INTEGER) CASCADE;

-- 4. Eliminar todas las versiones de pay_table_amount
DROP FUNCTION IF EXISTS pay_table_amount(INTEGER, DECIMAL) CASCADE;
DROP FUNCTION IF EXISTS pay_table_amount(INTEGER, DECIMAL, INTEGER) CASCADE;

-- 5. Eliminar todas las versiones de pay_dish_order
DROP FUNCTION IF EXISTS pay_dish_order(UUID) CASCADE;

-- 6. Eliminar todas las versiones de update_table_order_totals
DROP FUNCTION IF EXISTS update_table_order_totals() CASCADE;

-- 7. Eliminar todas las versiones de add_user_to_order
DROP FUNCTION IF EXISTS add_user_to_order(UUID, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS add_user_to_order(UUID, VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS add_user_to_order(UUID, VARCHAR, VARCHAR, VARCHAR) CASCADE;

-- 8. Eliminar todas las versiones de close_table_order_if_paid
DROP FUNCTION IF EXISTS close_table_order_if_paid(UUID) CASCADE;

-- 9. Verificar que las funciones fueron eliminadas
SELECT
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
    'open_table_order',
    'create_dish_order',
    'get_table_order_summary',
    'pay_table_amount',
    'pay_dish_order',
    'update_table_order_totals',
    'add_user_to_order',
    'close_table_order_if_paid'
)
ORDER BY routine_name;

-- Si la consulta anterior NO devuelve ninguna fila, todo está limpio
-- y puedes proceder a ejecutar add_restaurant_id_to_tables.sql

-- ===============================================
-- INSTRUCCIONES
-- ===============================================
-- 1. Ejecuta este script PRIMERO
-- 2. Verifica que la consulta final no devuelva ninguna fila
-- 3. Luego ejecuta add_restaurant_id_to_tables.sql
-- 4. Finalmente ejecuta: UPDATE tables SET restaurant_id = 1 WHERE restaurant_id IS NULL;
