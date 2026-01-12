-- =====================================================
-- MIGRACIÓN: Triggers para gestión automática del estado de mesas
-- Descripción:
-- 1. Ocupar mesa cuando se crea una orden
-- 2. Liberar mesa cuando se completa/abandona la orden (si no hay otras activas)
-- Fecha: 2026-01-09
-- =====================================================

-- ===== FUNCIÓN 1: Ocupar mesa al crear orden =====
CREATE OR REPLACE FUNCTION occupy_table_on_tap_pay_order_create()
RETURNS TRIGGER AS $$
BEGIN
    -- Si la orden tiene una mesa asignada, marcarla como ocupada
    IF NEW.table_id IS NOT NULL THEN
        UPDATE tables
        SET status = 'occupied',
            updated_at = NOW()
        WHERE id = NEW.table_id
          AND status != 'occupied';  -- Solo si no está ya ocupada

        RAISE NOTICE 'Mesa % ocupada (orden Tap & Pay % creada)', NEW.table_id, NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===== FUNCIÓN 2: Liberar mesa al completar/abandonar orden =====
CREATE OR REPLACE FUNCTION release_table_on_tap_pay_order_complete()
RETURNS TRIGGER AS $$
DECLARE
    v_table_id UUID;
    v_has_other_active_orders BOOLEAN;
BEGIN
    -- Solo ejecutar cuando la orden cambia a 'completed', 'cancelled' o 'abandoned'
    IF NEW.order_status IN ('completed', 'cancelled', 'abandoned') AND
       (OLD.order_status IS NULL OR OLD.order_status NOT IN ('completed', 'cancelled', 'abandoned')) THEN

        -- Obtener el table_id de la orden
        v_table_id := NEW.table_id;

        IF v_table_id IS NOT NULL THEN
            -- Verificar si hay otras órdenes activas en la misma mesa
            SELECT EXISTS (
                SELECT 1
                FROM tap_pay_orders
                WHERE table_id = v_table_id
                AND id != NEW.id  -- Excluir la orden actual
                AND order_status IN ('active', 'confirmed', 'preparing', 'ready')
            ) INTO v_has_other_active_orders;

            -- Solo liberar la mesa si NO hay otras órdenes activas
            IF NOT v_has_other_active_orders THEN
                UPDATE tables
                SET status = 'available',
                    updated_at = NOW()
                WHERE id = v_table_id;

                RAISE NOTICE 'Mesa % liberada (orden Tap & Pay % completada/cancelada)', v_table_id, NEW.id;
            ELSE
                RAISE NOTICE 'Mesa % NO liberada - existen otras órdenes activas de Tap & Pay', v_table_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===== TRIGGER 1: Al CREAR una orden, ocupar mesa =====
DROP TRIGGER IF EXISTS trigger_occupy_table_on_tap_pay_order_create ON tap_pay_orders;
CREATE TRIGGER trigger_occupy_table_on_tap_pay_order_create
    AFTER INSERT ON tap_pay_orders
    FOR EACH ROW
    EXECUTE FUNCTION occupy_table_on_tap_pay_order_create();

-- ===== TRIGGER 2: Al COMPLETAR orden, liberar mesa si no hay otras activas =====
DROP TRIGGER IF EXISTS trigger_release_table_on_tap_pay_order_complete ON tap_pay_orders;
CREATE TRIGGER trigger_release_table_on_tap_pay_order_complete
    AFTER UPDATE ON tap_pay_orders
    FOR EACH ROW
    EXECUTE FUNCTION release_table_on_tap_pay_order_complete();

-- ===== COMENTARIOS =====
COMMENT ON FUNCTION occupy_table_on_tap_pay_order_create() IS
    'Marca la mesa como ocupada cuando se crea una orden de Tap & Pay';

COMMENT ON FUNCTION release_table_on_tap_pay_order_complete() IS
    'Libera la mesa cuando se completa/cancela una orden de Tap & Pay (solo si no hay otras órdenes activas)';
