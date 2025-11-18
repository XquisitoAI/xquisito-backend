-- ====================================================
-- Agregar restaurant_id a la tabla de carritos
-- Esto permite que cada carrito sea específico de un restaurante
-- ====================================================

-- Agregar columna restaurant_id a la tabla carts
ALTER TABLE carts
ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE;

-- Crear índice para optimizar búsquedas por restaurante
CREATE INDEX IF NOT EXISTS idx_carts_restaurant_id ON carts(restaurant_id);

-- Agregar comentario para documentación
COMMENT ON COLUMN carts.restaurant_id IS 'ID del restaurante al que pertenece el carrito (cada restaurante tiene carritos separados)';

-- ====================================================
-- ACTUALIZAR FUNCIONES EXISTENTES
-- ====================================================

-- Función actualizada para obtener o crear un carrito (con restaurant_id)
CREATE OR REPLACE FUNCTION get_or_create_cart(
  p_clerk_user_id VARCHAR(255) DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_restaurant_id INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Validar que se proporcione clerk_user_id O guest_id
  IF (p_clerk_user_id IS NULL AND p_guest_id IS NULL) THEN
    RAISE EXCEPTION 'Debe proporcionar clerk_user_id o guest_id';
  END IF;

  IF (p_clerk_user_id IS NOT NULL AND p_guest_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Solo puede proporcionar clerk_user_id O guest_id, no ambos';
  END IF;

  -- Buscar carrito existente y activo para este restaurante
  IF p_clerk_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id
    FROM carts
    WHERE clerk_user_id = p_clerk_user_id
      AND expires_at > NOW()
      AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    SELECT id INTO v_cart_id
    FROM carts
    WHERE guest_id = p_guest_id
      AND expires_at > NOW()
      AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Si no existe, crear uno nuevo
  IF v_cart_id IS NULL THEN
    INSERT INTO carts (clerk_user_id, guest_id, restaurant_id)
    VALUES (p_clerk_user_id, p_guest_id, p_restaurant_id)
    RETURNING id INTO v_cart_id;
  END IF;

  RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql;

-- Función actualizada para agregar item al carrito (con restaurant_id)
CREATE OR REPLACE FUNCTION add_to_cart(
  p_menu_item_id INTEGER,
  p_clerk_user_id VARCHAR(255) DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_quantity INTEGER DEFAULT 1,
  p_custom_fields JSONB DEFAULT '[]'::jsonb,
  p_extra_price DECIMAL(10,2) DEFAULT 0,
  p_restaurant_id INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_cart_id UUID;
  v_cart_item_id UUID;
  v_menu_item RECORD;
BEGIN
  -- Obtener o crear carrito para este restaurante
  v_cart_id := get_or_create_cart(p_clerk_user_id, p_guest_id, p_restaurant_id);

  -- Obtener datos completos del menu_item
  SELECT
    id,
    name,
    description,
    image_url,
    price,
    discount,
    is_available
  INTO v_menu_item
  FROM menu_items
  WHERE id = p_menu_item_id;

  IF v_menu_item.id IS NULL OR v_menu_item.is_available = false THEN
    RAISE EXCEPTION 'Item no disponible';
  END IF;

  -- Verificar si el item ya existe en el carrito (sin custom_fields)
  SELECT id INTO v_cart_item_id
  FROM cart_items
  WHERE cart_id = v_cart_id
    AND menu_item_id = p_menu_item_id
    AND custom_fields = '[]'::jsonb
    AND p_custom_fields = '[]'::jsonb;

  IF v_cart_item_id IS NOT NULL THEN
    -- Ya existe, incrementar cantidad
    UPDATE cart_items
    SET quantity = quantity + p_quantity,
        updated_at = NOW()
    WHERE id = v_cart_item_id;
  ELSE
    -- No existe, crear nuevo con todos los datos
    INSERT INTO cart_items (
      cart_id,
      menu_item_id,
      item_name,
      item_description,
      item_images,
      item_features,
      quantity,
      unit_price,
      discount,
      extra_price,
      custom_fields
    ) VALUES (
      v_cart_id,
      p_menu_item_id,
      v_menu_item.name,
      v_menu_item.description,
      CASE WHEN v_menu_item.image_url IS NOT NULL
           THEN ARRAY[v_menu_item.image_url]
           ELSE ARRAY[]::TEXT[] END,
      ARRAY[]::TEXT[],  -- features se puede llenar desde el frontend
      p_quantity,
      v_menu_item.price,
      v_menu_item.discount,
      p_extra_price,
      p_custom_fields
    ) RETURNING id INTO v_cart_item_id;
  END IF;

  RETURN v_cart_item_id;
END;
$$ LANGUAGE plpgsql;

-- Función actualizada para obtener el carrito completo (con restaurant_id)
CREATE OR REPLACE FUNCTION get_cart(
  p_clerk_user_id VARCHAR(255) DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_restaurant_id INTEGER DEFAULT NULL
) RETURNS TABLE (
  cart_id UUID,
  cart_item_id UUID,
  menu_item_id INTEGER,
  item_name TEXT,
  item_description TEXT,
  item_images TEXT[],
  item_features TEXT[],
  quantity INTEGER,
  unit_price DECIMAL(10,2),
  discount INTEGER,
  extra_price DECIMAL(10,2),
  custom_fields JSONB,
  subtotal DECIMAL(10,2),
  total_items INTEGER,
  total_amount DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as cart_id,
    ci.id as cart_item_id,
    ci.menu_item_id,
    ci.item_name,
    ci.item_description,
    ci.item_images,
    ci.item_features,
    ci.quantity,
    ci.unit_price,
    ci.discount,
    ci.extra_price,
    ci.custom_fields,
    (ci.quantity * (ci.unit_price * (100 - ci.discount) / 100 + COALESCE(ci.extra_price, 0))) as subtotal,
    c.total_items,
    c.total_amount
  FROM carts c
  LEFT JOIN cart_items ci ON c.id = ci.cart_id
  WHERE (
    (p_clerk_user_id IS NOT NULL AND c.clerk_user_id = p_clerk_user_id) OR
    (p_guest_id IS NOT NULL AND c.guest_id = p_guest_id)
  )
  AND (p_restaurant_id IS NULL OR c.restaurant_id = p_restaurant_id)
  AND c.expires_at > NOW()
  ORDER BY ci.created_at;
END;
$$ LANGUAGE plpgsql;

-- Función actualizada para limpiar el carrito completo (con restaurant_id)
CREATE OR REPLACE FUNCTION clear_cart(
  p_clerk_user_id VARCHAR(255) DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_restaurant_id INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Buscar el carrito para este restaurante
  IF p_clerk_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id
    FROM carts
    WHERE clerk_user_id = p_clerk_user_id
      AND expires_at > NOW()
      AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id);
  ELSE
    SELECT id INTO v_cart_id
    FROM carts
    WHERE guest_id = p_guest_id
      AND expires_at > NOW()
      AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id);
  END IF;

  IF v_cart_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Eliminar todos los items (esto también eliminará el carrito si es CASCADE)
  DELETE FROM cart_items WHERE cart_id = v_cart_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
