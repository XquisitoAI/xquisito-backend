-- ====================================================
-- MIGRACIÓN: Remover status 'occupied' de Tap Orders
-- ====================================================
--
-- PROBLEMA ORIGINAL:
-- En el flujo tap-order-and-pay, cuando un usuario hacía un pedido,
-- la mesa se marcaba como 'occupied' pero NUNCA se liberaba.
-- Esto causaba que usuarios subsecuentes recibieran error:
-- "Mesa no disponible"
--
-- SOLUCIÓN:
-- Las mesas en tap-order-and-pay NO deben marcarse como 'occupied'
-- porque múltiples usuarios pueden pedir simultáneamente sin
-- "ocupar" físicamente la mesa.
--
-- IMPORTANTE:
-- Este cambio SOLO aplica a TAP-ORDER-AND-PAY.
-- El sistema FLEX-BILL sigue marcando mesas como occupied (correcto).
-- ====================================================

-- Paso 1: Liberar todas las mesas actualmente occupied por tap_orders
DO $$
DECLARE
    v_freed_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== LIBERANDO MESAS ATASCADAS POR TAP ORDERS ===';

    -- Liberar mesas que están occupied pero solo tienen órdenes tap completadas/abandonadas
    UPDATE tables t
    SET status = 'available',
        updated_at = NOW()
    WHERE t.status = 'occupied'
    AND NOT EXISTS (
        -- Verificar que NO hay órdenes tap activas
        SELECT 1
        FROM tap_orders_and_pay tap
        WHERE tap.table_id = t.id
        AND tap.order_status IN ('active', 'confirmed', 'preparing')
    )
    AND NOT EXISTS (
        -- Verificar que NO hay órdenes flex-bill activas
        SELECT 1
        FROM table_order tord
        WHERE tord.table_id = t.id
        AND tord.status IN ('not_paid', 'partial')
    );

    GET DIAGNOSTICS v_freed_count = ROW_COUNT;

    RAISE NOTICE '✅ Liberadas % mesas que estaban atascadas', v_freed_count;
END $$;

-- Paso 2: Aplicar fix a todas las funciones create_tap_order_with_first_dish
-- (Ya aplicado manualmente en los archivos SQL individuales)
-- Este script documenta el cambio para referencia

-- Función modificada en:
-- - adapt_tables_for_tap_order_simplified.sql
-- - update_tap_order_functions_with_missing_fields.sql
-- - fix_data_types_in_functions.sql
-- - fix_function_conflicts_and_update.sql
-- - fix_restaurant_id_type.sql
-- - implement_multi_user_per_table_logic.sql

-- Cambio aplicado (línea comentada):
-- -- UPDATE tables SET status = 'occupied' WHERE id = v_table_id; -- REMOVIDO

-- Paso 3: Verificación final
DO $$
DECLARE
    v_stuck_tap_count INTEGER;
    v_total_tap_active INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== VERIFICACIÓN POST-MIGRACIÓN ===';

    -- Contar órdenes tap activas
    SELECT COUNT(*) INTO v_total_tap_active
    FROM tap_orders_and_pay
    WHERE order_status IN ('active', 'confirmed', 'preparing');

    RAISE NOTICE 'Órdenes tap activas actualmente: %', v_total_tap_active;

    -- Verificar si quedan mesas atascadas
    SELECT COUNT(*) INTO v_stuck_tap_count
    FROM tables t
    WHERE t.status = 'occupied'
    AND NOT EXISTS (
        SELECT 1 FROM tap_orders_and_pay tap
        WHERE tap.table_id = t.id
        AND tap.order_status IN ('active', 'confirmed', 'preparing')
    )
    AND NOT EXISTS (
        SELECT 1 FROM table_order tord
        WHERE tord.table_id = t.id
        AND tord.status IN ('not_paid', 'partial')
    );

    IF v_stuck_tap_count > 0 THEN
        RAISE WARNING '⚠️  Aún hay % mesas occupied sin órdenes activas', v_stuck_tap_count;
        RAISE NOTICE 'Ejecuta nuevamente el Paso 1 para liberarlas';
    ELSE
        RAISE NOTICE '✅ No hay mesas atascadas. Migración exitosa!';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '=== COMPORTAMIENTO ESPERADO DESPUÉS DE ESTA MIGRACIÓN ===';
    RAISE NOTICE '• TAP-ORDER: Mesas permanecen "available" siempre';
    RAISE NOTICE '• FLEX-BILL: Mesas se marcan "occupied" (sin cambios)';
    RAISE NOTICE '• Múltiples usuarios pueden pedir en misma mesa (tap-order)';
    RAISE NOTICE '• Sin errores "Mesa no disponible" en tap-order';
