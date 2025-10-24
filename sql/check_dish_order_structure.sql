-- Script para verificar la estructura exacta de la tabla dish_order
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'dish_order'
AND table_schema = 'public'
ORDER BY ordinal_position;