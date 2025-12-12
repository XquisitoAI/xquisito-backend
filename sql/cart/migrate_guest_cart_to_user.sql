-- ============================================
-- MIGRATE GUEST CART TO USER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION migrate_guest_cart_to_user(
  p_guest_id TEXT,
  p_user_id TEXT,
  p_restaurant_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_guest_cart_id UUID;
  v_user_cart_id UUID;
  v_items_migrated INTEGER := 0;
  v_user_uuid UUID;
  v_guest_cart RECORD;
BEGIN
  -- Validaciones
  IF p_guest_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'guest_id and user_id are required';
  END IF;

  -- Convertir user_id de TEXT a UUID
  v_user_uuid := p_user_id::UUID;

  -- Buscar el carrito del invitado con todos sus campos
  SELECT * INTO v_guest_cart
  FROM carts
  WHERE guest_id = p_guest_id
    AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si no hay carrito del invitado, no hay nada que migrar
  IF v_guest_cart.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No guest cart found to migrate',
      'items_migrated', 0
    );
  END IF;

  v_guest_cart_id := v_guest_cart.id;

  -- Buscar carrito existente del usuario
  SELECT id INTO v_user_cart_id
  FROM carts
  WHERE user_id = v_user_uuid
    AND (p_restaurant_id IS NULL OR restaurant_id = p_restaurant_id)
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si el usuario tiene un carrito existente, eliminarlo (cascade eliminará los items)
  IF v_user_cart_id IS NOT NULL THEN
    DELETE FROM carts WHERE id = v_user_cart_id;
    v_user_cart_id := NULL;
  END IF;

  -- Crear un nuevo carrito para el usuario copiando branch_number y client_id del guest
  INSERT INTO carts (user_id, restaurant_id, branch_number, client_id, expires_at)
  VALUES (
    v_user_uuid,
    v_guest_cart.restaurant_id,
    v_guest_cart.branch_number,
    v_guest_cart.client_id,
    NOW() + INTERVAL '24 hours'
  )
  RETURNING id INTO v_user_cart_id;

  -- Migrar los items del carrito del invitado al nuevo carrito del usuario
  UPDATE cart_items
  SET cart_id = v_user_cart_id
  WHERE cart_id = v_guest_cart_id;

  -- Contar items migrados
  GET DIAGNOSTICS v_items_migrated = ROW_COUNT;

  -- Eliminar el carrito del invitado (ya está vacío)
  DELETE FROM carts WHERE id = v_guest_cart_id;

  -- Recalcular totales del carrito del usuario
  UPDATE carts
  SET
    total_items = (
      SELECT COALESCE(SUM(quantity), 0)
      FROM cart_items
      WHERE cart_id = v_user_cart_id
    ),
    total_amount = (
      SELECT COALESCE(SUM(
        (mi.price * (1 - COALESCE(mi.discount, 0) / 100.0) + COALESCE(ci.extra_price, 0)) * ci.quantity
      ), 0)
      FROM cart_items ci
      JOIN menu_items mi ON ci.menu_item_id = mi.id
      WHERE ci.cart_id = v_user_cart_id
    ),
    updated_at = NOW()
  WHERE id = v_user_cart_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Cart migrated successfully',
    'items_migrated', v_items_migrated,
    'new_cart_id', v_user_cart_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error migrating cart: %', SQLERRM;
END;
$$;

-- Agregar comentario a la función
COMMENT ON FUNCTION migrate_guest_cart_to_user IS
'Migra el carrito de un invitado (guest_id) a un usuario autenticado (user_id).
Si el usuario ya tiene un carrito existente, se reemplaza con el carrito del invitado.';
