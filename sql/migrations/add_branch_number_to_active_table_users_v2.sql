-- ===============================================
-- MIGRATION: Add branch_number to active_table_users (Version 2)
-- ===============================================
-- This migration adds branch_number and restaurant_id columns to active_table_users table
-- and creates composite foreign key to branches table for referential integrity

-- Step 1: Add restaurant_id column if it doesn't exist
ALTER TABLE active_table_users
ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;

-- Step 2: Add branch_number column if it doesn't exist
ALTER TABLE active_table_users
ADD COLUMN IF NOT EXISTS branch_number INTEGER;

-- Step 3: Drop old constraints (if they exist)
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS unique_user_per_table;
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS fk_active_table_users_branch;
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS unique_user_per_restaurant_branch_table;

-- Step 4: Update existing records to have default values
UPDATE active_table_users
SET restaurant_id = 1
WHERE restaurant_id IS NULL;

UPDATE active_table_users
SET branch_number = 1
WHERE branch_number IS NULL;

-- Step 5: Make columns NOT NULL
ALTER TABLE active_table_users
ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE active_table_users
ALTER COLUMN branch_number SET NOT NULL;

-- Step 6: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_active_table_users_restaurant_branch
ON active_table_users (restaurant_id, branch_number);

-- Step 7: Add composite foreign key to branches table
ALTER TABLE active_table_users
ADD CONSTRAINT fk_active_table_users_branch
FOREIGN KEY (restaurant_id, branch_number)
REFERENCES branches(restaurant_id, branch_number)
ON DELETE CASCADE;

-- Step 8: Create new unique constraint with restaurant_id and branch_number
ALTER TABLE active_table_users
ADD CONSTRAINT unique_user_per_restaurant_branch_table
UNIQUE (restaurant_id, branch_number, table_number, user_id, guest_name);

-- Success!
SELECT 'Migration completed: add_branch_number_to_active_table_users' as status;
