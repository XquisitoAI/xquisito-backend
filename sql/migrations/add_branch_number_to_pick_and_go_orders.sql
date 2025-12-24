-- Agregar branch_number a pick_and_go_orders para soporte de sucursales
-- 22 de diciembre 2024
--
-- Esta migración permite que las órdenes Pick & Go se asocien a sucursales específicas,
-- permitiendo a los clientes elegir dónde recoger su pedido.

-- Paso 1: Agregar la columna branch_number
ALTER TABLE pick_and_go_orders
ADD COLUMN branch_number INTEGER;

-- Paso 2: Agregar foreign key constraint compuesta hacia branches
-- Esto valida que restaurant_id + branch_number sea una combinación válida
ALTER TABLE pick_and_go_orders
ADD CONSTRAINT fk_pick_and_go_branch
FOREIGN KEY (restaurant_id, branch_number)
REFERENCES branches(restaurant_id, branch_number)
ON DELETE RESTRICT;

-- Paso 3: Migrar datos existentes (si los hay)
-- Asignar la primera sucursal activa del restaurante a las órdenes existentes
UPDATE pick_and_go_orders pgo
SET branch_number = (
  SELECT b.branch_number
  FROM branches b
  WHERE b.restaurant_id = pgo.restaurant_id
    AND b.active = true
  ORDER BY b.branch_number ASC
  LIMIT 1
)
WHERE pgo.restaurant_id IS NOT NULL
  AND pgo.branch_number IS NULL;

-- Paso 4: Crear índice compuesto para performance
-- Esto optimiza las búsquedas por restaurante y sucursal
CREATE INDEX idx_pick_and_go_restaurant_branch
ON pick_and_go_orders(restaurant_id, branch_number);

-- Paso 5: Crear índice para búsquedas por sucursal
CREATE INDEX idx_pick_and_go_branch_number
ON pick_and_go_orders(branch_number);

-- Paso 6: Agregar comentarios para documentación
COMMENT ON COLUMN pick_and_go_orders.branch_number IS
'Número de sucursal donde el cliente recogerá el pedido. Debe existir en la tabla branches para el restaurant_id correspondiente.';

-- Paso 7 (OPCIONAL - DESCOMENTAR CUANDO ESTÉS LISTO): Hacer la columna NOT NULL
-- Esto fuerza que todas las futuras órdenes tengan una sucursal asignada
-- ALTER TABLE pick_and_go_orders
-- ALTER COLUMN branch_number SET NOT NULL;

-- Verificación: Contar órdenes sin sucursal asignada
-- Ejecuta esto después de la migración para verificar
-- SELECT COUNT(*) as orders_without_branch
-- FROM pick_and_go_orders
-- WHERE branch_number IS NULL;

-- Si el resultado es 0, puedes ejecutar el Paso 7 con seguridad
