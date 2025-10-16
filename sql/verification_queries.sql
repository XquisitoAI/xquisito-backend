-- Queries de Verificación para Dashboard Analytics
-- Ejecuta estos queries en Supabase SQL Editor para verificar datos manualmente

-- ========================================
-- 1. VERIFICAR VENTAS TOTALES
-- ========================================
-- Contar órdenes pagadas y sumar total_amount
SELECT
    COUNT(*) as total_ordenes_pagadas,
    SUM(total_amount) as ventas_totales,
    AVG(total_amount) as ticket_promedio
FROM table_order to1
LEFT JOIN tables t ON to1.table_id = t.id
WHERE to1.status = 'paid'
-- AND t.restaurant_id = 1  -- Descomenta y cambia ID según el restaurante que quieras verificar
;

-- ========================================
-- 2. VERIFICAR ÓRDENES ACTIVAS
-- ========================================
-- Contar órdenes no pagadas o parciales
SELECT
    COUNT(*) as ordenes_activas,
    to1.status,
    t.table_number,
    to1.total_amount,
    to1.paid_amount,
    to1.created_at
FROM table_order to1
LEFT JOIN tables t ON to1.table_id = t.id
WHERE to1.status IN ('not_paid', 'partial')
-- AND t.restaurant_id = 1  -- Descomenta según restaurante
GROUP BY to1.status, t.table_number, to1.total_amount, to1.paid_amount, to1.created_at
ORDER BY to1.created_at DESC;

-- ========================================
-- 3. VERIFICAR TOTAL DE PEDIDOS
-- ========================================
-- Contar todas las órdenes únicas
SELECT
    COUNT(DISTINCT to1.id) as total_pedidos,
    COUNT(DISTINCT CASE WHEN to1.status = 'paid' THEN to1.id END) as pedidos_pagados,
    COUNT(DISTINCT CASE WHEN to1.status IN ('not_paid', 'partial') THEN to1.id END) as pedidos_pendientes
FROM table_order to1
LEFT JOIN tables t ON to1.table_id = t.id
-- WHERE t.restaurant_id = 1  -- Descomenta según restaurante
;

-- ========================================
-- 4. VERIFICAR ARTÍCULO MÁS VENDIDO
-- ========================================
-- Top 5 artículos más vendidos
SELECT
    do1.item as nombre_item,
    COUNT(do1.id) as cantidad_ordenes,
    SUM(do1.quantity) as unidades_totales,
    SUM(do1.price * do1.quantity) as ingresos_por_item
FROM dish_order do1
JOIN user_order uo ON do1.user_order_id = uo.id
JOIN table_order to1 ON uo.table_order_id = to1.id
JOIN tables t ON to1.table_id = t.id
WHERE do1.payment_status = 'paid'
-- AND t.restaurant_id = 1  -- Descomenta según restaurante
GROUP BY do1.item
ORDER BY unidades_totales DESC
LIMIT 5;

-- ========================================
-- 5. VERIFICAR DATOS POR FECHA
-- ========================================
-- Ventas por día (últimos 30 días)
SELECT
    DATE(to1.created_at) as fecha,
    COUNT(*) as ordenes_del_dia,
    SUM(CASE WHEN to1.status = 'paid' THEN to1.total_amount ELSE 0 END) as ingresos_del_dia
FROM table_order to1
LEFT JOIN tables t ON to1.table_id = t.id
WHERE to1.created_at >= CURRENT_DATE - INTERVAL '30 days'
-- AND t.restaurant_id = 1  -- Descomenta según restaurante
GROUP BY DATE(to1.created_at)
ORDER BY fecha DESC;

-- ========================================
-- 6. VERIFICAR ESTRUCTURA DE DATOS
-- ========================================
-- Ver ejemplos de registros para entender la estructura
SELECT
    'table_order' as tabla,
    to1.id,
    to1.status,
    to1.total_amount,
    to1.created_at,
    t.restaurant_id,
    t.table_number
FROM table_order to1
LEFT JOIN tables t ON to1.table_id = t.id
LIMIT 5;

-- ========================================
-- 7. VERIFICAR RELACIONES USUARIOS
-- ========================================
-- Ver si hay usuarios asociados a las órdenes
SELECT
    COUNT(*) as total_user_orders,
    COUNT(CASE WHEN uo.user_id IS NOT NULL THEN 1 END) as con_usuario_registrado,
    COUNT(CASE WHEN uo.guest_name IS NOT NULL THEN 1 END) as con_invitado
FROM user_order uo
JOIN table_order to1 ON uo.table_order_id = to1.id
JOIN tables t ON to1.table_id = t.id
-- WHERE t.restaurant_id = 1  -- Descomenta según restaurante
;

-- ========================================
-- 8. VERIFICAR DATOS DE GÉNERO Y EDAD
-- ========================================
-- Ver distribución de género y edad en usuarios
SELECT
    u.gender,
    CASE
        WHEN u.age BETWEEN 18 AND 25 THEN '18-25'
        WHEN u.age BETWEEN 26 AND 35 THEN '26-35'
        WHEN u.age BETWEEN 36 AND 45 THEN '36-45'
        WHEN u.age >= 46 THEN '46+'
        ELSE 'No especificado'
    END as rango_edad,
    COUNT(*) as total_ordenes
FROM user_order uo
JOIN table_order to1 ON uo.table_order_id = to1.id
JOIN tables t ON to1.table_id = t.id
LEFT JOIN users u ON uo.user_id = u.clerk_user_id
-- WHERE t.restaurant_id = 1  -- Descomenta según restaurante
GROUP BY u.gender,
    CASE
        WHEN u.age BETWEEN 18 AND 25 THEN '18-25'
        WHEN u.age BETWEEN 26 AND 35 THEN '26-35'
        WHEN u.age BETWEEN 36 AND 45 THEN '36-45'
        WHEN u.age >= 46 THEN '46+'
        ELSE 'No especificado'
    END
ORDER BY u.gender, rango_edad;

-- ========================================
-- INSTRUCCIONES DE USO:
-- ========================================
-- 1. Copia y pega estos queries uno por uno en Supabase SQL Editor
-- 2. Descomenta las líneas con restaurant_id si quieres filtrar por restaurante específico
-- 3. Cambia el número "1" por el ID de tu restaurante
-- 4. Compara los resultados con lo que ves en el dashboard
-- 5. Si los números no coinciden, hay que revisar las funciones SQL