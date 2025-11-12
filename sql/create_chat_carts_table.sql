-- ====================================================
-- Sistema de carritos temporales para el frontend
-- Separado en 2 tablas: carritos y items del carrito
-- ====================================================

-- Tabla principal de carritos
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificación del usuario (uno de los dos debe existir)
  clerk_user_id VARCHAR(255) REFERENCES users(clerk_user_id),
  guest_id VARCHAR(255),

  -- Totales calculados automáticamente
  total_items INTEGER DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',

  -- Validación: debe tener clerk_user_id O guest_id (pero no ambos)
  CONSTRAINT check_user_or_guest CHECK (
    (clerk_user_id IS NOT NULL AND guest_id IS NULL) OR
    (clerk_user_id IS NULL AND guest_id IS NOT NULL)
  )
);

-- Tabla de items del carrito
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relación con el carrito
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,

  -- Relación con el item del menú
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,

  -- Detalles del item (copiados del menu_item al agregarlo)
  item_name TEXT NOT NULL,
  item_description TEXT,
  item_images TEXT[],  -- Array de URLs de imágenes
  item_features TEXT[], -- Array de características

  -- Precios
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,
  discount INTEGER DEFAULT 0,
  extra_price DECIMAL(10,2) DEFAULT 0,  -- Precio extra por customizaciones

  -- Customizaciones (custom_fields seleccionados)
  custom_fields JSONB DEFAULT '[]'::jsonb,  -- Array de custom fields como en MenuItemData

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================
-- ÍNDICES PARA OPTIMIZAR CONSULTAS
-- ====================================================

