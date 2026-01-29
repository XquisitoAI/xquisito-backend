-- ============================================================
-- FUNCION: get_dashboard_metrics_all_services
-- ============================================================
-- Descripcion: Obtiene metricas del dashboard consolidando TODOS los servicios
-- Servicios incluidos: FlexBill, Pick&Go, Room Service, Tap Order, Tap Pay
--
-- A diferencia de get_dashboard_metrics (que solo usa FlexBill),
-- esta funcion utiliza payment_transactions como fuente principal
-- para consolidar ventas de todos los servicios.
--
-- Metricas incluidas:
--   - ventas_totales, propinas_totales, ingresos_totales
--   - total_transacciones (pagos realizados)
--   - total_ordenes (mesas/ordenes por servicio)
--   - total_pedidos (comensales individuales - solo difiere en FlexBill)
--   - ticket_promedio
--
-- Autor: Sistema Xquisito
-- Fecha: Enero 2026
-- Ultima modificacion: Enero 2026 - Agregado total_ordenes y total_pedidos
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics_all_services(
    p_restaurant_id integer DEFAULT NULL::integer,
    p_branch_id uuid DEFAULT NULL::uuid,
    p_start_date timestamp without time zone DEFAULT NULL::timestamp without time zone,
    p_end_date timestamp without time zone DEFAULT NULL::timestamp without time zone,
    p_granularity character varying DEFAULT 'dia'::character varying,
    p_service_type character varying DEFAULT NULL::character varying,
    p_gender character varying DEFAULT NULL::character varying,
    p_age_range character varying DEFAULT NULL::character varying
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    result JSONB;
    metrics JSONB;
    chart_data JSONB;
    top_item JSONB;
    services_breakdown JSONB;
    v_branch_number INTEGER;
    v_min_age INTEGER;
    v_max_age INTEGER;
    v_gender_enum gender_type;
    v_total_ordenes INTEGER;
    v_total_pedidos INTEGER;
BEGIN
    -- Obtener branch_number si se proporciono branch_id (UUID)
    IF p_branch_id IS NOT NULL THEN
        SELECT branch_number INTO v_branch_number
        FROM branches
        WHERE id = p_branch_id;
    END IF;

    -- Parsear el rango de edad
    IF p_age_range IS NOT NULL AND p_age_range != 'todos' THEN
        IF p_age_range = '46+' THEN
            v_min_age := 46;
            v_max_age := 150;
        ELSE
            v_min_age := SPLIT_PART(p_age_range, '-', 1)::INTEGER;
            v_max_age := SPLIT_PART(p_age_range, '-', 2)::INTEGER;
        END IF;
    END IF;

    -- Convertir genero de texto a enum
    IF p_gender IS NOT NULL AND p_gender != 'todos' THEN
        v_gender_enum := CASE
            WHEN p_gender = 'hombre' THEN 'male'::gender_type
            WHEN p_gender = 'mujer' THEN 'female'::gender_type
            WHEN p_gender = 'otro' THEN 'other'::gender_type
            ELSE NULL
        END;
    END IF;

    -- ============================================================
    -- METRICAS PRINCIPALES (desde payment_transactions)
    -- ============================================================
    WITH all_transactions AS (
        SELECT
            pt.id,
            pt.restaurant_id,
            pt.base_amount,
            pt.tip_amount,
            pt.total_amount_charged,
            pt.created_at,
            pt.user_id,
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
        SELECT at.*
        FROM all_transactions at
        LEFT JOIN profiles p ON (
            at.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND at.user_id::uuid = p.id
        )
        WHERE
            (p_branch_id IS NULL OR at.derived_branch_id = p_branch_id)
            AND (p_service_type IS NULL OR at.service_type = p_service_type)
            AND (
                p_gender IS NULL
                OR p_gender = 'todos'
                OR (
                    at.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND p.gender = v_gender_enum
                )
            )
            AND (
                p_age_range IS NULL
                OR p_age_range = 'todos'
                OR (
                    at.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND p.birth_date IS NOT NULL
                    AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) BETWEEN v_min_age AND v_max_age
                )
            )
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
    -- TOTAL ORDENES Y PEDIDOS (varia por servicio)
    -- FlexBill: ordenes = table_order (mesas), pedidos = user_order (comensales)
    -- Otros servicios: ordenes = pedidos (1:1)
    -- ============================================================
    WITH ordenes_flexbill AS (
        SELECT COUNT(*) as ordenes,
               (SELECT COUNT(*) FROM user_order uo
                JOIN table_order tord ON uo.table_order_id = tord.id
                JOIN tables t ON tord.table_id = t.id
                WHERE tord.status = 'paid'
                  AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
                  AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
                  AND (p_start_date IS NULL OR tord.created_at >= p_start_date)
                  AND (p_end_date IS NULL OR tord.created_at <= p_end_date)
               ) as pedidos
        FROM table_order tord
        JOIN tables t ON tord.table_id = t.id
        WHERE tord.status = 'paid'
          AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
          AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
          AND (p_start_date IS NULL OR tord.created_at >= p_start_date)
          AND (p_end_date IS NULL OR tord.created_at <= p_end_date)
    ),
    ordenes_tap_order AS (
        SELECT COUNT(*) as ordenes
        FROM tap_orders_and_pay tap
        JOIN tables t ON tap.table_id = t.id
        WHERE tap.payment_status = 'paid'
          AND (p_restaurant_id IS NULL OR t.restaurant_id = p_restaurant_id)
          AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
          AND (p_start_date IS NULL OR tap.created_at >= p_start_date)
          AND (p_end_date IS NULL OR tap.created_at <= p_end_date)
    ),
    ordenes_pick_go AS (
        SELECT COUNT(*) as ordenes
        FROM pick_and_go_orders pgo
        JOIN branches b ON pgo.restaurant_id = b.restaurant_id AND pgo.branch_number = b.branch_number
        WHERE pgo.payment_status = 'paid'
          AND (p_restaurant_id IS NULL OR pgo.restaurant_id = p_restaurant_id)
          AND (p_branch_id IS NULL OR b.id = p_branch_id)
          AND (p_start_date IS NULL OR pgo.created_at >= p_start_date)
          AND (p_end_date IS NULL OR pgo.created_at <= p_end_date)
    ),
    ordenes_room AS (
        SELECT COUNT(*) as ordenes
        FROM room_orders ro
        JOIN rooms r ON ro.room_id = r.id
        WHERE ro.payment_status = 'paid'
          AND (p_restaurant_id IS NULL OR r.restaurant_id = p_restaurant_id)
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
          AND (p_start_date IS NULL OR ro.created_at >= p_start_date)
          AND (p_end_date IS NULL OR ro.created_at <= p_end_date)
    ),
    ordenes_tap_pay AS (
        SELECT COUNT(*) as ordenes
        FROM tap_pay_orders tpo
        JOIN branches b ON tpo.restaurant_id = b.restaurant_id AND tpo.branch_number = b.branch_number
        WHERE tpo.payment_status = 'paid'
          AND (p_restaurant_id IS NULL OR tpo.restaurant_id = p_restaurant_id)
          AND (p_branch_id IS NULL OR b.id = p_branch_id)
          AND (p_start_date IS NULL OR tpo.created_at >= p_start_date)
          AND (p_end_date IS NULL OR tpo.created_at <= p_end_date)
    )
    SELECT
        CASE
            WHEN p_service_type = 'flexbill' THEN (SELECT ordenes FROM ordenes_flexbill)
            WHEN p_service_type = 'tap_order' THEN (SELECT ordenes FROM ordenes_tap_order)
            WHEN p_service_type = 'pick_and_go' THEN (SELECT ordenes FROM ordenes_pick_go)
            WHEN p_service_type = 'room_service' THEN (SELECT ordenes FROM ordenes_room)
            WHEN p_service_type = 'tap_pay' THEN (SELECT ordenes FROM ordenes_tap_pay)
            ELSE (
                (SELECT ordenes FROM ordenes_flexbill) +
                (SELECT ordenes FROM ordenes_tap_order) +
                (SELECT ordenes FROM ordenes_pick_go) +
                (SELECT ordenes FROM ordenes_room) +
                (SELECT ordenes FROM ordenes_tap_pay)
            )
        END,
        CASE
            WHEN p_service_type = 'flexbill' THEN (SELECT pedidos FROM ordenes_flexbill)
            WHEN p_service_type = 'tap_order' THEN (SELECT ordenes FROM ordenes_tap_order)
            WHEN p_service_type = 'pick_and_go' THEN (SELECT ordenes FROM ordenes_pick_go)
            WHEN p_service_type = 'room_service' THEN (SELECT ordenes FROM ordenes_room)
            WHEN p_service_type = 'tap_pay' THEN (SELECT ordenes FROM ordenes_tap_pay)
            ELSE (
                (SELECT pedidos FROM ordenes_flexbill) +
                (SELECT ordenes FROM ordenes_tap_order) +
                (SELECT ordenes FROM ordenes_pick_go) +
                (SELECT ordenes FROM ordenes_room) +
                (SELECT ordenes FROM ordenes_tap_pay)
            )
        END
    INTO v_total_ordenes, v_total_pedidos;

    -- Agregar ordenes y pedidos a metrics
    metrics := metrics || jsonb_build_object(
        'total_ordenes', COALESCE(v_total_ordenes, 0),
        'total_pedidos', COALESCE(v_total_pedidos, 0)
    );

    -- ============================================================
    -- DESGLOSE POR SERVICIO
    -- ============================================================
    WITH all_transactions AS (
        SELECT
            pt.base_amount,
            pt.user_id,
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
        SELECT at.*
        FROM all_transactions at
        LEFT JOIN profiles p ON (
            at.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND at.user_id::uuid = p.id
        )
        WHERE
            (p_branch_id IS NULL OR at.derived_branch_id = p_branch_id)
            AND (p_service_type IS NULL OR at.service_type = p_service_type)
            AND (
                p_gender IS NULL
                OR p_gender = 'todos'
                OR (
                    at.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND p.gender = v_gender_enum
                )
            )
            AND (
                p_age_range IS NULL
                OR p_age_range = 'todos'
                OR (
                    at.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND p.birth_date IS NOT NULL
                    AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) BETWEEN v_min_age AND v_max_age
                )
            )
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
    -- DATOS PARA GRAFICO (por granularidad)
    -- ============================================================
    WITH all_transactions AS (
        SELECT
            pt.base_amount,
            pt.created_at,
            pt.user_id,
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
        SELECT at.*
        FROM all_transactions at
        LEFT JOIN profiles p ON (
            at.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND at.user_id::uuid = p.id
        )
        WHERE
            (p_branch_id IS NULL OR at.derived_branch_id = p_branch_id)
            AND (p_service_type IS NULL OR at.service_type = p_service_type)
            AND (
                p_gender IS NULL
                OR p_gender = 'todos'
                OR (
                    at.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND p.gender = v_gender_enum
                )
            )
            AND (
                p_age_range IS NULL
                OR p_age_range = 'todos'
                OR (
                    at.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    AND p.birth_date IS NOT NULL
                    AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date)) BETWEEN v_min_age AND v_max_age
                )
            )
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
    -- ARTICULO MAS VENDIDO (desde dish_order, todos los servicios)
    -- FIX: Para FlexBill, el pago se hace a nivel de table_order,
    -- no de dish_order. Agregamos condicion OR para verificar table_order.status
    -- ============================================================
    WITH all_dish_orders AS (
        SELECT
            do1.item,
            do1.quantity,
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
        WHERE
            -- Caso 1: dish_order marcado como pagado directamente
            do1.payment_status = 'paid'
            -- Caso 2: FlexBill - el pago se hace a nivel de table_order
            OR (do1.user_order_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM user_order uo
                JOIN table_order tord ON uo.table_order_id = tord.id
                WHERE uo.id = do1.user_order_id AND tord.status = 'paid'
            ))
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
            'service_type', p_service_type,
            'gender', p_gender,
            'age_range', p_age_range
        ),
        'servicios_disponibles', jsonb_build_array('flexbill', 'tap_order', 'pick_and_go', 'room_service', 'tap_pay')
    );

    RETURN result;
