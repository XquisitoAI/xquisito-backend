-- ====================================================
-- Script para Poblar Habitaciones de Prueba
-- IMPORTANTE: Ajustar restaurant_id y branch_id según tu BD
-- ====================================================

-- =============================================
-- PASO 1: Identificar tu restaurante y sucursal
-- =============================================

-- Ejecuta esta query para ver tus clientes:
-- SELECT id, name FROM clients WHERE active = true;

-- Ejecuta esta query para ver las sucursales:
-- SELECT id, client_id, name, branch_number FROM branches WHERE active = true;

-- =============================================
-- PASO 2: Reemplazar los valores
-- =============================================

-- REEMPLAZA estos valores con los de tu base de datos:
DO $$
DECLARE
  v_restaurant_id INTEGER := 5;  -- ← CAMBIAR: ID de tu restaurante/cliente
  v_branch_id UUID := '06cd0653-6f79-4c35-971a-ba3919ce931a';  -- ← CAMBIAR: ID de tu sucursal
BEGIN
  -- =============================================
  -- INSERTAR HABITACIONES DE PRUEBA
  -- =============================================

  -- Habitación 101
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    101,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  -- Habitación 102
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    102,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  -- Habitación 103
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    103,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  -- Habitación 104
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    104,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  -- Habitación 105
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    105,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  -- Habitación 201
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    201,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  -- Habitación 202
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    202,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  -- Habitación 203
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    203,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  -- Habitación 204
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    204,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  -- Habitación 205
  INSERT INTO rooms (
    room_number,
    restaurant_id,
    branch_id,
    status
  ) VALUES (
    205,
    v_restaurant_id,
    v_branch_id,
    'available'
  ) ON CONFLICT (branch_id, room_number) DO NOTHING;

  RAISE NOTICE 'Habitaciones creadas exitosamente';
END $$;

-- =============================================
-- VERIFICACIÓN
-- =============================================

-- Ver todas las habitaciones creadas
SELECT
  r.id,
  r.room_number,
  r.restaurant_id,
  r.branch_id,
  r.status,
  r.created_at,
  b.name as branch_name,
  rest.name as restaurant_name
FROM rooms r
JOIN branches b ON r.branch_id = b.id
JOIN restaurants rest ON r.restaurant_id = rest.id
ORDER BY r.room_number;

-- =============================================
-- NOTAS
-- =============================================

-- Estados disponibles:
-- - 'available': Disponible para órdenes
-- - 'occupied': Ocupada con huésped
-- - 'reserved': Reservada
-- - 'maintenance': En mantenimiento

-- Habitaciones creadas:
-- Piso 1: 101, 102, 103, 104, 105
-- Piso 2: 201, 202, 203 (ocupada), 204, 205 (mantenimiento)

-- Para eliminar todas las habitaciones de prueba:
-- DELETE FROM rooms WHERE room_number IN (101, 102, 103, 104, 105, 201, 202, 203, 204, 205);
