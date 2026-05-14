-- ============================================================
-- Payments — Funciones de validación y defaults
-- Usadas por payment_transactions y user/guest_payment_methods
-- Última verificación: 2026-05-14
-- ============================================================

-- VALIDATE PAYMENT TRANSACTION AMOUNTS
-- Verifica la consistencia matemática de todos los campos de comisión
-- antes de insertar o actualizar un payment_transaction.
CREATE OR REPLACE FUNCTION public.validate_payment_transaction_amounts()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
    -- subtotal_for_commission = base_amount + tip_amount
    IF ABS(NEW.subtotal_for_commission - (NEW.base_amount + NEW.tip_amount)) > 0.01 THEN
        RAISE EXCEPTION 'subtotal_for_commission debe ser igual a base_amount + tip_amount';
    END IF;

    -- iva_tip = tip_amount * 0.16
    IF ABS(NEW.iva_tip - (NEW.tip_amount * 0.16)) > 0.01 THEN
        RAISE EXCEPTION 'iva_tip debe ser 16%% de tip_amount';
    END IF;

    -- xquisito_client_charge = xquisito_commission_client + iva_xquisito_client
    IF ABS(NEW.xquisito_client_charge - (NEW.xquisito_commission_client + NEW.iva_xquisito_client)) > 0.01 THEN
        RAISE EXCEPTION 'xquisito_client_charge debe ser igual a comisión + IVA';
    END IF;

    -- total_amount_charged = base_amount + tip_amount + xquisito_client_charge
    IF ABS(NEW.total_amount_charged - (NEW.base_amount + NEW.tip_amount + NEW.xquisito_client_charge)) > 0.01 THEN
        RAISE EXCEPTION 'total_amount_charged debe ser base + propina + comisión cliente';
    END IF;

    -- restaurant_net_income = base_amount + tip_amount - xquisito_restaurant_charge
    IF ABS(NEW.restaurant_net_income - (NEW.base_amount + NEW.tip_amount - NEW.xquisito_restaurant_charge)) > 0.01 THEN
        RAISE EXCEPTION 'restaurant_net_income debe ser base + propina - comisión restaurante';
    END IF;

    -- xquisito_net_income = (xquisito_client_charge + xquisito_restaurant_charge) - ecart_commission_total
    IF ABS(NEW.xquisito_net_income - ((NEW.xquisito_client_charge + NEW.xquisito_restaurant_charge) - NEW.ecart_commission_total)) > 0.01 THEN
        RAISE EXCEPTION 'xquisito_net_income debe ser comisiones totales - comisión E-cart';
    END IF;

    RETURN NEW;
END;
$function$;

-- ENSURE SINGLE DEFAULT USER PAYMENT METHOD
-- Quita el flag is_default de otros métodos del mismo usuario al setear uno como default
CREATE OR REPLACE FUNCTION public.ensure_single_default_user_payment_method()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.is_default = true THEN
        IF NEW.user_id IS NOT NULL THEN
            UPDATE user_payment_methods
            SET is_default = false
            WHERE user_id = NEW.user_id AND id != NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- ENSURE SINGLE DEFAULT PAYMENT METHOD (alias — misma lógica)
CREATE OR REPLACE FUNCTION public.ensure_single_default_payment_method()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.is_default = true THEN
        IF NEW.user_id IS NOT NULL THEN
            UPDATE user_payment_methods
            SET is_default = false
            WHERE user_id = NEW.user_id AND id != NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- ENSURE SINGLE DEFAULT GUEST PAYMENT METHOD
-- Quita el flag is_default de otros métodos del mismo guest al setear uno como default
CREATE OR REPLACE FUNCTION public.ensure_single_default_guest_payment_method()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE guest_payment_methods
        SET is_default = false
        WHERE guest_id = NEW.guest_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$function$;
