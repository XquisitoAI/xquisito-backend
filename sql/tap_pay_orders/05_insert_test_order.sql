-- =====================================================
-- INSERTAR ORDEN DE PRUEBA PARA TAP & PAY
-- Descripción: Orden de prueba con platillos para testing
-- Fecha: 2026-01-09
-- =====================================================

-- 1. Insertar orden principal (simplificada como table_order)
INSERT INTO tap_pay_orders (
  id,
  restaurant_id,
  branch_number,
  table_id,
  total_amount,
  paid_amount,
  remaining_amount,
  payment_status,
  order_status,
  is_split_active,
  split_method,
  number_of_splits
) VALUES (
  'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid,  -- ID fijo para fácil referencia
  5,                                              -- Restaurant: Tacos Atarantados
  1,                                              -- Branch 1
  '0278b085-dc37-42a4-aa64-f99acdfb49d8'::uuid,  -- Mesa 3
  290.00,                                         -- Total: 85+90+65+50 = 290
  0.00,                                           -- Pagado (aún no se ha pagado)
  290.00,                                         -- Restante
  'pending',                                      -- Estado de pago
  'active',                                       -- Estado de orden
  false,                                          -- No está en modo split
  NULL,                                           -- Sin método de split
  NULL                                            -- Sin divisiones
)
ON CONFLICT (id) DO NOTHING;  -- No insertar si ya existe

-- 2. Insertar platillos para la orden de prueba
INSERT INTO dish_order (
  id,
  tap_pay_order_id,
  item,
  quantity,
  price,
  status,
  payment_status,
  images,
  custom_fields,
  extra_price
) VALUES
  -- Platillo 1: Tacos de Asada
  (
    gen_random_uuid(),
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid,
    'Tacos de Asada (x3)',
    1,
    85.00,
    'delivered',
    'not_paid',
    ARRAY['https://images.unsplash.com/photo-1565299585323-38d6b0865b47'],
    '{"notes": "Sin cebolla", "spice_level": "medium"}'::jsonb,
    0
  ),
  -- Platillo 2: Tacos de Pastor
  (
    gen_random_uuid(),
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid,
    'Tacos de Pastor (x3)',
    1,
    80.00,
    'delivered',
    'not_paid',
    ARRAY['https://images.unsplash.com/photo-1599974579688-8dbdd335c77f'],
    '{"notes": "Con piña extra", "spice_level": "hot"}'::jsonb,
    10.00
  ),
  -- Platillo 3: Guacamole con Totopos
  (
    gen_random_uuid(),
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid,
    'Guacamole con Totopos',
    1,
    65.00,
    'delivered',
    'not_paid',
    ARRAY['https://images.unsplash.com/photo-1534939561126-855b8675edd7'],
    '{"notes": "Guacamole preparado en molcajete"}'::jsonb,
    0
  ),
  -- Platillo 4: Agua de Horchata
  (
    gen_random_uuid(),
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid,
    'Agua de Horchata (Grande)',
    2,
    25.00,
    'delivered',
    'not_paid',
    ARRAY['https://images.unsplash.com/photo-1556910103-1c02745aae4d'],
    '{"size": "large", "ice": "yes"}'::jsonb,
    0
  )
ON CONFLICT DO NOTHING;  -- No insertar si ya existen

-- 3. Marcar la mesa como ocupada
UPDATE tables
SET status = 'occupied',
    updated_at = NOW()
WHERE id = '0278b085-dc37-42a4-aa64-f99acdfb49d8'::uuid;

-- 4. Verificar la orden creada
SELECT
  '✅ ORDEN DE PRUEBA CREADA' as status,
  o.id,
  t.table_number,
  t.status as table_status,
  o.total_amount,
  o.paid_amount,
  o.remaining_amount,
  o.payment_status,
  o.order_status,
  (SELECT COUNT(*) FROM dish_order WHERE tap_pay_order_id = o.id) as total_items
FROM tap_pay_orders o
LEFT JOIN tables t ON o.table_id = t.id
WHERE o.id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid;