END;
$function$;

-- ============================================================
-- EJEMPLOS DE USO
-- ============================================================

-- Todas las metricas de todos los servicios (sin filtros)
-- SELECT get_dashboard_metrics_all_services();

-- Filtrar por restaurante (muestra ordenes y pedidos de todos los servicios)
-- SELECT get_dashboard_metrics_all_services(p_restaurant_id := 3);

-- Filtrar solo FlexBill (ordenes != pedidos)
-- SELECT get_dashboard_metrics_all_services(
--     p_restaurant_id := 3,
--     p_service_type := 'flexbill'
-- );
-- Resultado: total_ordenes = 25 (mesas), total_pedidos = 1031 (comensales)

-- Filtrar Pick & Go (ordenes = pedidos, 1:1)
-- SELECT get_dashboard_metrics_all_services(
--     p_restaurant_id := 3,
--     p_service_type := 'pick_and_go'
-- );

-- ============================================================
-- METRICAS DEVUELTAS
-- ============================================================
-- metricas:
--   - ventas_totales: Suma de base_amount de payment_transactions
--   - propinas_totales: Suma de tip_amount
--   - ingresos_totales: Suma de total_amount_charged
--   - total_transacciones: Conteo de pagos realizados
--   - total_ordenes: Conteo de ordenes (table_order, tap_orders_and_pay, etc.)
--   - total_pedidos: Conteo de pedidos individuales (user_order para FlexBill, igual que ordenes para otros)
--   - ticket_promedio: Promedio de base_amount

-- ============================================================
-- DIFERENCIA ENTRE ORDENES Y PEDIDOS POR SERVICIO
-- ============================================================
-- | Servicio     | Ordenes                  | Pedidos                    |
-- |--------------|--------------------------|----------------------------|
-- | FlexBill     | table_order (mesas)      | user_order (comensales)    |
-- | Tap Order    | tap_orders_and_pay       | = ordenes (1:1)            |
-- | Pick & Go    | pick_and_go_orders       | = ordenes (1:1)            |
-- | Room Service | room_orders              | = ordenes (1:1)            |
-- | Tap Pay      | tap_pay_orders           | = ordenes (1:1)            |
