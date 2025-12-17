-- Migración para tabla de segmentos de clientes
-- Crear tabla customer_segments

CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
  segment_name VARCHAR(255) NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}', -- Filtros aplicados como JSON
  active_filters_count INTEGER DEFAULT 0,
  estimated_customers INTEGER DEFAULT 0, -- Número estimado de clientes que coinciden
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Restricción única: evitar nombres duplicados de segmentos dentro del mismo restaurante
  UNIQUE(restaurant_id, segment_name)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_customer_segments_restaurant_id ON customer_segments(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customer_segments_created_at ON customer_segments(created_at DESC);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_customer_segments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_customer_segments_updated_at
    BEFORE UPDATE ON customer_segments
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_segments_updated_at();

-- Función para calcular datos de segmentación
CREATE OR REPLACE FUNCTION calculate_customer_segment_preview(
  p_restaurant_id INTEGER,
  p_filters JSONB
) RETURNS INTEGER AS $$
DECLARE
  customer_count INTEGER := 0;
  filter_gender TEXT;
  filter_age_range TEXT;
  filter_visits TEXT;
  filter_ticket TEXT;
  filter_last_visit TEXT;
  age_min INTEGER;
  age_max INTEGER;
BEGIN
  -- Extraer filtros del JSON
  filter_gender := p_filters->>'gender';
  filter_age_range := p_filters->>'age_range';
  filter_visits := p_filters->>'number_of_visits';
  filter_ticket := p_filters->>'single_purchase_total';
  filter_last_visit := p_filters->>'last_visit';

  -- Parsear rango de edad
  CASE filter_age_range
    WHEN '18-25' THEN age_min := 18; age_max := 25;
    WHEN '26-35' THEN age_min := 26; age_max := 35;
    WHEN '36-45' THEN age_min := 36; age_max := 45;
    WHEN '46-55' THEN age_min := 46; age_max := 55;
    WHEN '56+' THEN age_min := 56; age_max := 120;
    ELSE age_min := NULL; age_max := NULL;
  END CASE;

  -- Query principal para contar clientes
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
      -- Unir todas las fuentes de órdenes para el restaurante
      SELECT
        COALESCE(uo.user_id, pt.user_id::UUID) as user_id,
        t_order.id as order_id,
        COALESCE(pt.total_amount_charged, 0) as total_amount,
        t_order.created_at
      FROM table_order t_order
      LEFT JOIN user_order uo ON t_order.id = uo.table_order_id
      LEFT JOIN payment_transactions pt ON t_order.id = pt.id_table_order
      WHERE t_order.restaurant_id = p_restaurant_id

      UNION ALL

      SELECT
        pt.user_id::UUID as user_id,
        tap.id as order_id,
        COALESCE(pt.total_amount_charged, 0) as total_amount,
        tap.created_at
      FROM tap_orders_and_pay tap
      JOIN tables t ON tap.table_id = t.id
      LEFT JOIN payment_transactions pt ON tap.id = pt.id_tap_orders_and_pay
      WHERE t.restaurant_id = p_restaurant_id AND pt.user_id IS NOT NULL

      UNION ALL

      SELECT
        pt.user_id::UUID as user_id,
        pgo.id as order_id,
        COALESCE(pt.total_amount_charged, 0) as total_amount,
        pgo.created_at
      FROM pick_and_go_orders pgo
      LEFT JOIN payment_transactions pt ON pgo.id = pt.id_pick_and_go_order
      WHERE pt.restaurant_id = p_restaurant_id AND pt.user_id IS NOT NULL
    ) user_stats
    WHERE user_stats.user_id IS NOT NULL
    GROUP BY user_stats.user_id
  ) stats ON p.id = stats.user_id
  WHERE p.account_type = 'customer'
    -- Filtro de género
    AND (filter_gender = 'all' OR filter_gender IS NULL OR p.gender::TEXT = filter_gender)
    -- Filtro de edad
    AND (
      age_min IS NULL OR
      (p.birth_date IS NOT NULL AND EXTRACT(year FROM age(NOW(), p.birth_date)) BETWEEN age_min AND age_max)
    )
    -- Filtro de número de visitas
    AND (
      filter_visits = 'all' OR filter_visits IS NULL OR
      (filter_visits = '1' AND COALESCE(stats.visit_count, 0) = 1) OR
      (filter_visits = '2-5' AND COALESCE(stats.visit_count, 0) BETWEEN 2 AND 5) OR
      (filter_visits = 'more_than_5' AND COALESCE(stats.visit_count, 0) > 5) OR
      (filter_visits = 'more_than_10' AND COALESCE(stats.visit_count, 0) > 10)
    )
    -- Filtro de ticket promedio
    AND (
      filter_ticket = 'all' OR filter_ticket IS NULL OR
      (filter_ticket = 'less_than_200' AND COALESCE(stats.average_ticket, 0) < 200) OR
      (filter_ticket = '200-500' AND COALESCE(stats.average_ticket, 0) BETWEEN 200 AND 500) OR
      (filter_ticket = 'greater_than_500' AND COALESCE(stats.average_ticket, 0) > 500) OR
      (filter_ticket = 'greater_than_1000' AND COALESCE(stats.average_ticket, 0) > 1000)
    )
    -- Filtro de última visita
    AND (
      filter_last_visit = 'all' OR filter_last_visit IS NULL OR
      (filter_last_visit = 'last_7_days' AND stats.last_visit_date >= NOW() - INTERVAL '7 days') OR
      (filter_last_visit = 'last_30_days' AND stats.last_visit_date >= NOW() - INTERVAL '30 days') OR
      (filter_last_visit = 'last_90_days' AND stats.last_visit_date >= NOW() - INTERVAL '90 days') OR
      (filter_last_visit = 'more_than_90_days' AND (stats.last_visit_date < NOW() - INTERVAL '90 days' OR stats.last_visit_date IS NULL))
    );

  RETURN customer_count;
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON TABLE customer_segments IS 'Segmentos de clientes para campañas de rewards. Filtros: género, edad, visitas, ticket promedio, última visita.';
COMMENT ON COLUMN customer_segments.filters IS 'Filtros de segmentación: gender, age_range, number_of_visits, single_purchase_total, last_visit';
COMMENT ON COLUMN customer_segments.estimated_customers IS 'Número estimado de clientes que coinciden con los filtros del segmento';
COMMENT ON FUNCTION calculate_customer_segment_preview IS 'Calcula el número de clientes que coinciden con los filtros sin guardar el segmento';