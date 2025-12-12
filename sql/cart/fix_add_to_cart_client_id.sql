-- ====================================================
-- Fix: Actualizar add_to_cart para obtener client_id de branches
-- ====================================================

CREATE OR REPLACE FUNCTION add_to_cart(
  p_menu_item_id INTEGER,
  p_user_id UUID DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_quantity INTEGER DEFAULT 1,
  p_custom_fields JSONB DEFAULT '[]'::jsonb,
  p_extra_price DECIMAL(10,2) DEFAULT 0,
  p_restaurant_id INTEGER DEFAULT NULL,
  p_branch_number INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_cart_id UUID;
  v_cart_item_id UUID;
  v_menu_item RECORD;
  v_existing_item_id UUID;
  v_client_id UUID;
BEGIN
  -- Validación: debe tener user_id O guest_id (pero no ambos)
  IF (p_user_id IS NULL AND p_guest_id IS NULL) OR
     (p_user_id IS NOT NULL AND p_guest_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Must provide either user_id or guest_id, but not both';
  END IF;

  -- Obtener información del menu item (con validación de disponibilidad)
  SELECT id, name, description, image_url, price, discount, is_available
  INTO v_menu_item
  FROM menu_items
  WHERE id = p_menu_item_id AND is_available = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item % no encontrado o no disponible', p_menu_item_id;
  END IF;

  -- Obtener client_id de la tabla restaurants si tenemos restaurant_id
  IF p_restaurant_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id
    FROM restaurants
    WHERE id = p_restaurant_id;

    -- Si no se encuentra el client_id en restaurants, intentar obtenerlo de branches
    IF v_client_id IS NULL AND p_branch_number IS NOT NULL THEN
      SELECT client_id INTO v_client_id
      FROM branches
      WHERE branch_number = p_branch_number
      LIMIT 1;
    END IF;
  END IF;

  -- Buscar o crear carrito existente para este usuario/guest y restaurante
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id
    FROM carts
    WHERE user_id = p_user_id
      AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
      AND (p_branch_number IS NULL OR branch_number = p_branch_number)
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    SELECT id INTO v_cart_id
    FROM carts
    WHERE guest_id = p_guest_id
      AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
      AND (p_branch_number IS NULL OR branch_number = p_branch_number)
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Si no existe un carrito, crear uno nuevo
  IF v_cart_id IS NULL THEN
    INSERT INTO carts (user_id, guest_id, restaurant_id, branch_number, client_id)
    VALUES (p_user_id, p_guest_id, p_restaurant_id, p_branch_number, v_client_id)
    RETURNING id INTO v_cart_id;
  END IF;

  -- Verificar si ya existe este item con las mismas customizaciones
  SELECT id INTO v_existing_item_id
  FROM cart_items
  WHERE cart_id = v_cart_id
    AND menu_item_id = p_menu_item_id
    AND custom_fields = p_custom_fields
    AND extra_price = p_extra_price;

  -- Si existe, incrementar cantidad
  IF v_existing_item_id IS NOT NULL THEN
    UPDATE cart_items
    SET quantity = quantity + p_quantity,
        updated_at = NOW()
    WHERE id = v_existing_item_id;

    RETURN v_existing_item_id;
  ELSE
    -- Si no existe, insertar nuevo item
    INSERT INTO cart_items (
      cart_id, menu_item_id, item_name, item_description,
      item_images, item_features, quantity, unit_price,
      discount, extra_price, custom_fields
    )
    VALUES (
      v_cart_id, v_menu_item.id, v_menu_item.name, v_menu_item.description,
      CASE WHEN v_menu_item.image_url IS NOT NULL
           THEN ARRAY[v_menu_item.image_url]
           ELSE ARRAY[]::TEXT[] END,
      ARRAY[]::TEXT[],  -- features se puede llenar desde el frontend
      p_quantity, v_menu_item.price,
      v_menu_item.discount, p_extra_price, p_custom_fields
    )
    RETURNING id INTO v_cart_item_id;

    RETURN v_cart_item_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION add_to_cart IS 'Agrega un item al carrito. Obtiene client_id de restaurants o branches según disponibilidad.';
