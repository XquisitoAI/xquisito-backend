-- ====================================================
-- Stored Procedures para Room Service
-- ====================================================

-- =============================================
-- 1. FUNCIÓN: Crear orden de habitación con primer platillo
-- =============================================

CREATE OR REPLACE FUNCTION create_room_order_with_first_dish(
  p_restaurant_id INTEGER,
  p_branch_number INTEGER,
  p_room_number INTEGER,
  p_item_name VARCHAR,
  p_quantity INTEGER,
  p_price DECIMAL,
  p_extra_price DECIMAL DEFAULT 0,
  p_customer_name VARCHAR DEFAULT NULL,
  p_customer_phone VARCHAR DEFAULT NULL,
  p_user_id VARCHAR DEFAULT NULL,
  p_images JSONB DEFAULT '[]'::jsonb,
  p_custom_fields JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON AS $$
DECLARE
  v_room_id UUID;
  v_room_order_id UUID;
  v_dish_order_id UUID;
  v_total_price DECIMAL;
  v_branch_id UUID;
  v_order_exists BOOLEAN := FALSE;
  v_result JSON;
  v_images_array TEXT[];  -- Variable para convertir JSONB a TEXT[]
BEGIN
  -- 1. Obtener branch_id desde branch_number
  -- Primero obtenemos el client_id del restaurante, luego buscamos la sucursal
  SELECT b.id INTO v_branch_id
  FROM branches b
  INNER JOIN restaurants r ON r.client_id = b.client_id
  WHERE b.branch_number = p_branch_number
    AND r.id = p_restaurant_id;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Sucursal % no encontrada para restaurante %',
      p_branch_number, p_restaurant_id;
  END IF;

  -- 2. Obtener room_id validando branch_id
  SELECT id INTO v_room_id
  FROM rooms
  WHERE room_number = p_room_number
    AND restaurant_id = p_restaurant_id
    AND branch_id = v_branch_id;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Habitación % no encontrada para restaurante % y sucursal %',
      p_room_number, p_restaurant_id, p_branch_number;
  END IF;

  -- 3. Verificar si ya existe una room_order activa para esta habitación
  SELECT id INTO v_room_order_id
  FROM room_orders
  WHERE room_id = v_room_id
    AND order_status IN ('pending', 'confirmed', 'preparing')
  ORDER BY created_at DESC
  LIMIT 1;

  -- 4. Si no existe room_order, crear una nueva
  IF v_room_order_id IS NULL THEN
    INSERT INTO room_orders (
      room_id,
      customer_name,
      customer_phone,
      user_id,
      total_amount,
      payment_status,
      order_status
    )
    VALUES (
      v_room_id,
      p_customer_name,
      p_customer_phone,
      p_user_id,
      0,
      'pending',
      'pending'
    )
    RETURNING id INTO v_room_order_id;
  ELSE
    v_order_exists := TRUE;
  END IF;

  -- 5. Calcular precio total del platillo (solo para retornar en JSON, NO se guarda en DB)
  v_total_price := (p_price + COALESCE(p_extra_price, 0)) * p_quantity;

  -- 6. Convertir JSONB array a TEXT array para images
  SELECT ARRAY(
    SELECT jsonb_array_elements_text(p_images)
  ) INTO v_images_array;

  -- 7. Crear dish_order (SIN total_price, esa columna no existe en dish_order)
  INSERT INTO dish_order (
    user_order_id,
    room_order_id,
    item,
    quantity,
    price,
    extra_price,
    images,
    custom_fields,
    status,
    payment_status
  )
  VALUES (
    NULL,
    v_room_order_id,
    p_item_name,
    p_quantity,
    p_price,
    COALESCE(p_extra_price, 0),
    v_images_array,  -- Usar TEXT[] convertido, no JSONB
    p_custom_fields,
    'pending',
    'not_paid'
  )
  RETURNING id INTO v_dish_order_id;

  -- 8. Recalcular total de room_order
  PERFORM recalculate_room_order_total(v_room_order_id);

  -- 9. Retornar resultado completo
  v_result := json_build_object(
    'room_order_id', v_room_order_id,
    'dish_order_id', v_dish_order_id,
    'room_id', v_room_id,
    'action', CASE
      WHEN v_order_exists THEN 'dish_added_to_existing_order'
      ELSE 'new_order_created_with_first_dish'
    END,
    'dish_details', json_build_object(
      'item', p_item_name,
      'quantity', p_quantity,
      'price', p_price,
      'extra_price', COALESCE(p_extra_price, 0),
      'total_dish_price', v_total_price,
      'images', p_images,
      'custom_fields', p_custom_fields
    )
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. FUNCIÓN: Obtener resumen de orden de habitación
-- =============================================

CREATE OR REPLACE FUNCTION get_room_order_summary(
  p_restaurant_id INTEGER,
  p_branch_number INTEGER,
  p_room_number INTEGER
)
RETURNS TABLE (
  room_order_id UUID,
  total_amount DECIMAL,
  no_items INTEGER,
  order_status VARCHAR,
  payment_status VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ro.id as room_order_id,
    ro.total_amount,
    COALESCE(COUNT(d.id), 0)::INTEGER as no_items,
    ro.order_status,
    ro.payment_status
  FROM rooms r
  JOIN room_orders ro ON ro.room_id = r.id
  LEFT JOIN dish_order d ON d.room_order_id = ro.id
  WHERE r.restaurant_id = p_restaurant_id
    AND r.room_number = p_room_number
    AND ro.order_status = 'pending'
  GROUP BY ro.id, ro.total_amount, ro.order_status, ro.payment_status
  ORDER BY ro.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. FUNCIÓN: Marcar dish order como pagado
-- =============================================

CREATE OR REPLACE FUNCTION mark_room_dish_as_paid(
  p_dish_order_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_room_order_id UUID;
BEGIN
  -- 1. Actualizar payment_status del dish
  UPDATE dish_order
  SET payment_status = 'paid',
      updated_at = NOW()
  WHERE id = p_dish_order_id
  RETURNING room_order_id INTO v_room_order_id;

  -- 2. Verificar si todos los dishes están pagados
  IF v_room_order_id IS NOT NULL THEN
    -- Verificar si todos los platillos están pagados
    IF NOT EXISTS (
      SELECT 1
      FROM dish_order
      WHERE room_order_id = v_room_order_id
        AND payment_status = 'not_paid'
    ) THEN
      -- Si todos están pagados, marcar room_order como paid
      UPDATE room_orders
      SET payment_status = 'paid',
          order_status = 'completed',
          updated_at = NOW()
      WHERE id = v_room_order_id;

      -- Marcar habitación como disponible
      UPDATE rooms
      SET status = 'available',
          updated_at = NOW()
      WHERE id = (
        SELECT room_id FROM room_orders WHERE id = v_room_order_id
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. FUNCIÓN: Recalcular total de room order
-- =============================================

CREATE OR REPLACE FUNCTION recalculate_room_order_total(
  p_room_order_id UUID
)
RETURNS DECIMAL AS $$
DECLARE
  v_new_total DECIMAL;
BEGIN
  -- Calcular nuevo total (sin columna total_price, calculamos on-the-fly)
  SELECT COALESCE(SUM((price + COALESCE(extra_price, 0)) * quantity), 0)
  INTO v_new_total
  FROM dish_order
  WHERE room_order_id = p_room_order_id;

  -- Actualizar room_order
  UPDATE room_orders
  SET total_amount = v_new_total,
      updated_at = NOW()
  WHERE id = p_room_order_id;

  RETURN v_new_total;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =============================================

COMMENT ON FUNCTION create_room_order_with_first_dish IS
'Crea o reutiliza una room_order activa y agrega el primer/siguiente platillo';

COMMENT ON FUNCTION get_room_order_summary IS
'Obtiene resumen de la orden activa de una habitación';

COMMENT ON FUNCTION mark_room_dish_as_paid IS
'Marca un platillo como pagado y cierra la orden si todos están pagados';

COMMENT ON FUNCTION recalculate_room_order_total IS
'Recalcula el total de una room_order basado en sus dish_orders';
