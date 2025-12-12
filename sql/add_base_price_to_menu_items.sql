-- ===============================================
-- Agregar columna base_price a menu_items
-- ===============================================
-- Esta columna almacena el precio base sin IVA
-- mientras que la columna 'price' almacena el precio con IVA incluido

-- Agregar columna base_price
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS base_price DECIMAL(10,2);

-- Agregar constraint para asegurar que base_price sea >= 0
ALTER TABLE menu_items
ADD CONSTRAINT check_base_price_non_negative
CHECK (base_price IS NULL OR base_price >= 0);

-- Opcional: Migrar datos existentes (calcular base_price desde price actual)
-- Asumiendo que los precios actuales ya tienen IVA del 16% incluido
-- base_price = price / 1.16
UPDATE menu_items
SET base_price = ROUND(price / 1.16, 2)
WHERE base_price IS NULL;

-- Crear índice para optimizar consultas (opcional)
CREATE INDEX IF NOT EXISTS idx_menu_items_base_price ON menu_items(base_price);

-- Comentario en la columna para documentación
COMMENT ON COLUMN menu_items.base_price IS 'Precio base del item sin IVA incluido';
COMMENT ON COLUMN menu_items.price IS 'Precio final del item con IVA (16%) incluido';
