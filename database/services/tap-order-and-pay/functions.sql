-- ============================================================
-- Tap Order & Pay — Funciones de negocio
-- Servicio: El cliente ordena y paga desde su celular en mesa
-- Última verificación: 2026-05-14
-- ============================================================

-- UPDATE TAP ORDER TOTAL (función base, llamada por el trigger)
-- Recalcula total_amount de tap_orders_and_pay sumando todos sus dish_orders
CREATE OR REPLACE FUNCTION public.update_tap_order_total(p_tap_order_id uuid)
  RETURNS numeric
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
    v_total DECIMAL(10,2);
BEGIN
    SELECT COALESCE(SUM(quantity * (price + COALESCE(extra_price, 0))), 0)
    INTO v_total
    FROM dish_order
    WHERE tap_order_id = p_tap_order_id;

    UPDATE tap_orders_and_pay
    SET total_amount = v_total,
        updated_at  = NOW()
    WHERE id = p_tap_order_id;

    RETURN v_total;
END;
$function$;

-- TRIGGER WRAPPER — despacha update_tap_order_total en INSERT/UPDATE/DELETE de dish_order
CREATE OR REPLACE FUNCTION public.trigger_update_tap_order_total()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.tap_order_id IS NOT NULL THEN
        PERFORM update_tap_order_total(OLD.tap_order_id);
        RETURN OLD;
    ELSIF TG_OP IN ('INSERT', 'UPDATE') AND NEW.tap_order_id IS NOT NULL THEN
        PERFORM update_tap_order_total(NEW.tap_order_id);
        RETURN NEW;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- RELEASE TABLE ON ORDER COMPLETE
-- Libera la mesa cuando tap_orders_and_pay cambia a 'completed' o 'abandoned',
-- siempre que no haya otras órdenes activas en la misma mesa.
CREATE OR REPLACE FUNCTION public.release_table_on_order_complete()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
    v_table_id UUID;
    v_has_other_active_orders BOOLEAN;
BEGIN
    IF NEW.order_status IN ('completed', 'abandoned') AND
       (OLD.order_status IS NULL OR OLD.order_status NOT IN ('completed', 'abandoned')) THEN

        v_table_id := NEW.table_id;

        SELECT EXISTS (
            SELECT 1 FROM tap_orders_and_pay
            WHERE table_id = v_table_id
              AND id != NEW.id
              AND order_status IN ('active', 'confirmed', 'preparing')
        ) INTO v_has_other_active_orders;

        IF NOT v_has_other_active_orders THEN
            UPDATE tables
            SET status = 'available', updated_at = NOW()
            WHERE id = v_table_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
