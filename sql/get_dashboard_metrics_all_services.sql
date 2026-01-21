-- ============================================================
-- FUNCIÓN: get_dashboard_metrics_all_services
-- ============================================================
-- Descripción: Obtiene métricas del dashboard consolidando TODOS los servicios
-- Servicios incluidos: FlexBill, Pick&Go, Room Service, Tap Order, Tap Pay
--
-- A diferencia de get_dashboard_metrics (que solo usa FlexBill),
-- esta función utiliza payment_transactions como fuente principal
-- para consolidar ventas de todos los servicios.
--
-- Autor: Sistema Xquisito
-- Fecha: Enero 2026
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_metrics_all_services(
    p_restaurant_id INTEGER DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_granularity VARCHAR DEFAULT 'dia',
    p_service_type VARCHAR DEFAULT NULL  -- 'flexbill', 'tap_order', 'pick_and_go', 'room_service', 'tap_pay', o NULL para todos
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    metrics JSONB;
    chart_data JSONB;
    top_item JSONB;
    services_breakdown JSONB;
    v_branch_number INTEGER;
BEGIN
    -- Obtener branch_number si se proporcionó branch_id (UUID)
    IF p_branch_id IS NOT NULL THEN
        SELECT branch_number INTO v_branch_number
        FROM branches
        WHERE id = p_branch_id;
    END IF;

    -- ============================================================
    -- MÉTRICAS PRINCIPALES (desde payment_transactions)
    -- ============================================================
    WITH all_transactions AS (
        SELECT
            pt.id,
            pt.restaurant_id,
            pt.base_amount,
            pt.tip_amount,
            pt.total_amount_charged,
            pt.created_at,
            -- Determinar el servicio de origen
            CASE
                WHEN pt.id_table_order IS NOT NULL THEN 'flexbill'
                WHEN pt.id_tap_orders_and_pay IS NOT NULL THEN 'tap_order'
                WHEN pt.id_pick_and_go_order IS NOT NULL THEN 'pick_and_go'
                WHEN pt.id_room_order IS NOT NULL THEN 'room_service'
                WHEN pt.id_tap_pay_order IS NOT NULL THEN 'tap_pay'
                ELSE 'unknown'
            END as service_type,
            -- Obtener branch_id según el servicio
            CASE
                WHEN pt.id_table_order IS NOT NULL THEN (
                    SELECT t.branch_id FROM table_order tord
                    JOIN tables t ON tord.table_id = t.id
                    WHERE tord.id = pt.id_table_order
                )
                WHEN pt.id_tap_orders_and_pay IS NOT NULL THEN (
                    SELECT t.branch_id FROM tap_orders_and_pay tap
                    JOIN tables t ON tap.table_id = t.id
                    WHERE tap.id = pt.id_tap_orders_and_pay
                )
                WHEN pt.id_tap_pay_order IS NOT NULL THEN (
                    SELECT b.id FROM tap_pay_orders tpo
                    JOIN branches b ON tpo.restaurant_id = b.restaurant_id AND tpo.branch_number = b.branch_number
                    WHERE tpo.id = pt.id_tap_pay_order
                )
                WHEN pt.id_pick_and_go_order IS NOT NULL THEN (
                    SELECT b.id FROM pick_and_go_orders pgo
                    JOIN branches b ON pgo.restaurant_id = b.restaurant_id AND pgo.branch_number = b.branch_number
                    WHERE pgo.id = pt.id_pick_and_go_order
                )
                WHEN pt.id_room_order IS NOT NULL THEN (
                    SELECT r.branch_id FROM room_orders ro
                    JOIN rooms r ON ro.room_id = r.id
                    WHERE ro.id = pt.id_room_order
                )
                ELSE NULL
            END as derived_branch_id
        FROM payment_transactions pt
        WHERE
            (p_restaurant_id IS NULL OR pt.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR pt.created_at >= p_start_date)
            AND (p_end_date IS NULL OR pt.created_at <= p_end_date)
    ),
    filtered_transactions AS (
        SELECT * FROM all_transactions
        WHERE
            (p_branch_id IS NULL OR derived_branch_id = p_branch_id)
            AND (p_service_type IS NULL OR service_type = p_service_type)
    )
    SELECT jsonb_build_object(
        'ventas_totales', COALESCE(SUM(base_amount), 0),
        'propinas_totales', COALESCE(SUM(tip_amount), 0),
        'ingresos_totales', COALESCE(SUM(total_amount_charged), 0),
        'total_transacciones', COUNT(*),
        'ticket_promedio', COALESCE(ROUND(AVG(base_amount)::numeric, 2), 0)
    ) INTO metrics
    FROM filtered_transactions;

    -- ============================================================
    -- DESGLOSE POR SERVICIO
    -- ============================================================
    WITH all_transactions AS (
        SELECT
            pt.base_amount,
            CASE
                WHEN pt.id_table_order IS NOT NULL THEN 'flexbill'
                WHEN pt.id_tap_orders_and_pay IS NOT NULL THEN 'tap_order'
                WHEN pt.id_pick_and_go_order IS NOT NULL THEN 'pick_and_go'
                WHEN pt.id_room_order IS NOT NULL THEN 'room_service'
                WHEN pt.id_tap_pay_order IS NOT NULL THEN 'tap_pay'
                ELSE 'unknown'
            END as service_type,
            CASE
                WHEN pt.id_table_order IS NOT NULL THEN (
                    SELECT t.branch_id FROM table_order tord
                    JOIN tables t ON tord.table_id = t.id
                    WHERE tord.id = pt.id_table_order
                )
                WHEN pt.id_tap_orders_and_pay IS NOT NULL THEN (
                    SELECT t.branch_id FROM tap_orders_and_pay tap
                    JOIN tables t ON tap.table_id = t.id
                    WHERE tap.id = pt.id_tap_orders_and_pay
                )
                WHEN pt.id_tap_pay_order IS NOT NULL THEN (
                    SELECT b.id FROM tap_pay_orders tpo
                    JOIN branches b ON tpo.restaurant_id = b.restaurant_id AND tpo.branch_number = b.branch_number
                    WHERE tpo.id = pt.id_tap_pay_order
                )
                WHEN pt.id_pick_and_go_order IS NOT NULL THEN (
                    SELECT b.id FROM pick_and_go_orders pgo
                    JOIN branches b ON pgo.restaurant_id = b.restaurant_id AND pgo.branch_number = b.branch_number
                    WHERE pgo.id = pt.id_pick_and_go_order
                )
                WHEN pt.id_room_order IS NOT NULL THEN (
                    SELECT r.branch_id FROM room_orders ro
                    JOIN rooms r ON ro.room_id = r.id
                    WHERE ro.id = pt.id_room_order
                )
                ELSE NULL
            END as derived_branch_id
        FROM payment_transactions pt
        WHERE
            (p_restaurant_id IS NULL OR pt.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR pt.created_at >= p_start_date)
            AND (p_end_date IS NULL OR pt.created_at <= p_end_date)
    ),
    filtered_transactions AS (
        SELECT * FROM all_transactions
        WHERE
            (p_branch_id IS NULL OR derived_branch_id = p_branch_id)
            AND (p_service_type IS NULL OR service_type = p_service_type)
    ),
    service_stats AS (
        SELECT
            service_type,
            COALESCE(SUM(base_amount), 0) as total,
            COUNT(*) as transacciones
        FROM filtered_transactions
        GROUP BY service_type
    )
    SELECT jsonb_object_agg(
        service_type,
        jsonb_build_object(
            'ventas', total,
            'transacciones', transacciones
        )
    ) INTO services_breakdown
    FROM service_stats;

    -- ============================================================
    -- DATOS PARA GRÁFICO (por granularidad)
    -- ============================================================
    WITH all_transactions AS (
        SELECT
            pt.base_amount,
            pt.created_at,
            CASE
                WHEN pt.id_table_order IS NOT NULL THEN 'flexbill'
                WHEN pt.id_tap_orders_and_pay IS NOT NULL THEN 'tap_order'
                WHEN pt.id_pick_and_go_order IS NOT NULL THEN 'pick_and_go'
                WHEN pt.id_room_order IS NOT NULL THEN 'room_service'
                WHEN pt.id_tap_pay_order IS NOT NULL THEN 'tap_pay'
                ELSE 'unknown'
            END as service_type,
            CASE
                WHEN pt.id_table_order IS NOT NULL THEN (
                    SELECT t.branch_id FROM table_order tord
                    JOIN tables t ON tord.table_id = t.id
                    WHERE tord.id = pt.id_table_order
                )
                WHEN pt.id_tap_orders_and_pay IS NOT NULL THEN (
                    SELECT t.branch_id FROM tap_orders_and_pay tap
                    JOIN tables t ON tap.table_id = t.id
                    WHERE tap.id = pt.id_tap_orders_and_pay
                )
                WHEN pt.id_tap_pay_order IS NOT NULL THEN (
                    SELECT b.id FROM tap_pay_orders tpo
                    JOIN branches b ON tpo.restaurant_id = b.restaurant_id AND tpo.branch_number = b.branch_number
                    WHERE tpo.id = pt.id_tap_pay_order
                )
                WHEN pt.id_pick_and_go_order IS NOT NULL THEN (
                    SELECT b.id FROM pick_and_go_orders pgo
                    JOIN branches b ON pgo.restaurant_id = b.restaurant_id AND pgo.branch_number = b.branch_number
                    WHERE pgo.id = pt.id_pick_and_go_order
                )
                WHEN pt.id_room_order IS NOT NULL THEN (
                    SELECT r.branch_id FROM room_orders ro
                    JOIN rooms r ON ro.room_id = r.id
                    WHERE ro.id = pt.id_room_order
                )
                ELSE NULL
            END as derived_branch_id
        FROM payment_transactions pt
        WHERE
            (p_restaurant_id IS NULL OR pt.restaurant_id = p_restaurant_id)
            AND (p_start_date IS NULL OR pt.created_at >= p_start_date)
            AND (p_end_date IS NULL OR pt.created_at <= p_end_date)
    ),
    filtered_transactions AS (
        SELECT * FROM all_transactions
        WHERE
            (p_branch_id IS NULL OR derived_branch_id = p_branch_id)
            AND (p_service_type IS NULL OR service_type = p_service_type)
    ),
    time_series AS (
        SELECT
            CASE
                WHEN p_granularity = 'hora' THEN EXTRACT(HOUR FROM created_at)::INTEGER
                WHEN p_granularity = 'dia' THEN EXTRACT(DAY FROM created_at)::INTEGER
                WHEN p_granularity = 'mes' THEN EXTRACT(MONTH FROM created_at)::INTEGER
                WHEN p_granularity = 'ano' THEN EXTRACT(YEAR FROM created_at)::INTEGER
                ELSE EXTRACT(DAY FROM created_at)::INTEGER
            END as periodo,
            SUM(base_amount) as ingresos
        FROM filtered_transactions
        GROUP BY periodo
        ORDER BY periodo
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            CASE
                WHEN p_granularity = 'hora' THEN 'hora'
                WHEN p_granularity = 'dia' THEN 'dia'
                WHEN p_granularity = 'mes' THEN 'mes'
                WHEN p_granularity = 'ano' THEN 'ano'
                ELSE 'dia'
            END, periodo,
            'ingresos', COALESCE(ingresos, 0)
        )
        ORDER BY periodo
    ) INTO chart_data
    FROM time_series;

    -- ============================================================
    -- ARTÍCULO MÁS VENDIDO (desde dish_order, todos los servicios)
    -- ============================================================
    WITH all_dish_orders AS (
        SELECT
            do1.item,
            do1.quantity,
            -- Determinar servicio
            CASE
                WHEN do1.user_order_id IS NOT NULL THEN 'flexbill'
                WHEN do1.tap_order_id IS NOT NULL THEN 'tap_order'
                WHEN do1.tap_pay_order_id IS NOT NULL THEN 'tap_pay'
                WHEN do1.pick_and_go_order_id IS NOT NULL THEN 'pick_and_go'
                WHEN do1.room_order_id IS NOT NULL THEN 'room_service'
                ELSE 'unknown'
            END as service_type,
            CASE
                WHEN do1.user_order_id IS NOT NULL THEN (
                    SELECT t.branch_id FROM user_order uo
                    JOIN table_order tord ON uo.table_order_id = tord.id
                    JOIN tables t ON tord.table_id = t.id
                    WHERE uo.id = do1.user_order_id
                )
                WHEN do1.tap_order_id IS NOT NULL THEN (
                    SELECT t.branch_id FROM tap_orders_and_pay tap
                    JOIN tables t ON tap.table_id = t.id
                    WHERE tap.id = do1.tap_order_id
                )
                WHEN do1.tap_pay_order_id IS NOT NULL THEN (
                    SELECT b.id FROM tap_pay_orders tpo
                    JOIN branches b ON tpo.restaurant_id = b.restaurant_id AND tpo.branch_number = b.branch_number
                    WHERE tpo.id = do1.tap_pay_order_id
                )
                WHEN do1.pick_and_go_order_id IS NOT NULL THEN (
                    SELECT b.id FROM pick_and_go_orders pgo
                    JOIN branches b ON pgo.restaurant_id = b.restaurant_id AND pgo.branch_number = b.branch_number
                    WHERE pgo.id = do1.pick_and_go_order_id
                )
                WHEN do1.room_order_id IS NOT NULL THEN (
                    SELECT r.branch_id FROM room_orders ro
                    JOIN rooms r ON ro.room_id = r.id
                    WHERE ro.id = do1.room_order_id
                )
                ELSE NULL
            END as derived_branch_id,
            COALESCE(
                (SELECT t.restaurant_id FROM user_order uo
                 JOIN table_order tord ON uo.table_order_id = tord.id
                 JOIN tables t ON tord.table_id = t.id
                 WHERE uo.id = do1.user_order_id),
                (SELECT t.restaurant_id FROM tap_orders_and_pay tap
                 JOIN tables t ON tap.table_id = t.id
                 WHERE tap.id = do1.tap_order_id),
                (SELECT tpo.restaurant_id FROM tap_pay_orders tpo
                 WHERE tpo.id = do1.tap_pay_order_id),
                (SELECT pgo.restaurant_id FROM pick_and_go_orders pgo
                 WHERE pgo.id = do1.pick_and_go_order_id),
                (SELECT r.restaurant_id FROM room_orders ro
                 JOIN rooms r ON ro.room_id = r.id
                 WHERE ro.id = do1.room_order_id)
            ) as restaurant_id
        FROM dish_order do1
        WHERE do1.payment_status = 'paid'
    ),
    filtered_dishes AS (
        SELECT * FROM all_dish_orders
        WHERE
            (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
            AND (p_branch_id IS NULL OR derived_branch_id = p_branch_id)
            AND (p_service_type IS NULL OR service_type = p_service_type)
    ),
    top_items AS (
        SELECT
            item as nombre,
            SUM(quantity) as unidades_totales
        FROM filtered_dishes
        WHERE item IS NOT NULL
        GROUP BY item
        ORDER BY unidades_totales DESC
        LIMIT 1
    )
    SELECT jsonb_build_object(
        'nombre', COALESCE(nombre, 'Sin datos'),
        'unidades_vendidas', COALESCE(unidades_totales, 0)
    ) INTO top_item
    FROM top_items;

    -- Si no hay top_item, asignar valor por defecto
    IF top_item IS NULL THEN
        top_item := jsonb_build_object('nombre', 'Sin datos', 'unidades_vendidas', 0);
    END IF;

    -- ============================================================
    -- RESULTADO FINAL
    -- ============================================================
    result := jsonb_build_object(
        'metricas', metrics,
        'desglose_por_servicio', COALESCE(services_breakdown, '{}'::jsonb),
        'grafico', COALESCE(chart_data, '[]'::jsonb),
        'articulo_mas_vendido', top_item,
        'filtros_aplicados', jsonb_build_object(
            'restaurant_id', p_restaurant_id,
            'branch_id', p_branch_id,
            'start_date', p_start_date,
            'end_date', p_end_date,
            'granularity', p_granularity,
            'service_type', p_service_type
        ),
        'servicios_disponibles', jsonb_build_array('flexbill', 'tap_order', 'pick_and_go', 'room_service', 'tap_pay')
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- EJEMPLOS DE USO
-- ============================================================

-- Todas las métricas de todos los servicios (sin filtros)
-- SELECT get_dashboard_metrics_all_services();

-- Filtrar por restaurante
-- SELECT get_dashboard_metrics_all_services(p_restaurant_id := 1);

-- Filtrar por restaurante y sucursal
-- SELECT get_dashboard_metrics_all_services(
--     p_restaurant_id := 1,
--     p_branch_id := '14670b66-70d8-45ed-9d97-21efec9483c6'::uuid
-- );

-- Filtrar solo por servicio FlexBill
-- SELECT get_dashboard_metrics_all_services(
--     p_restaurant_id := 1,
--     p_service_type := 'flexbill'
-- );

-- Filtrar solo por Pick and Go
-- SELECT get_dashboard_metrics_all_services(
--     p_restaurant_id := 1,
--     p_service_type := 'pick_and_go'
-- );

-- Filtrar por rango de fechas y servicio específico
-- SELECT get_dashboard_metrics_all_services(
--     p_restaurant_id := 1,
--     p_start_date := '2025-01-01'::timestamp,
--     p_end_date := '2025-01-31'::timestamp,
--     p_granularity := 'dia',
--     p_service_type := 'tap_order'
-- );

-- ============================================================
-- PARÁMETROS
-- ============================================================
-- | Parámetro        | Tipo      | Default | Descripción                                    |
-- |------------------|-----------|---------|------------------------------------------------|
-- | p_restaurant_id  | INTEGER   | NULL    | ID del restaurante (NULL = todos)              |
-- | p_branch_id      | UUID      | NULL    | ID de la sucursal (NULL = todas)               |
-- | p_start_date     | TIMESTAMP | NULL    | Fecha inicio del rango                         |
-- | p_end_date       | TIMESTAMP | NULL    | Fecha fin del rango                            |
-- | p_granularity    | VARCHAR   | 'dia'   | 'hora', 'dia', 'mes', 'ano'                    |
-- | p_service_type   | VARCHAR   | NULL    | Servicio específico o NULL para todos          |

-- ============================================================
-- VALORES VÁLIDOS PARA p_service_type
-- ============================================================
-- 'flexbill'     - FlexBill (table_order -> user_order)
-- 'tap_order'    - Tap Order & Pay
-- 'pick_and_go'  - Pick and Go
-- 'room_service' - Room Service
-- 'tap_pay'      - Tap Pay
-- NULL           - Todos los servicios

-- ============================================================
-- COMPARACIÓN CON get_dashboard_metrics
-- ============================================================
-- | Característica              | get_dashboard_metrics | get_dashboard_metrics_all_services |
-- |-----------------------------|----------------------|-----------------------------------|
-- | Fuente de datos             | table_order          | payment_transactions              |
-- | Servicios incluidos         | Solo FlexBill        | Todos (5 servicios)               |
-- | Filtro por servicio         | No                   | Sí (p_service_type)               |
-- | Filtro demográfico          | Sí (gender, age)     | No                                |
-- | Desglose por servicio       | No                   | Sí                                |
-- | Propinas                    | No                   | Sí                                |
-- | Tiempo promedio mesa        | Sí                   | No (solo aplica a FlexBill)       |
