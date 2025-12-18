-- =====================================================
-- MIGRATION: Fix Segment Count - Show All Registered Users
-- Author: Claude Code Assistant
-- Date: 2025-12-18
-- Description: Corregir comportamiento para mostrar todos los clientes registrados
--
-- COMPORTAMIENTO ESPERADO:
--   - Sin filtros: TODOS los profiles registrados (comportamiento inicial del modal)
--   - Con filtros: Aplicar filtros sobre todos los profiles + estadísticas de órdenes
--
-- RAZÓN DEL CAMBIO:
--   - Al abrir el modal "Crear segmento" debe mostrar TODOS los clientes
--   - Solo cuando se aplican filtros específicos se reduce el número
--   - Los segmentos son para marketing a todos los clientes registrados
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_customer_segment_preview(
  p_restaurant_id INTEGER,
  p_filters JSONB
) RETURNS INTEGER AS $$
DECLARE
  customer_count INTEGER := 0;
  gender_filter TEXT;
  age_min INTEGER;
  age_max INTEGER;
  client_services JSONB;
  has_table_service BOOLEAN := FALSE;
  has_tap_service BOOLEAN := FALSE;
  has_pickgo_service BOOLEAN := FALSE;
  visits_min INTEGER;
  visits_max INTEGER;
  ticket_min NUMERIC;
  ticket_max NUMERIC;
  days_back INTEGER;
  has_active_filters BOOLEAN := FALSE;
