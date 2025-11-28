-- ====================================================
-- Migration: Rename clerk_user_id to user_id in carts
-- ====================================================

-- Drop all functions that use clerk_user_id parameter (VARCHAR versions)
DROP FUNCTION IF EXISTS get_or_create_cart(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS get_or_create_cart(VARCHAR, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS add_to_cart(INTEGER, VARCHAR, VARCHAR, INTEGER, JSONB, DECIMAL);
DROP FUNCTION IF EXISTS add_to_cart(INTEGER, VARCHAR, VARCHAR, INTEGER, JSONB, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS get_cart(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS get_cart(VARCHAR, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS clear_cart(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS clear_cart(VARCHAR, VARCHAR, INTEGER);

-- Drop UUID versions if they exist
DROP FUNCTION IF EXISTS get_or_create_cart(UUID, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS add_to_cart(INTEGER, UUID, VARCHAR, INTEGER, JSONB, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS get_cart(UUID, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS clear_cart(UUID, VARCHAR, INTEGER);

-- Drop indexes
DROP INDEX IF EXISTS idx_carts_clerk_user_id;
DROP INDEX IF EXISTS idx_carts_user_id;

-- Drop the old foreign key constraint
ALTER TABLE carts DROP CONSTRAINT IF EXISTS carts_clerk_user_id_fkey;

-- Delete all existing carts with user_id (old Clerk data that can't be migrated)
-- These are old carts that won't be valid with the new auth system anyway
DELETE FROM carts WHERE user_id IS NOT NULL;

-- Change column type from VARCHAR(255) to UUID to match auth.users(id)
-- Since we deleted all rows with user_id, this conversion will work
ALTER TABLE carts ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- Add new foreign key constraint pointing to auth.users (Supabase Auth)
ALTER TABLE carts ADD CONSTRAINT carts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update comments
COMMENT ON COLUMN carts.user_id IS 'ID de usuario de Supabase para usuarios registrados (exclusivo con guest_id)';

-- Update constraint
ALTER TABLE carts DROP CONSTRAINT IF EXISTS check_user_or_guest;
ALTER TABLE carts ADD CONSTRAINT check_user_or_guest CHECK (
  (user_id IS NOT NULL AND guest_id IS NULL) OR
  (user_id IS NULL AND guest_id IS NOT NULL)
);

-- Recreate index with new column name
CREATE INDEX idx_carts_user_id ON carts(user_id) WHERE user_id IS NOT NULL;

-- ====================================================
-- RECREATE FUNCTIONS WITH user_id
-- ====================================================

-- Función para obtener o crear un carrito
CREATE OR REPLACE FUNCTION get_or_create_cart(
  p_user_id UUID DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_restaurant_id INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Validar que se proporcione user_id O guest_id
  IF (p_user_id IS NULL AND p_guest_id IS NULL) THEN
    RAISE EXCEPTION 'Debe proporcionar user_id o guest_id';
  END IF;

  IF (p_user_id IS NOT NULL AND p_guest_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Solo puede proporcionar user_id O guest_id, no ambos';
  END IF;

  -- Buscar carrito existente y activo para este restaurante
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id
    FROM carts
    WHERE user_id = p_user_id
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
    INSERT INTO carts (user_id, guest_id, restaurant_id)
    VALUES (p_user_id, p_guest_id, p_restaurant_id)
    RETURNING id INTO v_cart_id;
  END IF;

  RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql;

-- Función para agregar item al carrito
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

-- Función para obtener el carrito completo con detalles
CREATE OR REPLACE FUNCTION get_cart(
  p_user_id UUID DEFAULT NULL,
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
    (p_user_id IS NOT NULL AND c.user_id = p_user_id) OR
    (p_guest_id IS NOT NULL AND c.guest_id = p_guest_id)
  )
  AND (p_restaurant_id IS NULL OR c.restaurant_id = p_restaurant_id)
  AND c.expires_at > NOW()
  ORDER BY ci.created_at;
END;
$$ LANGUAGE plpgsql;

-- Función para limpiar el carrito completo
CREATE OR REPLACE FUNCTION clear_cart(
  p_user_id UUID DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_restaurant_id INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Buscar el carrito para este restaurante
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id
    FROM carts
    WHERE user_id = p_user_id
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
