-- ============================================================
-- Tap & Pay — Funciones de negocio
-- Servicio: El cliente paga la cuenta del POS desde su celular
-- Última verificación: 2026-05-14
-- ============================================================

-- UPDATE TAP PAY REMAINING AMOUNT
-- Recalcula remaining_amount y actualiza payment_status según paid_amount vs total_amount.
-- Ejecutado como BEFORE INSERT OR UPDATE en tap_pay_orders.
CREATE OR REPLACE FUNCTION public.update_tap_pay_remaining_amount()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.remaining_amount = GREATEST(NEW.total_amount - NEW.paid_amount, 0);

  IF NEW.paid_amount >= NEW.total_amount THEN
    NEW.payment_status = 'paid';
  ELSIF NEW.paid_amount > 0 THEN
    NEW.payment_status = 'partial';
  ELSE
    NEW.payment_status = 'pending';
  END IF;

  RETURN NEW;
END;
$function$;

-- OCCUPY TABLE ON TAP PAY ORDER CREATE
-- Marca la mesa como 'occupied' cuando se crea una nueva tap_pay_order.
CREATE OR REPLACE FUNCTION public.occupy_table_on_tap_pay_order_create()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.table_id IS NOT NULL THEN
        UPDATE tables
        SET status     = 'occupied',
            updated_at = NOW()
        WHERE id = NEW.table_id
          AND status != 'occupied';
    END IF;

    RETURN NEW;
END;
$function$;

-- RELEASE TABLE ON TAP PAY ORDER COMPLETE
-- Libera la mesa cuando la orden cambia a 'completed', 'cancelled' o 'abandoned',
-- siempre que no haya otras órdenes activas de Tap & Pay en la misma mesa.
CREATE OR REPLACE FUNCTION public.release_table_on_tap_pay_order_complete()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
    v_table_id UUID;
    v_has_other_active_orders BOOLEAN;
BEGIN
    IF NEW.order_status IN ('completed', 'cancelled', 'abandoned') AND
       (OLD.order_status IS NULL OR OLD.order_status NOT IN ('completed', 'cancelled', 'abandoned')) THEN

        v_table_id := NEW.table_id;

        IF v_table_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM tap_pay_orders
                WHERE table_id = v_table_id
                  AND id != NEW.id
                  AND order_status IN ('active', 'confirmed', 'preparing', 'ready')
            ) INTO v_has_other_active_orders;

            IF NOT v_has_other_active_orders THEN
                UPDATE tables
                SET status     = 'available',
                    updated_at = NOW()
                WHERE id = v_table_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
