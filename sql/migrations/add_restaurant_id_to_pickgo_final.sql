-- Agregar restaurant_id a pick_and_go_orders para segmentación completa
-- 16 de diciembre 2024

-- Paso 1: Agregar la columna
ALTER TABLE pick_and_go_orders
ADD COLUMN restaurant_id INTEGER;

-- Paso 2: Agregar foreign key constraint
ALTER TABLE pick_and_go_orders
ADD CONSTRAINT fk_pick_and_go_restaurant
FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

-- Paso 3: Migrar datos existentes (si los hay)
-- Conectar por el admin que creó la orden
UPDATE pick_and_go_orders
SET restaurant_id = (
  SELECT r.id
  FROM restaurants r
  JOIN user_admin_portal uap ON r.user_id = uap.id
  WHERE uap.clerk_user_id = pick_and_go_orders.clerk_user_id
)
WHERE clerk_user_id IS NOT NULL;

-- Paso 4: Para futuras órdenes, hacer la columna NOT NULL
-- ALTER TABLE pick_and_go_orders
-- ALTER COLUMN restaurant_id SET NOT NULL;

-- Opcional: Crear índice para performance
CREATE INDEX idx_pick_and_go_restaurant_id ON pick_and_go_orders(restaurant_id);