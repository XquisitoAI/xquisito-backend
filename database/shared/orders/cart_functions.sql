-- ============================================================
-- Cart — Funciones RPC compartidas
-- Usadas por Pick & Go, Tap Order & Pay, y otros servicios
-- Última verificación: 2026-05-14
-- ============================================================

-- ADD TO CART
-- Busca o crea un carrito activo para el usuario/guest y agrega o incrementa un ítem.
-- Usa el precio enviado desde el frontend (ya con descuento aplicado).
CREATE OR REPLACE FUNCTION public.add_to_cart(
  p_menu_item_id      integer,
  p_user_id           uuid    DEFAULT NULL::uuid,
  p_guest_id          varchar DEFAULT NULL::character varying,
  p_quantity          integer DEFAULT 1,
  p_custom_fields     jsonb   DEFAULT '[]'::jsonb,
  p_extra_price       numeric DEFAULT 0,
  p_price             numeric DEFAULT NULL::numeric,
  p_restaurant_id     integer DEFAULT NULL::integer,
  p_branch_number     integer DEFAULT NULL::integer,
  p_special_instructions text  DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_cart_id UUID;
  v_cart_item_id UUID;
  v_menu_item RECORD;
  v_existing_item_id UUID;
  v_client_id UUID;
  v_final_price DECIMAL(10,2);
BEGIN
  IF (p_user_id IS NULL AND p_guest_id IS NULL) OR
     (p_user_id IS NOT NULL AND p_guest_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Must provide either user_id or guest_id, but not both';
  END IF;

  SELECT id, name, description, image_url, price, discount, is_available
  INTO v_menu_item
  FROM menu_items
  WHERE id = p_menu_item_id AND is_available = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item % no encontrado o no disponible', p_menu_item_id;
  END IF;

  -- Precio ya viene con descuento del frontend; usar el de la BD como fallback
  v_final_price := COALESCE(p_price, v_menu_item.price);

  IF p_restaurant_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id FROM restaurants WHERE id = p_restaurant_id;

    IF v_client_id IS NULL AND p_branch_number IS NOT NULL THEN
      SELECT client_id INTO v_client_id FROM branches
      WHERE branch_number = p_branch_number LIMIT 1;
    END IF;
  END IF;

  -- Buscar carrito activo
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts
    WHERE user_id = p_user_id
      AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
      AND (p_branch_number IS NULL OR branch_number = p_branch_number)
      AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    SELECT id INTO v_cart_id FROM carts
    WHERE guest_id = p_guest_id
      AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
      AND (p_branch_number IS NULL OR branch_number = p_branch_number)
      AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_cart_id IS NULL THEN
    INSERT INTO carts (user_id, guest_id, restaurant_id, branch_number, client_id)
    VALUES (p_user_id, p_guest_id, p_restaurant_id, p_branch_number, v_client_id)
    RETURNING id INTO v_cart_id;
  END IF;

  -- Verificar si el ítem ya existe con mismas customizaciones
  SELECT id INTO v_existing_item_id
  FROM cart_items
  WHERE cart_id = v_cart_id
    AND menu_item_id = p_menu_item_id
    AND custom_fields = p_custom_fields
    AND extra_price = p_extra_price
    AND ((special_instructions IS NULL AND p_special_instructions IS NULL)
         OR special_instructions = p_special_instructions);

  IF v_existing_item_id IS NOT NULL THEN
    UPDATE cart_items
    SET quantity = quantity + p_quantity, updated_at = NOW()
    WHERE id = v_existing_item_id;
    RETURN v_existing_item_id;
  ELSE
    INSERT INTO cart_items (
      cart_id, menu_item_id, item_name, item_description,
      item_images, item_features, quantity, unit_price,
      discount, extra_price, custom_fields, special_instructions
    ) VALUES (
      v_cart_id, v_menu_item.id, v_menu_item.name, v_menu_item.description,
      CASE WHEN v_menu_item.image_url IS NOT NULL THEN ARRAY[v_menu_item.image_url] ELSE ARRAY[]::TEXT[] END,
      ARRAY[]::TEXT[],
      p_quantity, v_final_price,
      v_menu_item.discount, p_extra_price, p_custom_fields, p_special_instructions
    )
    RETURNING id INTO v_cart_item_id;
    RETURN v_cart_item_id;
  END IF;
END;
$function$;

-- GET CART
-- Devuelve todos los ítems del carrito activo para el usuario/guest con subtotales
CREATE OR REPLACE FUNCTION public.get_cart(
  p_user_id       uuid    DEFAULT NULL::uuid,
  p_guest_id      varchar DEFAULT NULL::character varying,
  p_restaurant_id integer DEFAULT NULL::integer,
  p_branch_number integer DEFAULT NULL::integer
)
  RETURNS TABLE(
    cart_id uuid, cart_item_id uuid, menu_item_id integer,
    item_name text, item_description text, item_images text[], item_features text[],
    quantity integer, unit_price numeric, discount integer, extra_price numeric,
    custom_fields jsonb, special_instructions text,
    subtotal numeric, total_items integer, total_amount numeric, order_notes text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_cart_id UUID;
BEGIN
  IF (p_user_id IS NULL AND p_guest_id IS NULL) OR
     (p_user_id IS NOT NULL AND p_guest_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Must provide either user_id or guest_id, but not both';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT c.id INTO v_cart_id FROM carts c
    WHERE c.user_id = p_user_id
      AND (p_restaurant_id IS NULL OR c.restaurant_id = p_restaurant_id)
      AND (p_branch_number IS NULL OR c.branch_number = p_branch_number)
      AND c.expires_at > NOW()
    ORDER BY c.created_at DESC LIMIT 1;
  ELSE
    SELECT c.id INTO v_cart_id FROM carts c
    WHERE c.guest_id = p_guest_id
      AND (p_restaurant_id IS NULL OR c.restaurant_id = p_restaurant_id)
      AND (p_branch_number IS NULL OR c.branch_number = p_branch_number)
      AND c.expires_at > NOW()
    ORDER BY c.created_at DESC LIMIT 1;
  END IF;

  IF v_cart_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    c.id, ci.id, ci.menu_item_id, ci.item_name, ci.item_description,
    ci.item_images, ci.item_features, ci.quantity, ci.unit_price,
    ci.discount, ci.extra_price, ci.custom_fields, ci.special_instructions,
    (ci.unit_price + COALESCE(ci.extra_price, 0)) * ci.quantity,
    c.total_items, c.total_amount, c.order_notes
  FROM carts c
  LEFT JOIN cart_items ci ON c.id = ci.cart_id
  WHERE c.id = v_cart_id
  ORDER BY ci.created_at;
END;
$function$;
