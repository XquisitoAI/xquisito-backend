-- ============================================================
-- Funciones de folio — numeración diaria por sucursal
-- Usadas como triggers BEFORE INSERT en cada tabla de orden
-- Última verificación: 2026-05-14
-- ============================================================

-- GENERATE DAILY FOLIO (overload 1: by branch_id uuid — versión principal)
-- Respeta horarios de apertura/cierre nocturnos para asignar el día de negocio correcto
CREATE OR REPLACE FUNCTION public.generate_daily_folio(p_branch_id uuid)
  RETURNS character varying
  LANGUAGE plpgsql
AS $function$
DECLARE
  v_now_local           TIMESTAMPTZ;
  v_current_date        DATE;
  v_current_min         INTEGER;
  v_yesterday_name      TEXT;
  v_opening_hours       JSONB;
  v_yesterday_open      TEXT;
  v_yesterday_close     TEXT;
  v_yesterday_open_min  INTEGER;
  v_yesterday_close_min INTEGER;
  v_today               DATE;
  v_next_number         INTEGER;
BEGIN
  v_now_local    := NOW() AT TIME ZONE 'America/Mexico_City';
  v_current_date := v_now_local::DATE;
  v_current_min  := EXTRACT(HOUR FROM v_now_local)::INTEGER * 60
                  + EXTRACT(MINUTE FROM v_now_local)::INTEGER;

  v_yesterday_name := LOWER(TRIM(TO_CHAR(v_now_local - INTERVAL '1 day', 'Day')));

  SELECT opening_hours INTO v_opening_hours
  FROM branches
  WHERE id = p_branch_id;

  v_yesterday_open  := v_opening_hours -> v_yesterday_name ->> 'open_time';
  v_yesterday_close := v_opening_hours -> v_yesterday_name ->> 'close_time';

  IF v_yesterday_open IS NOT NULL AND v_yesterday_close IS NOT NULL THEN
    v_yesterday_open_min  := SPLIT_PART(v_yesterday_open,  ':', 1)::INTEGER * 60
                           + SPLIT_PART(v_yesterday_open,  ':', 2)::INTEGER;
    v_yesterday_close_min := SPLIT_PART(v_yesterday_close, ':', 1)::INTEGER * 60
                           + SPLIT_PART(v_yesterday_close, ':', 2)::INTEGER;

    -- Si close < open en minutos → horario nocturno (cierra al día siguiente)
    -- Si además current_min < close_min → seguimos en el día de negocio de ayer
    IF v_yesterday_close_min < v_yesterday_open_min
       AND v_current_min < v_yesterday_close_min
    THEN
      v_today := v_current_date - INTERVAL '1 day';
    ELSE
      v_today := v_current_date;
    END IF;
  ELSE
    v_today := v_current_date;
  END IF;

  INSERT INTO order_daily_sequences (branch_id, sequence_date, last_folio_number)
  VALUES (p_branch_id, v_today, 1)
  ON CONFLICT (branch_id, sequence_date)
  DO UPDATE SET
    last_folio_number = order_daily_sequences.last_folio_number + 1,
    updated_at = NOW()
  RETURNING last_folio_number INTO v_next_number;

  RETURN LPAD(v_next_number::TEXT, 3, '0');
END;
$function$;

-- GENERATE DAILY FOLIO (overload 2: by restaurant_id integer — versión legacy)
CREATE OR REPLACE FUNCTION public.generate_daily_folio(p_restaurant_id integer)
  RETURNS character varying
  LANGUAGE plpgsql
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'America/Mexico_City' - INTERVAL '5 hours')::DATE;
  v_next_number INTEGER;
BEGIN
  INSERT INTO order_daily_sequences (restaurant_id, sequence_date, last_folio_number)
  VALUES (p_restaurant_id, v_today, 1)
  ON CONFLICT (restaurant_id, sequence_date)
  DO UPDATE SET
    last_folio_number = order_daily_sequences.last_folio_number + 1,
    updated_at = NOW()
  RETURNING last_folio_number INTO v_next_number;

  RETURN LPAD(v_next_number::TEXT, 3, '0');
END;
$function$;

-- TRIGGER FUNCTIONS — uno por servicio, todos resuelven branch_id y llaman generate_daily_folio

-- Flex Bill (table_order → lookup vía tables → branches)
CREATE OR REPLACE FUNCTION public.trigger_set_folio_table_order()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT b.id INTO v_branch_id
  FROM tables t
  JOIN branches b ON t.branch_id = b.id
  WHERE t.id = NEW.table_id;

  IF v_branch_id IS NOT NULL THEN
    NEW.folio := generate_daily_folio(v_branch_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Tap Order & Pay (tap_orders_and_pay → lookup vía tables → branches)
CREATE OR REPLACE FUNCTION public.trigger_set_folio_tap_orders()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT b.id INTO v_branch_id
  FROM tables t
  JOIN branches b ON t.branch_id = b.id
  WHERE t.id = NEW.table_id;

  IF v_branch_id IS NOT NULL THEN
    NEW.folio := generate_daily_folio(v_branch_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Tap & Pay (tap_pay_orders → lookup vía tables → branches)
CREATE OR REPLACE FUNCTION public.trigger_set_folio_tap_pay_orders()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT b.id INTO v_branch_id
  FROM tables t
  JOIN branches b ON t.branch_id = b.id
  WHERE t.id = NEW.table_id;

  IF v_branch_id IS NOT NULL THEN
    NEW.folio := generate_daily_folio(v_branch_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Pick & Go (pick_and_go_orders → lookup por restaurant_id + branch_number)
CREATE OR REPLACE FUNCTION public.trigger_set_folio_pick_and_go()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT id INTO v_branch_id
  FROM branches
  WHERE restaurant_id = NEW.restaurant_id
    AND branch_number  = NEW.branch_number;

  IF v_branch_id IS NOT NULL THEN
    NEW.folio := generate_daily_folio(v_branch_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Room Service (room_orders → lookup vía rooms → branches)
CREATE OR REPLACE FUNCTION public.trigger_set_folio_room_orders()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT b.id INTO v_branch_id
  FROM rooms r
  JOIN branches b ON r.branch_id = b.id
  WHERE r.id = NEW.room_id;

  IF v_branch_id IS NOT NULL THEN
    NEW.folio := generate_daily_folio(v_branch_id);
  END IF;
  RETURN NEW;
END;
$function$;
