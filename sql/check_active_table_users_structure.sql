-- Query to check the structure of active_table_users table
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'active_table_users'
ORDER BY ordinal_position;

-- Check existing constraints
SELECT
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'active_table_users'::regclass;
