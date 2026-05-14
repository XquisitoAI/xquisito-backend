-- ============================================================
-- Admin Portal — Funciones y triggers de soporte
-- Incluye funciones de branches, restaurants y utilidades del portal
-- Última verificación: 2026-05-14
-- ============================================================

-- GET USER ROLE — Devuelve el account_type del usuario desde profiles
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
    SELECT account_type::text
    FROM public.profiles
    WHERE id = user_id
    LIMIT 1;
$function$;

-- ── Restaurants ────────────────────────────────────────────

-- Valida y normaliza notification settings al insertar/actualizar restaurantes
CREATE OR REPLACE FUNCTION public.validate_notification_settings()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
    -- Si order_notifications está deshabilitado, deshabilitar email y sms
    IF NEW.order_notifications = false THEN
        NEW.email_notifications = false;
        NEW.sms_notifications = false;
    END IF;
    RETURN NEW;
END;
$function$;

-- Copia table_count del cliente al crear un restaurante vía pending_invitations
CREATE OR REPLACE FUNCTION public.sync_initial_table_count_from_client()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
    client_table_count INTEGER;
    client_id_found UUID;
BEGIN
    SELECT c.table_count, c.id INTO client_table_count, client_id_found
    FROM public.clients c
    JOIN public.pending_invitations pi ON c.id = pi.client_id
    JOIN public.user_admin_portal uap ON pi.email = uap.email
    WHERE uap.id = NEW.user_id
    AND pi.status = 'registered'
    LIMIT 1;

    IF client_id_found IS NOT NULL AND client_table_count > 0 THEN
        UPDATE public.restaurants
        SET table_count = client_table_count
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$function$;

-- Copia table_count y room_count del cliente al crear un restaurante con client_id
CREATE OR REPLACE FUNCTION public.sync_initial_room_count_from_client()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
    client_room_count INTEGER;
    client_table_count INTEGER;
BEGIN
    IF NEW.client_id IS NOT NULL THEN
        SELECT room_count, table_count
        INTO client_room_count, client_table_count
        FROM public.clients
        WHERE id = NEW.client_id;

        IF client_room_count IS NOT NULL OR client_table_count IS NOT NULL THEN
            UPDATE public.restaurants
            SET
                room_count  = COALESCE(client_room_count, 0),
                table_count = COALESCE(client_table_count, 0)
            WHERE id = NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ── Branches ───────────────────────────────────────────────

-- Calcula el total de habitaciones a partir de un array de rangos {start, end}
CREATE OR REPLACE FUNCTION public.calculate_rooms_from_ranges(room_ranges jsonb)
  RETURNS integer
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'public'
AS $function$
DECLARE
  total integer := 0;
  range_item jsonb;
BEGIN
  FOR range_item IN SELECT * FROM jsonb_array_elements(room_ranges)
  LOOP
    total := total + ((range_item->>'end')::integer - (range_item->>'start')::integer + 1);
  END LOOP;
  RETURN total;
END;
$function$;

-- Auto-incrementa branch_number por cliente al insertar una sucursal
CREATE OR REPLACE FUNCTION public.set_branch_number()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  SELECT COALESCE(MAX(branch_number), 0) + 1
  INTO NEW.branch_number
  FROM branches
  WHERE client_id = NEW.client_id;

  RETURN NEW;
END;
$function$;

-- Calcula rooms a partir de room_ranges si está definido
CREATE OR REPLACE FUNCTION public.auto_calculate_rooms()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.room_ranges IS NOT NULL AND jsonb_array_length(NEW.room_ranges) > 0 THEN
    NEW.rooms := calculate_rooms_from_ranges(NEW.room_ranges);
  END IF;
  RETURN NEW;
END;
$function$;

-- Crea mesas numeradas del 1 al N al insertar una sucursal
CREATE OR REPLACE FUNCTION public.auto_create_tables_on_branch_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  FOR i IN 1..NEW.tables LOOP
    INSERT INTO public.tables (
      table_number, status, restaurant_id, branch_id, created_at, updated_at
    ) VALUES (
      i, 'available',
      (SELECT r.id FROM public.restaurants r WHERE r.client_id = NEW.client_id LIMIT 1),
      NEW.id, NOW(), NOW()
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Sincroniza el número de mesas al actualizar branch.tables
-- Crea nuevas si aumentó, elimina las sobrantes (solo si están 'available')
CREATE OR REPLACE FUNCTION public.auto_update_tables_on_branch_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  current_table_count INTEGER;
  table_diff INTEGER;
  restaurant_id_val INTEGER;
BEGIN
  SELECT r.id INTO restaurant_id_val
  FROM public.restaurants r WHERE r.client_id = NEW.client_id LIMIT 1;

  SELECT COUNT(*) INTO current_table_count
  FROM public.tables WHERE branch_id = NEW.id;

  table_diff := NEW.tables - current_table_count;

  IF table_diff > 0 THEN
    FOR i IN (current_table_count + 1)..(current_table_count + table_diff) LOOP
      INSERT INTO public.tables (table_number, status, restaurant_id, branch_id, created_at, updated_at)
      VALUES (i, 'available', restaurant_id_val, NEW.id, NOW(), NOW());
    END LOOP;

  ELSIF table_diff < 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.tables
      WHERE branch_id = NEW.id AND table_number > NEW.tables AND status != 'available'
    ) THEN
      RAISE EXCEPTION 'No se pueden eliminar mesas que están ocupadas, reservadas o en mantenimiento';
    END IF;

    DELETE FROM public.tables
    WHERE branch_id = NEW.id AND table_number > NEW.tables;
  END IF;

  RETURN NEW;
END;
$function$;
