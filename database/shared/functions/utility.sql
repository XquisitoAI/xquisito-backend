-- ============================================================
-- Funciones utilitarias — updated_at y helpers compartidos
-- Usadas por todas las tablas del proyecto
-- Última verificación: 2026-05-14
-- ============================================================

-- Generic updated_at trigger (usado por la mayoría de tablas)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Alias semántico usado por profiles y algunas tablas de auth
CREATE OR REPLACE FUNCTION public.handle_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- Menu tables updated_at
CREATE OR REPLACE FUNCTION public.update_menu_updated_at_column()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- active_tap_pay_users updated_at
CREATE OR REPLACE FUNCTION public.update_active_tap_pay_users_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- tap_orders_and_pay updated_at
CREATE OR REPLACE FUNCTION public.update_tap_orders_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- pick_and_go_orders updated_at
CREATE OR REPLACE FUNCTION public.update_pick_and_go_orders_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- split_payments updated_at
CREATE OR REPLACE FUNCTION public.update_split_payments_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$;

-- branch_printers updated_at
CREATE OR REPLACE FUNCTION public.update_branch_printers_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Recalcula totales del carrito al modificar cart_items
-- NOTA: unit_price ya llega con descuento aplicado desde el frontend;
--       no se vuelve a aplicar discount aquí para evitar doble descuento.
CREATE OR REPLACE FUNCTION public.update_cart_totals()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  v_cart_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_cart_id := OLD.cart_id;
  ELSE
    v_cart_id := NEW.cart_id;
  END IF;

  UPDATE carts
  SET
    total_items = (
      SELECT COALESCE(SUM(quantity), 0)
      FROM cart_items
      WHERE cart_id = v_cart_id
    ),
    total_amount = (
      SELECT COALESCE(SUM(
        quantity * (unit_price + COALESCE(extra_price, 0))
      ), 0)
      FROM cart_items
      WHERE cart_id = v_cart_id
    ),
    updated_at = NOW()
  WHERE id = v_cart_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
