-- ============================================================
-- Flex Bill — Funciones de negocio
-- Servicio: Pago de cuenta en mesa (split bill)
-- Última verificación: 2026-05-14
-- ============================================================

-- UPDATE TABLE ORDER TOTALS
-- Recalcula total_amount, paid_amount, remaining_amount y status de table_order
-- cada vez que se inserta, actualiza o elimina un dish_order vinculado via user_order.
-- También llama a close_table_order_if_paid si el pago está completo.
CREATE OR REPLACE FUNCTION public.update_table_order_totals()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
    v_table_order_id UUID;
    v_total_amount DECIMAL(10,2);
    v_paid_from_items DECIMAL(10,2);
    v_paid_from_items_before DECIMAL(10,2);
    v_current_paid_amount DECIMAL(10,2);
    v_paid_by_amount DECIMAL(10,2) DEFAULT 0;
    v_final_paid_amount DECIMAL(10,2);
    v_no_items INTEGER;
BEGIN
    -- Resolver table_order_id a través de user_order
    IF TG_OP = 'DELETE' THEN
        SELECT uo.table_order_id INTO v_table_order_id
        FROM user_order uo WHERE uo.id = OLD.user_order_id;
    ELSE
        SELECT uo.table_order_id INTO v_table_order_id
        FROM user_order uo WHERE uo.id = NEW.user_order_id;
    END IF;

    -- Obtener paid_amount actual (incluye pagos por monto + por ítems)
    SELECT paid_amount INTO v_current_paid_amount
    FROM table_order WHERE id = v_table_order_id;

    -- Calcular totales de ítems (price + extra_price)
    SELECT
        COALESCE(SUM("do".quantity * ("do".price + COALESCE("do".extra_price, 0))), 0),
        COALESCE(SUM(CASE WHEN "do".payment_status = 'paid'
                     THEN "do".quantity * ("do".price + COALESCE("do".extra_price, 0))
                     ELSE 0 END), 0),
        COALESCE(SUM("do".quantity), 0)
    INTO v_total_amount, v_paid_from_items, v_no_items
    FROM dish_order "do"
    JOIN user_order uo ON "do".user_order_id = uo.id
    WHERE uo.table_order_id = v_table_order_id;

    -- Calcular cuánto estaba pagado por ítems antes de este trigger
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'not_paid' AND NEW.payment_status = 'paid' THEN
        v_paid_from_items_before := v_paid_from_items - (NEW.quantity * (NEW.price + COALESCE(NEW.extra_price, 0)));
    ELSE
        v_paid_from_items_before := v_paid_from_items;
    END IF;

    -- Pagos por "monto" (diferencia entre paid_amount actual y lo pagado por ítems antes)
    v_paid_by_amount := GREATEST(0, v_current_paid_amount - v_paid_from_items_before);

    -- paid_amount final = pagos por ítems + pagos por monto
    v_final_paid_amount := v_paid_from_items + v_paid_by_amount;

    UPDATE table_order
    SET
        total_amount     = v_total_amount,
        paid_amount      = v_final_paid_amount,
        remaining_amount = v_total_amount - v_final_paid_amount,
        no_items         = v_no_items,
        status = CASE
            WHEN v_final_paid_amount >= v_total_amount AND v_total_amount > 0 THEN 'paid'
            WHEN v_final_paid_amount > 0 THEN 'partial'
            ELSE 'not_paid'
        END
    WHERE id = v_table_order_id;

    -- Auto-cerrar cuenta si está totalmente pagada
    IF v_final_paid_amount > 0 AND v_final_paid_amount >= v_total_amount THEN
        PERFORM close_table_order_if_paid(v_table_order_id);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- CLOSE TABLE ORDER IF PAID
-- Cierra la orden, libera la mesa y limpia split_payments + active_table_users
CREATE OR REPLACE FUNCTION public.close_table_order_if_paid(p_table_order_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
    v_remaining_amount DECIMAL(10,2);
    v_table_id UUID;
    v_restaurant_id INTEGER;
    v_branch_number INTEGER;
    v_table_number INTEGER;
BEGIN
    SELECT "to".remaining_amount, "to".table_id, b.restaurant_id, b.branch_number, t.table_number
    INTO v_remaining_amount, v_table_id, v_restaurant_id, v_branch_number, v_table_number
    FROM table_order "to"
    JOIN tables t ON "to".table_id = t.id
    JOIN branches b ON t.branch_id = b.id
    WHERE "to".id = p_table_order_id;

    IF v_remaining_amount <= 0 THEN
        UPDATE table_order SET status = 'paid', closed_at = NOW() WHERE id = p_table_order_id;
        UPDATE tables SET status = 'available' WHERE id = v_table_id;

        DELETE FROM split_payments
        WHERE restaurant_id = v_restaurant_id
          AND branch_number  = v_branch_number
          AND table_number   = v_table_number;

        DELETE FROM active_table_users
        WHERE restaurant_id = v_restaurant_id
          AND branch_number  = v_branch_number
          AND table_number   = v_table_number;

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$;
