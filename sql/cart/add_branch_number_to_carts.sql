-- ====================================================
-- Agregar soporte para branch_number en el sistema de carritos
-- ====================================================

-- NOTA: Este script asume que ya se ejecutó add_branch_support_to_tables.sql
-- que crea la tabla branches con (client_id, branch_number) UNIQUE constraint

-- ====================================================
-- ELIMINAR FUNCIONES ANTIGUAS (para evitar conflictos)
-- ====================================================
-- Eliminar todas las versiones existentes de las funciones cart
DROP FUNCTION IF EXISTS add_to_cart(INTEGER, VARCHAR, VARCHAR, INTEGER, JSONB, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS add_to_cart(INTEGER, VARCHAR, VARCHAR, INTEGER, JSONB, DECIMAL, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS add_to_cart(INTEGER, UUID, VARCHAR, INTEGER, JSONB, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS add_to_cart(INTEGER, UUID, VARCHAR, INTEGER, JSONB, DECIMAL, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS add_to_cart(INTEGER, UUID, VARCHAR(255), INTEGER, JSONB, DECIMAL(10,2), INTEGER);
DROP FUNCTION IF EXISTS add_to_cart(INTEGER, UUID, VARCHAR(255), INTEGER, JSONB, DECIMAL(10,2), INTEGER, INTEGER);

DROP FUNCTION IF EXISTS get_cart(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS get_cart(VARCHAR, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS get_cart(VARCHAR, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_cart(UUID, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS get_cart(UUID, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_cart(UUID, VARCHAR(255), INTEGER);
DROP FUNCTION IF EXISTS get_cart(UUID, VARCHAR(255), INTEGER, INTEGER);

DROP FUNCTION IF EXISTS clear_cart(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS clear_cart(VARCHAR, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS clear_cart(VARCHAR, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS clear_cart(UUID, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS clear_cart(UUID, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS clear_cart(UUID, VARCHAR(255), INTEGER);
DROP FUNCTION IF EXISTS clear_cart(UUID, VARCHAR(255), INTEGER, INTEGER);

-- ====================================================
-- AGREGAR COLUMNAS A LA TABLA CARTS
-- ====================================================

-- Agregar columna branch_number a la tabla carts
ALTER TABLE carts
ADD COLUMN IF NOT EXISTS branch_number INTEGER;

-- Agregar columna client_id si no existe (necesaria para FK compuesta con branches)
-- El client_id normalmente se obtiene del restaurant_id
ALTER TABLE carts
ADD COLUMN IF NOT EXISTS client_id UUID;

-- Agregar índice para mejorar el rendimiento de las consultas por sucursal
CREATE INDEX IF NOT EXISTS idx_carts_branch_number ON carts(branch_number);

-- Agregar índice compuesto para consultas por restaurante y sucursal
CREATE INDEX IF NOT EXISTS idx_carts_restaurant_branch ON carts(restaurant_id, branch_number)
WHERE restaurant_id IS NOT NULL AND branch_number IS NOT NULL;

-- Agregar índice para client_id (usado en FK)
CREATE INDEX IF NOT EXISTS idx_carts_client_id ON carts(client_id);

-- Agregar foreign key constraint compuesta a branches
-- Esto asegura integridad referencial: (client_id, branch_number) debe existir en branches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_carts_branch'
  ) THEN
    ALTER TABLE carts
    ADD CONSTRAINT fk_carts_branch
    FOREIGN KEY (client_id, branch_number)
    REFERENCES branches(client_id, branch_number)
    ON DELETE SET NULL;
  END IF;
END $$;

-- ====================================================
-- Actualizar función add_to_cart
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
    INSERT INTO carts (user_id, guest_id, restaurant_id, branch_number)
    VALUES (p_user_id, p_guest_id, p_restaurant_id, p_branch_number)
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

-- ====================================================
-- Actualizar función get_cart
-- ====================================================
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
    (ci.unit_price + ci.extra_price) * ci.quantity as subtotal,
    c.total_items,
    c.total_amount
  FROM carts c
  LEFT JOIN cart_items ci ON c.id = ci.cart_id
  WHERE c.id = v_cart_id
  ORDER BY ci.created_at;
END;
$$;

-- ====================================================
-- Actualizar función clear_cart
-- ====================================================
CREATE OR REPLACE FUNCTION clear_cart(
  p_user_id UUID DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_restaurant_id INTEGER DEFAULT NULL,
  p_branch_number INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
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

  -- Si no hay carrito, retornar false
  IF v_cart_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Eliminar todos los items del carrito
  DELETE FROM cart_items WHERE cart_id = v_cart_id;

  -- Eliminar el carrito
  DELETE FROM carts WHERE id = v_cart_id;

  RETURN TRUE;
END;
$$;

-- ====================================================
-- Comentarios
-- ====================================================
COMMENT ON COLUMN carts.branch_number IS 'Número de sucursal del restaurante (para multi-sucursal) - Referencia a branches.branch_number';
COMMENT ON COLUMN carts.client_id IS 'ID del cliente - Usado para FK compuesta con branch_number hacia branches(client_id, branch_number)';
COMMENT ON INDEX idx_carts_branch_number IS 'Índice para consultas por sucursal';
COMMENT ON INDEX idx_carts_restaurant_branch IS 'Índice compuesto para consultas por restaurante y sucursal';
COMMENT ON INDEX idx_carts_client_id IS 'Índice para client_id usado en foreign key hacia branches';
COMMENT ON CONSTRAINT fk_carts_branch ON carts IS 'FK compuesta hacia branches(client_id, branch_number) para integridad referencial';