END $$;

-- ====================================================
-- TESTING (Opcional - ejecutar en ambiente de desarrollo)
-- ====================================================

-- Test 1: Verificar que tap_order NO marca mesa como occupied
/*
-- Crear orden tap en mesa 999 (asegurarse de que esté available primero)
SELECT create_tap_order_with_first_dish(
    p_table_number := 999,
    p_restaurant_id := 'your-restaurant-uuid'::UUID,
    p_item := 'Test Item',
    p_price := 10.00,
    p_quantity := 1
);

-- Verificar que mesa sigue available
SELECT table_number, status
FROM tables
WHERE table_number = 999;
-- Expected: status = 'available' ✅
*/

-- Test 2: Verificar que múltiples usuarios pueden hacer pedidos
/*
-- Usuario A crea orden
SELECT create_tap_order_with_first_dish(
    p_table_number := 100,
    p_restaurant_id := 'your-restaurant-uuid'::UUID,
    p_item := 'Order A',
    p_price := 15.00
);

-- Usuario B crea segunda orden (NO debe fallar)
SELECT create_tap_order_with_first_dish(
    p_table_number := 100,
    p_restaurant_id := 'your-restaurant-uuid'::UUID,
    p_item := 'Order B',
    p_price := 20.00
);

-- Verificar que ambas órdenes existen
SELECT COUNT(*) as active_orders
FROM tap_orders_and_pay tap
JOIN tables t ON tap.table_id = t.id
WHERE t.table_number = 100
AND tap.order_status = 'active';
-- Expected: 2 órdenes activas ✅

-- Verificar que mesa sigue available
SELECT status FROM tables WHERE table_number = 100;
-- Expected: 'available' ✅
*/

-- ====================================================
-- ROLLBACK (Solo si es absolutamente necesario)
-- ====================================================
/*
-- ⚠️ ADVERTENCIA: No recomendado, esto reintroduce el bug
-- Si necesitas revertir, tendrás que editar manualmente las funciones SQL
-- para descomentar la línea:
-- UPDATE tables SET status = 'occupied' WHERE id = v_table_id;

-- Y luego marcar manualmente las mesas con órdenes activas:
UPDATE tables t
SET status = 'occupied'
WHERE EXISTS (
    SELECT 1 FROM tap_orders_and_pay tap
    WHERE tap.table_id = t.id
    AND tap.order_status IN ('active', 'confirmed', 'preparing')
);
*/

-- ====================================================
-- CHANGELOG
-- ====================================================
-- Fecha: 2025-11-03
-- Autor: Claude Code
-- Issue: Mesas nunca se liberan en tap-order-and-pay
-- Solución: Remover UPDATE status='occupied' de funciones tap_order
-- Archivos modificados:
--   - adapt_tables_for_tap_order_simplified.sql
--   - update_tap_order_functions_with_missing_fields.sql
--   - fix_data_types_in_functions.sql
--   - fix_function_conflicts_and_update.sql
--   - fix_restaurant_id_type.sql
--   - implement_multi_user_per_table_logic.sql
-- ====================================================
