-- ====================================================
-- Fix: Mejorar detección de duplicados en add_to_cart
-- Ahora detecta duplicados tanto sin custom_fields como con custom_fields idénticos
-- ====================================================

-- Función corregida para agregar item al carrito
CREATE OR REPLACE FUNCTION add_to_cart(
  p_menu_item_id INTEGER,
  p_user_id UUID DEFAULT NULL,
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
  v_cart_id := get_or_create_cart(p_user_id, p_guest_id, p_restaurant_id);

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

  -- Normalizar custom_fields a array vacío si es NULL
  p_custom_fields := COALESCE(p_custom_fields, '[]'::jsonb);

  -- Verificar si el item ya existe en el carrito con los mismos custom_fields
  -- Esto funciona tanto para arrays vacíos como para arrays con contenido
  SELECT id INTO v_cart_item_id
  FROM cart_items
  WHERE cart_id = v_cart_id
    AND menu_item_id = p_menu_item_id
    AND COALESCE(custom_fields, '[]'::jsonb) = p_custom_fields;

  IF v_cart_item_id IS NOT NULL THEN
    -- Ya existe con los mismos custom_fields, incrementar cantidad
    UPDATE cart_items
    SET quantity = quantity + p_quantity,
        updated_at = NOW()
    WHERE id = v_cart_item_id;

    RETURN v_cart_item_id;
  END IF;

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

  RETURN v_cart_item_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION add_to_cart IS 'Agrega un item al carrito o incrementa la cantidad si ya existe con los mismos custom_fields. Detecta duplicados tanto con arrays vacíos como con custom_fields idénticos.';
