-- ===============================================
-- PART 1: Add columns to active_table_users
-- ===============================================

ALTER TABLE active_table_users ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;
ALTER TABLE active_table_users ADD COLUMN IF NOT EXISTS branch_number INTEGER;

-- Drop old constraints
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS unique_user_per_table;
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS fk_active_table_users_branch;
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS unique_user_per_restaurant_branch_table;

-- Update data
UPDATE active_table_users SET restaurant_id = 1 WHERE restaurant_id IS NULL;
UPDATE active_table_users SET branch_number = 1 WHERE branch_number IS NULL;

-- Set NOT NULL
ALTER TABLE active_table_users ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE active_table_users ALTER COLUMN branch_number SET NOT NULL;

SELECT 'Part 1 completed: Columns added and populated' as status;