CREATE INDEX idx_carts_clerk_user_id ON carts(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
CREATE INDEX idx_carts_guest_id ON carts(guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX idx_carts_expires_at ON carts(expires_at);

CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_cart_items_menu_item_id ON cart_items(menu_item_id);

-- Prevenir items duplicados en el mismo carrito (sin custom_fields)
CREATE UNIQUE INDEX idx_cart_items_unique_item
  ON cart_items(cart_id, menu_item_id)
  WHERE custom_fields = '[]'::jsonb;

-- ====================================================
-- TRIGGERS PARA UPDATED_AT Y TOTALES
-- ====================================================

-- Trigger para updated_at en carts
CREATE TRIGGER trigger_update_carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para updated_at en cart_items
CREATE TRIGGER trigger_update_cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para actualizar totales del carrito
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

  -- Actualizar totales del carrito (incluyendo extra_price y discount)
  UPDATE carts
  SET
    total_items = (
      SELECT COALESCE(SUM(quantity), 0)
      FROM cart_items
      WHERE cart_id = v_cart_id
    ),
    total_amount = (
      SELECT COALESCE(SUM(
        quantity * (unit_price * (100 - discount) / 100 + COALESCE(extra_price, 0))
      ), 0)
      FROM cart_items
      WHERE cart_id = v_cart_id
    ),
    updated_at = NOW()
  WHERE id = v_cart_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar totales automáticamente
CREATE TRIGGER trigger_update_cart_totals_on_insert
  AFTER INSERT ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_cart_totals();

CREATE TRIGGER trigger_update_cart_totals_on_update
  AFTER UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_cart_totals();

CREATE TRIGGER trigger_update_cart_totals_on_delete
  AFTER DELETE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_cart_totals();

-- ====================================================
-- FUNCIONES PARA MANEJAR EL CARRITO
-- ====================================================

-- Función para obtener o crear un carrito
CREATE OR REPLACE FUNCTION get_or_create_cart(
  p_clerk_user_id VARCHAR(255) DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL
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

  -- Buscar carrito existente y activo
  IF p_clerk_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id
    FROM carts
    WHERE clerk_user_id = p_clerk_user_id
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    SELECT id INTO v_cart_id
    FROM carts
    WHERE guest_id = p_guest_id
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Si no existe, crear uno nuevo
  IF v_cart_id IS NULL THEN
    INSERT INTO carts (clerk_user_id, guest_id)
    VALUES (p_clerk_user_id, p_guest_id)
    RETURNING id INTO v_cart_id;
  END IF;

  RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql;

-- Función para agregar item al carrito
CREATE OR REPLACE FUNCTION add_to_cart(
  p_menu_item_id INTEGER,
  p_clerk_user_id VARCHAR(255) DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL,
  p_quantity INTEGER DEFAULT 1,
  p_custom_fields JSONB DEFAULT '[]'::jsonb,
  p_extra_price DECIMAL(10,2) DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_cart_id UUID;
  v_cart_item_id UUID;
  v_menu_item RECORD;
BEGIN
  -- Obtener o crear carrito
  v_cart_id := get_or_create_cart(p_clerk_user_id, p_guest_id);

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

-- Función para actualizar cantidad de un item
CREATE OR REPLACE FUNCTION update_cart_item_quantity(
  p_cart_item_id UUID,
  p_quantity INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
  IF p_quantity <= 0 THEN
    -- Si la cantidad es 0 o negativa, eliminar el item
    DELETE FROM cart_items WHERE id = p_cart_item_id;
  ELSE
    -- Actualizar cantidad
    UPDATE cart_items
    SET quantity = p_quantity,
        updated_at = NOW()
    WHERE id = p_cart_item_id;
  END IF;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Función para eliminar item del carrito
CREATE OR REPLACE FUNCTION remove_from_cart(
  p_cart_item_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM cart_items WHERE id = p_cart_item_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener el carrito completo con detalles
CREATE OR REPLACE FUNCTION get_cart(
  p_clerk_user_id VARCHAR(255) DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL
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
  AND c.expires_at > NOW()
  ORDER BY ci.created_at;
END;
$$ LANGUAGE plpgsql;

-- Función para limpiar el carrito completo
CREATE OR REPLACE FUNCTION clear_cart(
  p_clerk_user_id VARCHAR(255) DEFAULT NULL,
  p_guest_id VARCHAR(255) DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Buscar el carrito
  IF p_clerk_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts WHERE clerk_user_id = p_clerk_user_id AND expires_at > NOW();
  ELSE
    SELECT id INTO v_cart_id FROM carts WHERE guest_id = p_guest_id AND expires_at > NOW();
  END IF;

  IF v_cart_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Eliminar todos los items (esto también eliminará el carrito si es CASCADE)
  DELETE FROM cart_items WHERE cart_id = v_cart_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Función para limpiar carritos expirados
CREATE OR REPLACE FUNCTION cleanup_expired_carts()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM carts WHERE expires_at < NOW();
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- POLÍTICAS DE SEGURIDAD (RLS)
-- ====================================================

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Permitir todas las operaciones por ahora (ajustar según necesidad)
CREATE POLICY "Allow all operations on carts"
  ON carts FOR ALL USING (true);

CREATE POLICY "Allow all operations on cart_items"
  ON cart_items FOR ALL USING (true);

-- ====================================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- ====================================================

COMMENT ON TABLE carts IS 'Carritos de compra temporales para usuarios y invitados';
COMMENT ON TABLE cart_items IS 'Items dentro de los carritos de compra con todos los datos de MenuItemData';
COMMENT ON COLUMN carts.clerk_user_id IS 'ID de Clerk para usuarios registrados (exclusivo con guest_id)';
COMMENT ON COLUMN carts.guest_id IS 'ID generado para invitados (exclusivo con clerk_user_id)';
COMMENT ON COLUMN carts.expires_at IS 'Fecha de expiración del carrito (24 horas por defecto)';
COMMENT ON COLUMN cart_items.unit_price IS 'Precio del item al momento de agregarlo al carrito';
COMMENT ON COLUMN cart_items.item_images IS 'Array de URLs de imágenes (equivalente a images en MenuItemData)';
COMMENT ON COLUMN cart_items.item_features IS 'Array de características del platillo (equivalente a features en MenuItemData)';
COMMENT ON COLUMN cart_items.custom_fields IS 'JSONB con customFields seleccionados por el usuario como en MenuItemData';
COMMENT ON COLUMN cart_items.extra_price IS 'Precio extra calculado por las customizaciones (equivalente a extraPrice en MenuItemData)';
