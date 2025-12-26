-- ====================================================
-- Fix: Corregir cálculo de totales del carrito
-- El unit_price ya viene con el descuento aplicado desde el frontend,
-- no debe aplicarse el descuento nuevamente
-- ====================================================

-- Actualizar función para calcular totales del carrito correctamente
CREATE OR REPLACE FUNCTION update_cart_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Determinar el cart_id según la operación
  IF TG_OP = 'DELETE' THEN
    v_cart_id := OLD.cart_id;
  ELSE
    v_cart_id := NEW.cart_id;
  END IF;

  -- Actualizar totales del carrito
  -- IMPORTANTE: unit_price ya viene con descuento aplicado desde el frontend
  -- Solo necesitamos: quantity * (unit_price + extra_price)
  -- ANTES estaba: quantity * (unit_price * (100 - discount) / 100 + COALESCE(extra_price, 0))
  -- Esto aplicaba el descuento dos veces, causando que $112 se convirtiera en $104
  UPDATE carts
  SET
    total_items = (
      SELECT COALESCE(SUM(quantity), 0)
      FROM cart_items
      WHERE cart_id = v_cart_id
    ),
    total_amount = (
      SELECT COALESCE(SUM(
        quantity * (unit_price + COALESCE(extra_price, 0))
      ), 0)
      FROM cart_items
      WHERE cart_id = v_cart_id
    ),
    updated_at = NOW()
  WHERE id = v_cart_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_cart_totals IS 'Actualiza los totales del carrito. El unit_price ya incluye el descuento aplicado desde el frontend.';

-- ====================================================
-- Actualizar también la función get_cart para que calcule correctamente el subtotal
-- ====================================================

-- Buscar la versión más reciente de get_cart y actualizarla
-- Versión para user_id/guest_id con restaurant_id y branch_number
CREATE OR REPLACE FUNCTION get_cart(
  p_user_id UUID DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_restaurant_id INTEGER DEFAULT NULL,
  p_branch_number INTEGER DEFAULT NULL
)
RETURNS TABLE (
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
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Validación: debe tener user_id O guest_id (pero no ambos)
  IF (p_user_id IS NULL AND p_guest_id IS NULL) OR
     (p_user_id IS NOT NULL AND p_guest_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Must provide either user_id or guest_id, but not both';
  END IF;

  -- Buscar carrito activo
  IF p_user_id IS NOT NULL THEN
    SELECT c.id INTO v_cart_id
    FROM carts c
    WHERE c.user_id = p_user_id
      AND (p_restaurant_id IS NULL OR c.restaurant_id = p_restaurant_id)
      AND (p_branch_number IS NULL OR c.branch_number = p_branch_number)
      AND c.expires_at > NOW()
    ORDER BY c.created_at DESC
    LIMIT 1;
  ELSE
    SELECT c.id INTO v_cart_id
    FROM carts c
    WHERE c.guest_id = p_guest_id
      AND (p_restaurant_id IS NULL OR c.restaurant_id = p_restaurant_id)
      AND (p_branch_number IS NULL OR c.branch_number = p_branch_number)
      AND c.expires_at > NOW()
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  -- Si no hay carrito, retornar resultado vacío
  IF v_cart_id IS NULL THEN
    RETURN;
  END IF;

  -- Retornar items del carrito con totales
  -- IMPORTANTE: unit_price ya incluye descuento, solo sumar extra_price
  -- ANTES estaba: (ci.quantity * (ci.unit_price * (100 - ci.discount) / 100 + COALESCE(ci.extra_price, 0))) as subtotal
  -- Esto aplicaba el descuento dos veces
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
    (ci.unit_price + COALESCE(ci.extra_price, 0)) * ci.quantity as subtotal,
    c.total_items,
    c.total_amount
  FROM carts c
  LEFT JOIN cart_items ci ON c.id = ci.cart_id
  WHERE c.id = v_cart_id
  ORDER BY ci.created_at;
END;
$$;

COMMENT ON FUNCTION get_cart IS 'Obtiene el carrito completo. El unit_price ya incluye el descuento aplicado desde el frontend.';