BEGIN
  -- Extraer filtros del JSON
  gender_filter := p_filters->>'gender';

  -- Verificar si hay filtros activos (diferentes de 'all')
  IF (COALESCE(gender_filter, 'all') != 'all' OR
      COALESCE(p_filters->>'age_range', 'all') != 'all' OR
      COALESCE(p_filters->>'number_of_visits', 'all') != 'all' OR
      COALESCE(p_filters->>'single_purchase_total', 'all') != 'all' OR
      COALESCE(p_filters->>'last_visit', 'all') != 'all') THEN
    has_active_filters := TRUE;
  END IF;

  -- Debug: Mostrar estado de filtros
  RAISE NOTICE 'Filter analysis - has_active_filters: %, filters: %', has_active_filters, p_filters;

  -- ✅ COMPORTAMIENTO CORREGIDO: Sin filtros = TODOS los clientes registrados
  IF NOT has_active_filters THEN
    -- Mostrar TODOS los clientes registrados (comportamiento inicial del modal)
    -- Excluir solo usuarios guest
    SELECT COUNT(*) INTO customer_count
    FROM profiles p
    WHERE p.id::text NOT LIKE 'guest%';

    RAISE NOTICE 'Total registered customers (no filters): %', customer_count;
    RETURN customer_count;
  END IF;

  -- Si HAY filtros activos, obtener servicios y aplicar lógica completa
  SELECT c.services INTO client_services
  FROM restaurants r
  JOIN clients c ON r.client_id = c.id
  WHERE r.id = p_restaurant_id;

  -- Determinar servicios disponibles
  IF client_services IS NOT NULL THEN
    has_table_service := client_services ? 'flex-bill';
    has_tap_service := client_services ? 'tap-order-pay';
    has_pickgo_service := client_services ? 'pick-n-go';
  ELSE
    has_table_service := TRUE;
  END IF;

  RAISE NOTICE 'Services detected - table(flex-bill): %, tap(tap-order-pay): %, pickgo(pick-n-go): %',
    has_table_service, has_tap_service, has_pickgo_service;

  -- Procesar filtro de edad
  CASE p_filters->>'age_range'
    WHEN '18-25' THEN age_min := 18; age_max := 25;
    WHEN '26-35' THEN age_min := 26; age_max := 35;
    WHEN '36-45' THEN age_min := 36; age_max := 45;
    WHEN '46-55' THEN age_min := 46; age_max := 55;
    WHEN '56+' THEN age_min := 56; age_max := 120;
    ELSE age_min := NULL; age_max := NULL;
  END CASE;

  -- Procesar filtro de número de visitas
  CASE p_filters->>'number_of_visits'
    WHEN '1' THEN visits_min := 1; visits_max := 1;
    WHEN '2-5' THEN visits_min := 2; visits_max := 5;
    WHEN 'more_than_5' THEN visits_min := 6; visits_max := NULL;
    WHEN 'more_than_10' THEN visits_min := 11; visits_max := NULL;
    ELSE visits_min := NULL; visits_max := NULL;
  END CASE;

  -- Procesar filtro de ticket promedio
  CASE p_filters->>'single_purchase_total'
    WHEN 'less_than_200' THEN ticket_min := NULL; ticket_max := 199.99;
    WHEN '200-500' THEN ticket_min := 200; ticket_max := 500;
    WHEN 'greater_than_500' THEN ticket_min := 500.01; ticket_max := NULL;
    WHEN 'greater_than_1000' THEN ticket_min := 1000.01; ticket_max := NULL;
    ELSE ticket_min := NULL; ticket_max := NULL;
  END CASE;

  -- Procesar filtro de última visita
  CASE p_filters->>'last_visit'
    WHEN 'last_7_days' THEN days_back := 7;
    WHEN 'last_30_days' THEN days_back := 30;
    WHEN 'last_90_days' THEN days_back := 90;
    WHEN 'more_than_90_days' THEN days_back := -90;
    ELSE days_back := NULL;
  END CASE;

  -- ✅ NUEVA LÓGICA: Comenzar con TODOS los profiles y filtrar
  WITH user_stats AS (
    SELECT
      user_stats.user_id,
      COUNT(user_stats.order_id) as visit_count,
      AVG(user_stats.total_amount) as average_ticket,
      MAX(user_stats.created_at) as last_visit_date
    FROM (
      -- Table Service (flex-bill)
      SELECT
        uo.user_id as user_id,
        t_order.id as order_id,
        COALESCE(pt.total_amount_charged, 0) as total_amount,
        t_order.created_at
      FROM table_order t_order
      LEFT JOIN user_order uo ON t_order.id = uo.table_order_id
      LEFT JOIN payment_transactions pt ON t_order.id = pt.id_table_order
      WHERE t_order.restaurant_id = p_restaurant_id
        AND uo.user_id IS NOT NULL
        AND uo.user_id::text NOT LIKE 'guest%'
        AND has_table_service = TRUE

      UNION ALL

      -- Tap Service (tap-order-pay)
      SELECT
        pt.user_id::UUID as user_id,
        tap.id as order_id,
        COALESCE(pt.total_amount_charged, 0) as total_amount,
        tap.created_at
      FROM tap_orders_and_pay tap
      JOIN tables t ON tap.table_id = t.id
      LEFT JOIN payment_transactions pt ON tap.id = pt.id_tap_orders_and_pay
      WHERE t.restaurant_id = p_restaurant_id
        AND pt.user_id IS NOT NULL
        AND pt.user_id NOT LIKE 'guest%'
        AND has_tap_service = TRUE

      UNION ALL

      -- Pick & Go Service (pick-n-go)
      SELECT
        pt.user_id::UUID as user_id,
        pag.id as order_id,
        COALESCE(pt.total_amount_charged, 0) as total_amount,
        pag.created_at
      FROM pick_and_go_orders pag
      LEFT JOIN payment_transactions pt ON pag.id = pt.id_pick_and_go_order
      WHERE pag.restaurant_id = p_restaurant_id
        AND pt.user_id IS NOT NULL
        AND pt.user_id NOT LIKE 'guest%'
        AND has_pickgo_service = TRUE

    ) user_stats
    WHERE user_stats.user_id IS NOT NULL
    GROUP BY user_stats.user_id
  )
  SELECT COUNT(DISTINCT p.id) INTO customer_count
  FROM profiles p
  -- ✅ LEFT JOIN: Incluir usuarios sin órdenes pero filtrar por condiciones
  LEFT JOIN user_stats us ON p.id = us.user_id
  WHERE p.id::text NOT LIKE 'guest%'
    -- Filtros demográficos (aplicables a todos los profiles)
    AND (gender_filter = 'all' OR gender_filter IS NULL OR p.gender::text = gender_filter)
    AND (age_min IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) >= age_min)
    AND (age_max IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) <= age_max)
    -- Filtros de actividad (solo aplicar si el usuario tiene órdenes)
    AND (
      -- Si no hay filtros de actividad, incluir a todos
      (visits_min IS NULL AND ticket_min IS NULL AND ticket_max IS NULL AND days_back IS NULL)
      OR
      -- Si hay filtros de actividad, solo usuarios con órdenes que cumplan criterios
      (us.user_id IS NOT NULL AND
       (visits_min IS NULL OR us.visit_count >= visits_min) AND
       (visits_max IS NULL OR us.visit_count <= visits_max) AND
       (ticket_min IS NULL OR us.average_ticket >= ticket_min) AND
       (ticket_max IS NULL OR us.average_ticket <= ticket_max) AND
       (days_back IS NULL OR
        (days_back > 0 AND us.last_visit_date >= CURRENT_DATE - INTERVAL '1 day' * days_back) OR
        (days_back < 0 AND us.last_visit_date < CURRENT_DATE - INTERVAL '1 day' * ABS(days_back))
       ))
    );

  RAISE NOTICE 'Filtered customer count: %', customer_count;
  RETURN customer_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MIGRATION COMPLETED SUCCESSFULLY
-- =====================================================

-- ✅ COMPORTAMIENTO CORREGIDO:
-- 1. Sin filtros: Muestra TODOS los clientes registrados
-- 2. Con filtros demográficos: Filtra sobre todos los profiles
-- 3. Con filtros de actividad: Solo usuarios con órdenes que cumplan criterios
-- 4. Lógica consistente para campañas de marketing