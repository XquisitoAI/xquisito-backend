-- Fix simple: excluir usuarios guest que no son UUID válidos
-- Solo contar usuarios que tienen perfil real en la tabla profiles
-- 16 de diciembre 2024

CREATE OR REPLACE FUNCTION calculate_customer_segment_preview(
  p_restaurant_id INTEGER,
  p_filters JSONB
) RETURNS INTEGER AS $$
DECLARE
  customer_count INTEGER := 0;
  gender_filter TEXT;
  age_min INTEGER;
  age_max INTEGER;
BEGIN
  -- Extraer filtros del JSON
  gender_filter := p_filters->>'gender';

  -- Procesar filtro de edad
  CASE p_filters->>'age_range'
    WHEN '18-25' THEN age_min := 18; age_max := 25;
    WHEN '26-35' THEN age_min := 26; age_max := 35;
    WHEN '36-45' THEN age_min := 36; age_max := 45;
    WHEN '46-55' THEN age_min := 46; age_max := 55;
    WHEN '56+' THEN age_min := 56; age_max := 120;
    ELSE age_min := NULL; age_max := NULL;
  END CASE;

  -- Query principal para contar clientes
  -- Solo incluir usuarios que tienen perfil real (no guests)
  SELECT COUNT(DISTINCT p.id) INTO customer_count
  FROM profiles p
  LEFT JOIN (
    -- Subquery para calcular estadísticas del usuario
    SELECT
      user_stats.user_id,
      COUNT(user_stats.order_id) as visit_count,
      AVG(user_stats.total_amount) as average_ticket,
      MAX(user_stats.created_at) as last_visit_date
    FROM (
      -- Solo órdenes con user_id válido (UUID) de table_order
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

      UNION ALL

      -- Solo órdenes de tap con user_id válido (que no empiecen con 'guest')
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

      UNION ALL

      -- Solo órdenes de pick&go con user_id válido
      SELECT
        pt.user_id::UUID as user_id,
        pag.id as order_id,
        COALESCE(pt.total_amount_charged, 0) as total_amount,
        pag.created_at
      FROM pick_and_go_orders pag
      JOIN tables t ON pag.table_id = t.id
      LEFT JOIN payment_transactions pt ON pag.id = pt.id_pick_and_go_orders
      WHERE t.restaurant_id = p_restaurant_id
        AND pt.user_id IS NOT NULL
        AND pt.user_id NOT LIKE 'guest%'
    ) user_stats
    WHERE user_stats.user_id IS NOT NULL
    GROUP BY user_stats.user_id
  ) order_stats ON p.id = order_stats.user_id
  WHERE 1=1
    -- Filtrar por género
    AND (gender_filter = 'all' OR gender_filter IS NULL OR p.gender = gender_filter)
    -- Filtrar por edad
    AND (age_min IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) >= age_min)
    AND (age_max IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) <= age_max);

  -- TODO: Implementar filtros adicionales (visitas, ticket promedio, última visita)

  RETURN customer_count;
END;
$$ LANGUAGE plpgsql;